import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbErrorMessage } from '../src/admin/dbErrors';
import {
  isTransfersDirty,
  newTransferKey,
  saveTransfers,
  transferValues,
  transfersDraft,
  validateTransfers,
  windowByDate,
  type TransferBase,
  type TransferDraft,
  type TransferRecord,
} from '../src/admin/transfers';
import type { Writer } from '../src/admin/writer';
import { migratedDb, pgliteWriter } from './db';

let db: PGlite;
const names = (id: number) => `Игрок ${id}`;
const season = { id: 1, label: '2011/12', start_year: 2011, end_year: 2012 };

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into season (id, label, start_year, end_year) values (1, '2011/12', 2011, 2012);
    insert into player (id, display_name, last_name) select g, 'И' || g, 'И' || g from generate_series(1, 4) g;
    insert into team (id, name) values (1, 'Урал'), (2, 'Динамо Москва');
    insert into transfer (id, player_id, season_id, direction, transfer_window, other_team_raw) values
      (1, 1, 1, 'out', 'winter', null), (2, 2, 1, 'in', 'summer', 'Динамо'), (3, 3, 1, 'in', 'winter', null);
    select setval(pg_get_serial_sequence('transfer', 'id'), 3);
  `);
}, 60_000);

async function loadBase(): Promise<TransferBase> {
  const transfers = (await db.query<{ j: TransferRecord }>('select to_json(t) j from transfer t where season_id = 1')).rows.map((r) => {
    const { created_at, updated_at, ...rest } = r.j as TransferRecord & { created_at: string; updated_at: string };
    void created_at;
    void updated_at;
    return rest;
  });
  const teams = (await db.query<{ id: number; name: string }>('select id, name from team')).rows;
  return { season, transfers, teams };
}

describe('трансферы сезона', () => {
  it('порядок: в сезоне «осень — весна» летнее окно раньше зимнего, приходы раньше уходов', async () => {
    const draft = transfersDraft(await loadBase());
    expect(draft.map((d) => [d.id, d.transfer_window, d.direction, d.club])).toEqual([
      [2, 'summer', 'in', 'Динамо'],
      [3, 'winter', 'in', ''],
      [1, 'winter', 'out', ''],
    ]);
  });

  it('окно по дате и клуб: из справочника — id, текст из Excel остаётся; незнакомый — текстом', async () => {
    expect(windowByDate('2012-01-31')).toBe('winter');
    expect(windowByDate('2011-07-10')).toBe('summer');
    expect(windowByDate('2011-11-01')).toBeNull();
    const base = await loadBase();
    const d = transfersDraft(base)[0];
    expect(transferValues({ ...d, club: 'динамо москва' }, base)).toMatchObject({ other_team_id: 2, other_team_raw: 'Динамо' });
    expect(transferValues({ ...d, club: 'Спартак' }, base)).toMatchObject({ other_team_id: null, other_team_raw: 'Спартак' });
    expect(transferValues({ ...d, club: '' }, base)).toMatchObject({ other_team_id: null, other_team_raw: null });
    // клуб текстом совпал с клубом справочника, но поле не трогали — как было, правок нет
    const sameAsTeam = { ...base, transfers: base.transfers.map((t) => (t.id === 2 ? { ...t, other_team_raw: 'Урал' } : t)) };
    const untouched = transfersDraft(sameAsTeam);
    expect(transferValues(untouched.find((x) => x.id === 2)!, sameAsTeam)).toMatchObject({ other_team_id: null, other_team_raw: 'Урал' });
    expect(isTransfersDirty(untouched, sameAsTeam)).toBe(false);
  });

  it('проверки: игрок обязателен, дата далеко от сезона, двойная запись', async () => {
    const base = await loadBase();
    const draft: TransferDraft[] = [
      ...transfersDraft(base),
      { key: newTransferKey(), id: null, player_id: '', direction: 'in', transfer_window: '', transfer_date: '', kind: '', club: '', notes: '' },
      { key: newTransferKey(), id: null, player_id: '3', direction: 'in', transfer_window: 'winter', transfer_date: '2015-01-10', kind: '', club: '', notes: '' },
    ];
    const { errors, warnings } = validateTransfers(draft, base, names);
    expect(errors).toEqual(['Строка 4: выберите игрока.']);
    expect(warnings).toEqual(['Игрок 3: дата 10.01.2015 — далеко от сезона 2011/12.', 'Игрок 3: приход в одном окне записан 2 раза.']);
  });

  it('сохранение: правка, удаление, новый; повтор после сбоя без дублей', async () => {
    const base = await loadBase();
    let draft = transfersDraft(base);
    draft = draft
      .filter((d) => d.id !== 3)
      .map((d) => (d.id === 2 ? { ...d, transfer_date: '2011-07-15', kind: 'loan' as const, club: 'Динамо Москва' } : d));
    draft.push({ key: newTransferKey(), id: null, player_id: '4', direction: 'out', transfer_window: 'winter', transfer_date: '2012-02-01', kind: 'permanent', club: 'Урал', notes: 'за 1 млн' });
    expect(isTransfersDirty(draft, base)).toBe(true);

    const real = pgliteWriter(db);
    // связь оборвалась на изменении: удаление уже прошло
    const flaky: Writer = { ...real, upsert: () => Promise.reject(new TypeError('Failed to fetch')) };
    const failed = await saveTransfers(flaky, base, draft);
    expect(dbErrorMessage(failed.error)).toBe('Нет связи с базой: неизвестно, успело ли записаться. Проверьте интернет и нажмите «Сохранить» ещё раз — записанное не задвоится.');
    const retry = await saveTransfers(real, failed.base, failed.draft);
    expect(retry.error).toBeNull();

    const rows = (await db.query('select id, player_id, direction, transfer_window, transfer_date::text d, kind, other_team_id, other_team_raw, notes from transfer order by id')).rows;
    expect(rows).toEqual([
      { id: 1, player_id: 1, direction: 'out', transfer_window: 'winter', d: null, kind: null, other_team_id: null, other_team_raw: null, notes: null },
      { id: 2, player_id: 2, direction: 'in', transfer_window: 'summer', d: '2011-07-15', kind: 'loan', other_team_id: 2, other_team_raw: 'Динамо', notes: null },
      { id: 4, player_id: 4, direction: 'out', transfer_window: 'winter', d: '2012-02-01', kind: 'permanent', other_team_id: 1, other_team_raw: null, notes: 'за 1 млн' },
    ]);
    const after = await loadBase();
    expect(isTransfersDirty(transfersDraft(after), after)).toBe(false);
  });
});
