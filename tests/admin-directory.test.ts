import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbErrorMessage } from '../src/admin/dbErrors';
import {
  COACH_CONFIG,
  TEAM_CONFIG,
  bindRawOpponent,
  dirDraft,
  ensureTeam,
  isDirDirty,
  newDirKey,
  rawOpponents,
  saveDir,
  validateDir,
  type DirRecord,
} from '../src/admin/directory';
import { migratedDb, pgliteWriter } from './db';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into season (id, label, start_year, end_year) values (1, '2008', 2008, 2008), (2, '2011/12', 2011, 2012);
    insert into team (id, name, city) values (1, 'Иртыш', 'Омск'), (2, 'Урал', null);
    insert into coach (id, full_name, short_name) values (1, 'Игорь Беляев', 'Игорь Беляев');
    insert into match (id, season_id, competition_id, seq, opponent_raw, opponent_id, coach_id) values
      (1, 1, 1, 1, 'Динамо', null, 1), (2, 1, 1, 2, 'Рубин', null, null), (3, 2, 1, 1, 'Динамо', null, null),
      (4, 2, 1, 2, 'Динамо', 2, null), (5, 2, 1, 3, null, 1, null);
    select setval(pg_get_serial_sequence('team', 'id'), 2);
    select setval(pg_get_serial_sequence('coach', 'id'), 1);
  `);
}, 60_000);

const load = async (table: 'team' | 'coach') =>
  (await db.query<DirRecord>(table === 'team' ? 'select id, name, city, notes from team order by id' : 'select id, full_name, short_name, birth_date::text, notes from coach order by id')).rows;

describe('справочники', () => {
  it('тренер: короткое имя, дата рождения; новый — заводится', async () => {
    const records = await load('coach');
    const draft = dirDraft(records, COACH_CONFIG);
    expect(isDirDirty(draft, records, COACH_CONFIG)).toBe(false);
    draft[0] = { ...draft[0], values: { ...draft[0].values, short_name: 'Беляев', birth_date: '1975-01-09' } };
    draft.push({ key: newDirKey(), id: null, values: { short_name: 'Рахимов', full_name: '', birth_date: '', notes: '' } });
    expect(validateDir(draft, COACH_CONFIG)).toEqual(['Строка 2: заполните «Полное имя».']);
    draft[1].values.full_name = 'Рашид Рахимов';
    const out = await saveDir(pgliteWriter(db), COACH_CONFIG, records, draft);
    expect(out.error).toBeNull();
    expect(await load('coach')).toEqual([
      { id: 1, full_name: 'Игорь Беляев', short_name: 'Беляев', birth_date: '1975-01-09', notes: null },
      { id: 2, full_name: 'Рашид Рахимов', short_name: 'Рахимов', birth_date: null, notes: null },
    ]);
  });

  it('соперник: одинаковые названия — ошибка; удалить клуб с матчами нельзя — понятной ошибкой', async () => {
    const records = await load('team');
    const draft = dirDraft(records, TEAM_CONFIG);
    expect(validateDir([...draft, { key: newDirKey(), id: null, values: { name: 'иртыш ', city: '', notes: '' } }], TEAM_CONFIG)).toEqual([
      '«Иртыш» записан дважды — названия в справочнике не должны совпадать.',
    ]);
    const out = await saveDir(pgliteWriter(db), TEAM_CONFIG, records, draft.filter((d) => d.id !== 1));
    expect(dbErrorMessage(out.error)).toBe('Удалить нельзя: на эту запись ссылаются матчи.');
  });

  it('соперники из Excel: по числу матчей, с сезонами; привязка — только непривязанных', async () => {
    const rows = (await db.query<{ opponent_raw: string; season: { label: string; start_year: number } }>(`
      select m.opponent_raw, json_build_object('label', s.label, 'start_year', s.start_year) season
      from match m join season s on s.id = m.season_id where m.opponent_id is null`)).rows;
    expect(rawOpponents(rows)).toEqual([
      { raw: 'Динамо', matches: 2, seasons: ['2008', '2011/12'] },
      { raw: 'Рубин', matches: 1, seasons: ['2008'] },
    ]);
    const w = pgliteWriter(db);
    const teams = (await load('team')).map((t) => ({ id: t.id, name: String(t.name) }));
    const { team, created } = await ensureTeam(w, teams, ' Динамо  Москва ');
    expect(created).toBe(true);
    expect(team.name).toBe('Динамо Москва');
    await bindRawOpponent(w, 'Динамо', team.id);
    const matches = (await db.query('select id, opponent_id, opponent_raw from match order by id')).rows;
    expect(matches).toEqual([
      { id: 1, opponent_id: team.id, opponent_raw: 'Динамо' },
      { id: 2, opponent_id: null, opponent_raw: 'Рубин' },
      { id: 3, opponent_id: team.id, opponent_raw: 'Динамо' },
      // уже привязанный вручную к другому клубу — не трогаем
      { id: 4, opponent_id: 2, opponent_raw: 'Динамо' },
      { id: 5, opponent_id: 1, opponent_raw: null },
    ]);
    expect((await ensureTeam(w, [...teams, team], 'урал')).created).toBe(false);
  });
});
