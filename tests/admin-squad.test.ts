import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbErrorMessage } from '../src/admin/dbErrors';
import {
  isSquadDirty,
  newTempId,
  saveSquad,
  squadDraft,
  validateSquad,
  type SquadBase,
  type SquadPlayerInfo,
  type SquadRecord,
} from '../src/admin/squad';
import type { Row, Writer } from '../src/admin/writer';
import { migratedDb, pgliteWriter } from './db';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into season (id, label, start_year, end_year) values (1, '2008', 2008, 2008);
    insert into player (id, display_name, last_name, academy) values
      (1, 'Нарубин', 'Нарубин', false), (2, 'Пеев', 'Пеев', false), (3, 'Кушев', 'Кушев', true), (4, 'Волков', 'Волков', false);
    insert into squad_member (season_id, player_id, shirt_number, position, sort_order) values
      (1, 1, 1, 'GK', 1), (1, 2, 7, 'MF', 2), (1, 3, 29, 'FW', 3);
    insert into match (id, season_id, competition_id, seq, opponent_raw) values (1, 1, 1, 1, 'Химки');
    insert into appearance (match_id, player_id, role, minutes) values (1, 1, 'start', 90);
    select setval(pg_get_serial_sequence('player', 'id'), 4);
  `);
}, 60_000);

async function loadBase(): Promise<SquadBase> {
  const rows = (await db.query<SquadRecord>('select season_id, player_id, shirt_number, position, squad_group, on_loan, sort_order from squad_member where season_id = 1')).rows;
  const players = (await db.query<SquadPlayerInfo>(`select id, display_name, last_name, first_name, null as birth_date, '{}'::text[] as seasons from player`)).rows;
  return { seasonId: 1, rows, players: new Map(players.map((p) => [p.id, p])), inMatches: new Set([1]) };
}

describe('заявка сезона', () => {
  it('черновик — в порядке заявки, без правок сохранять нечего', async () => {
    const base = await loadBase();
    const draft = squadDraft(base);
    expect(draft.map((r) => [r.player_id, r.shirt_number, r.position])).toEqual([
      [1, '1', 'GK'],
      [2, '7', 'MF'],
      [3, '29', 'FW'],
    ]);
    expect(isSquadDirty(draft, base)).toBe(false);
  });

  it('проверки: номер, фамилия нового, удаление сыгравшего, одинаковые номера', async () => {
    const base = await loadBase();
    const draft = squadDraft(base).filter((r) => r.player_id !== 1);
    draft[0] = { ...draft[0], shirt_number: '100' };
    draft.push({ player_id: newTempId(), shirt_number: '29', position: '', squad_group: 'youth', on_loan: false, newPlayer: { last_name: ' ', first_name: '', display_name: '' } });
    const { errors, warnings } = validateSquad(draft, base);
    expect(errors).toEqual([
      'Пеев: номер — от 1 до 99.',
      'У нового игрока нужна фамилия.',
      'Нарубин: есть матчи этого сезона — сначала уберите его из составов (сетка или карточки матчей).',
    ]);
    expect(warnings).toEqual(['Номер 29 у нескольких: Кушев, новый игрок.']);
  });

  it('сохранение: новый игрок, порядок, правки, удаление; «воспитанник» заявка не трогает; повтор после сбоя без дублей', async () => {
    const base = await loadBase();
    let draft = squadDraft(base);
    // Кушева убрали, Пеев — первым и в аренде, Волков из базы — в молодёжь, новый игрок — без отметки «воспитанник»
    draft = [
      { ...draft[1], on_loan: true, shirt_number: '10' },
      draft[0],
      { player_id: 4, shirt_number: '', position: 'DF', squad_group: 'youth', on_loan: false },
      { player_id: newTempId(), shirt_number: '33', position: 'FW', squad_group: 'main', on_loan: false, newPlayer: { last_name: 'Комаров', first_name: 'Илья', display_name: '' } },
    ];
    expect(validateSquad(draft, base).errors).toEqual([]);
    const real = pgliteWriter(db);
    const flaky: Writer = { ...real, remove: () => Promise.reject(new TypeError('Failed to fetch')) };
    const failed = await saveSquad(flaky, base, draft);
    expect(dbErrorMessage(failed.error)).toBe('Нет связи с базой: неизвестно, успело ли записаться. Проверьте интернет и нажмите «Сохранить» ещё раз — записанное не задвоится.');
    expect(failed.draft.every((r) => !r.newPlayer && r.player_id > 0)).toBe(true);

    const retry = await saveSquad(real, failed.base, failed.draft);
    expect(retry.error).toBeNull();
    const rows = (await db.query(`select p.display_name, p.first_name, p.academy, s.shirt_number, s.position, s.squad_group, s.on_loan, s.sort_order
      from squad_member s join player p on p.id = s.player_id where season_id = 1 order by sort_order`)).rows;
    expect(rows).toEqual([
      { display_name: 'Пеев', first_name: null, academy: false, shirt_number: 10, position: 'MF', squad_group: 'main', on_loan: true, sort_order: 1 },
      { display_name: 'Нарубин', first_name: null, academy: false, shirt_number: 1, position: 'GK', squad_group: 'main', on_loan: false, sort_order: 2 },
      { display_name: 'Волков', first_name: null, academy: false, shirt_number: null, position: 'DF', squad_group: 'youth', on_loan: false, sort_order: 3 },
      { display_name: 'Комаров', first_name: 'Илья', academy: false, shirt_number: 33, position: 'FW', squad_group: 'main', on_loan: false, sort_order: 4 },
    ]);
    // Кушева убрали из заявки — отметка «воспитанник» у игрока осталась
    expect((await db.query(`select academy from player where id = 3`)).rows).toEqual([{ academy: true }]);
    const players = (await db.query<{ n: number }>(`select count(*)::int n from player where last_name = 'Комаров'`)).rows;
    expect(players[0].n).toBe(1);
    const after = await loadBase();
    expect(isSquadDirty(squadDraft(after), after)).toBe(false);
  });

  it('ответ на запись нового игрока потерялся: повтор не заводит его второй раз', async () => {
    const base = await loadBase();
    const draft = [
      ...squadDraft(base),
      { player_id: newTempId(), shirt_number: '44', position: 'DF' as const, squad_group: 'main' as const, on_loan: false, newPlayer: { last_name: 'Сидоров', first_name: '', display_name: '' } },
    ];
    const real = pgliteWriter(db);
    let lost = true;
    const lossy: Writer = {
      ...real,
      insert: (async (table: string, rows: Row[], keys?: string[]) => {
        const out = await real.insert(table, rows, keys);
        if (table === 'player' && lost) {
          lost = false;
          throw new TypeError('Failed to fetch');
        }
        return out;
      }) as Writer['insert'],
    };
    const failed = await saveSquad(lossy, base, draft);
    expect(failed.error).not.toBeNull();
    // строка всё ещё «новый игрок»: карточка не узнала его id
    expect(failed.draft.some((r) => r.newPlayer)).toBe(true);
    const retry = await saveSquad(lossy, failed.base, failed.draft);
    expect(retry.error).toBeNull();
    expect((await db.query<{ n: number }>(`select count(*)::int n from player where last_name = 'Сидоров'`)).rows[0].n).toBe(1);
  });

  it('итоги сезона из Excel не дают убрать игрока — понятной ошибкой', async () => {
    await db.exec(`insert into player_season_totals (season_id, player_id, competition_id, goals) values (1, 4, 1, 2)`);
    const base = { ...(await loadBase()), inMatches: new Set<number>() };
    const draft = squadDraft(base).filter((r) => r.player_id !== 4);
    const out = await saveSquad(pgliteWriter(db), base, draft);
    expect(dbErrorMessage(out.error)).toBe('Удалить нельзя: на эту запись ссылаются итоги сезонов.');
  });
});
