import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellKey, cellText, changedCells, gridBase, parseCell, planGrid, saveGrid } from '../src/admin/grid';
import type { AbsenceRecord, AppearanceRecord } from '../src/admin/match';
import { migratedDb, pgliteWriter } from './db';

const app = (match_id: number, player_id: number, patch: Partial<AppearanceRecord> = {}): AppearanceRecord => ({
  match_id, player_id, role: null, minutes: null, minute_on: null, minute_off: null, replaced_player_id: null,
  injured: false, sent_off: false, ...patch,
});
const names = (id: number) => `Игрок ${id}`;
const label = (id: number) => `Матч ${id}`;

describe('ячейки сетки', () => {
  it('как в таблице автора', () => {
    expect(parseCell('')).toEqual({ kind: 'none' });
    expect(parseCell(' 0 ')).toEqual({ kind: 'minutes', minutes: 0 });
    expect(parseCell('90')).toEqual({ kind: 'minutes', minutes: 90 });
    expect(parseCell('+')).toEqual({ kind: 'minutes', minutes: null });
    expect(parseCell('Т')).toEqual({ kind: 'absence', reason: 'injury' });
    expect(parseCell('д')).toEqual({ kind: 'absence', reason: 'suspension' });
    expect(parseCell('с')).toEqual({ kind: 'absence', reason: 'national_team' });
    expect(parseCell('131')).toEqual({ kind: 'invalid' });
    expect(parseCell('9о')).toEqual({ kind: 'invalid' });
    expect(cellText(app(1, 1, { minutes: 64 }), undefined)).toBe('64');
    expect(cellText(app(1, 1), undefined)).toBe('+');
    expect(cellText(undefined, { match_id: 1, player_id: 1, reason: 'national_team' })).toBe('с');
  });

  it('правка в то же значение — не изменение', () => {
    const base = gridBase([app(1, 1, { role: 'start', minutes: 64, minute_off: 64 })], []);
    expect(changedCells(base, new Map([[cellKey(1, 1), '64 ']]))).toEqual([]);
    expect(changedCells(base, new Map([[cellKey(1, 1), '70']]))).toEqual(['1:1']);
  });
});

describe('план записи сетки', () => {
  const base = gridBase(
    [
      app(1, 1, { role: 'start', minutes: 64, minute_off: 64 }),
      app(1, 2, { role: 'sub', minutes: 26, minute_on: 64, replaced_player_id: 1 }),
      app(1, 3, { role: 'bench', minutes: 0 }),
    ],
    [{ match_id: 1, player_id: 4, reason: 'injury' }],
  );

  it('минуты: роль и замены сохраняются, 0 — запас, запас с минутами — роль неизвестна', () => {
    const plan = planGrid(
      base,
      new Map([
        [cellKey(1, 1), '60'],
        [cellKey(1, 2), '0'],
        [cellKey(1, 3), '15'],
        [cellKey(1, 5), '90'],
      ]),
      names,
      label,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.upserts).toEqual([
      app(1, 1, { role: 'start', minutes: 60, minute_off: 64 }),
      app(1, 2, { role: 'bench', minutes: 0 }),
      app(1, 3, { role: null, minutes: 15 }),
      app(1, 5, { minutes: 90 }),
    ]);
  });

  it('пропуск вместо игры и наоборот', () => {
    const plan = planGrid(base, new Map([[cellKey(1, 3), 'д'], [cellKey(1, 4), '']]), names, label);
    expect(plan.deletes).toEqual(new Map([[1, [3]]]));
    expect(plan.absenceUpserts).toEqual([{ match_id: 1, player_id: 3, reason: 'suspension' }]);
    expect(plan.absenceDeletes).toEqual(new Map([[1, [4]]]));
  });

  it('заменённого не убрать из заявки, непонятное — ошибка', () => {
    const plan = planGrid(base, new Map([[cellKey(1, 1), ''], [cellKey(1, 3), 'x']]), names, label);
    expect(plan.errors).toEqual([
      'Матч 1, Игрок 3: «x» — непонятно. Число минут, 0, «+», т, д или с.',
      'Матч 1: Игрок 2 вышел вместо Игрок 1 — сначала уберите эту замену в карточке матча.',
    ]);
    // а вместе с заменившим — можно
    expect(planGrid(base, new Map([[cellKey(1, 1), ''], [cellKey(1, 2), '']]), names, label).errors).toEqual([]);
  });
});

describe('запись сетки в базу', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await migratedDb();
    await db.exec(`
      insert into season (id, label, start_year, end_year) values (1, '2008', 2008, 2008);
      insert into player (id, display_name, last_name) select g, 'И' || g, 'И' || g from generate_series(1, 5) g;
      insert into match (id, season_id, competition_id, seq, opponent_raw) values (1, 1, 1, 1, 'А'), (2, 1, 1, 2, 'Б');
      insert into appearance (match_id, player_id, role, minutes, minute_off) values (1, 1, 'start', 64, 64), (1, 3, 'bench', 0, null);
      insert into appearance (match_id, player_id, role, minutes, minute_on, replaced_player_id) values (1, 2, 'sub', 26, 64, 1);
      insert into absence (match_id, player_id, reason) values (1, 4, 'injury');
    `);
  }, 60_000);

  const load = async () => {
    const a = (await db.query<AppearanceRecord>('select * from appearance order by match_id, player_id')).rows;
    const b = (await db.query<AbsenceRecord>('select * from absence order by match_id, player_id')).rows;
    return gridBase(a, b);
  };

  it('несколько матчей одним сохранением, повтор после сбоя без ошибок', async () => {
    const base = await load();
    const edits = new Map([
      [cellKey(1, 1), ''],
      [cellKey(1, 2), ''],
      [cellKey(1, 3), 'с'],
      [cellKey(1, 4), '0'],
      [cellKey(2, 1), '90'],
      [cellKey(2, 5), 'т'],
    ]);
    const plan = planGrid(base, edits, names, label);
    expect(plan.errors).toEqual([]);
    const w = pgliteWriter(db);
    // связь оборвалась на удалениях: состав уже записан
    const failed = await saveGrid({ ...w, remove: () => Promise.reject(new TypeError('Failed to fetch')) }, base, plan);
    expect(failed.error).toBeInstanceOf(TypeError);
    // 1:4 уже в запасе, но пропуск по травме ещё не удалён — ячейка всё ещё изменена
    expect(changedCells(failed.base, edits).sort()).toEqual(['1:1', '1:2', '1:3', '1:4', '2:5']);

    const retry = await saveGrid(w, failed.base, planGrid(failed.base, edits, names, label));
    expect(retry.error).toBeNull();
    const after = await load();
    expect([...after.appearances.values()].map((a) => [a.match_id, a.player_id, a.role, a.minutes])).toEqual([
      [1, 4, 'bench', 0],
      [2, 1, null, 90],
    ]);
    expect([...after.absences.values()].map((a) => [a.match_id, a.player_id, a.reason])).toEqual([
      [1, 3, 'national_team'],
      [2, 5, 'injury'],
    ]);
    expect(changedCells(after, edits)).toEqual([]);
  });
});
