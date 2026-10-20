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
  excelNames,
  isTeamNamesDirty,
  nameInYear,
  saveTeamNames,
  teamNamesDraft,
  validateTeamNames,
  isTenuresDirty,
  saveTenures,
  tenuresDraft,
  validateTenures,
  type DirRecord,
  type TeamNameRecord,
  type TenureRecord,
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

describe('названия клуба по годам', () => {
  it('выбор названия на год — как в базе', async () => {
    await db.exec(`
      insert into team (id, name) values (50, 'Урал Екатеринбург');
      insert into team_name (team_id, name, from_year, to_year) values (50, 'Уралмаш', null, 2002), (50, 'Урал-Сверд', 2003, 2003), (50, 'Урал Екб', 2001, 2001);
    `);
    const names = (await db.query<TeamNameRecord>('select * from team_name where team_id = 50')).rows;
    for (const y of [1995, 2001, 2002, 2003, 2004, 2020]) {
      const sql = (await db.query<{ n: string }>('select team_name_in(50, $1) n', [y])).rows[0].n;
      expect(nameInYear(names, y, 'Урал Екатеринбург')).toBe(sql);
    }
    expect(nameInYear(names, 2001, 'Урал Екатеринбург')).toBe('Урал Екб');
  });

  it('проверки и сохранение; подсказки из Excel с годами', async () => {
    const records = (await db.query<TeamNameRecord>('select * from team_name where team_id = 50')).rows;
    let draft = teamNamesDraft(records);
    expect(draft.map((d) => [d.name, d.from_year, d.to_year])).toEqual([
      ['Уралмаш', '', '2002'],
      ['Урал Екб', '2001', '2001'],
      ['Урал-Сверд', '2003', '2003'],
    ]);
    expect(validateTeamNames(draft).warnings).toEqual(['«Уралмаш» и «Урал Екб» пересекаются по годам — на сайте будет то, что началось позже.']);
    expect(validateTeamNames([{ key: 'k', id: null, name: ' ', from_year: '96', to_year: '' }]).errors).toEqual([
      'Строка 1: введите название.',
      'Строка 1: год — четыре цифры, например 1996.',
    ]);
    // Урал Екб убрали, Урал-Сверд продлили, добавили «Уралмаш-2»
    draft = draft.filter((d) => d.name !== 'Урал Екб').map((d) => (d.name === 'Урал-Сверд' ? { ...d, to_year: '2004' } : d));
    draft.push({ key: 'n', id: null, name: 'Уралмаш-2', from_year: '1990', to_year: '1991' });
    expect(isTeamNamesDirty(draft, records)).toBe(true);
    const out = await saveTeamNames(pgliteWriter(db), 50, records, draft);
    expect(out.error).toBeNull();
    const after = (await db.query('select name, from_year, to_year from team_name where team_id = 50 order by from_year nulls first')).rows;
    expect(after).toEqual([
      { name: 'Уралмаш', from_year: null, to_year: 2002 },
      { name: 'Уралмаш-2', from_year: 1990, to_year: 1991 },
      { name: 'Урал-Сверд', from_year: 2003, to_year: 2004 },
    ]);
    const fresh = (await db.query<TeamNameRecord>('select * from team_name where team_id = 50')).rows;
    expect(isTeamNamesDirty(teamNamesDraft(fresh), fresh)).toBe(false);

    expect(
      excelNames([
        { opponent_raw: 'Урал', season: { start_year: 2005 } },
        { opponent_raw: 'Уралмаш', season: { start_year: 1996 } },
        { opponent_raw: 'Уралмаш', season: { start_year: 2001 } },
        { opponent_raw: 'Урал', season: { start_year: 2017 } },
      ]),
    ).toEqual([
      { raw: 'Уралмаш', first: 1996, last: 2001, matches: 2 },
      { raw: 'Урал', first: 2005, last: 2017, matches: 2 },
    ]);
  });
});

describe('сроки тренера', () => {
  const loadTenures = async () =>
    (await db.query<TenureRecord>('select id, coach_id, from_date::text, to_date::text from coach_tenure where coach_id = 1 order by from_date')).rows;

  it('проверки: формат дат, увольнение не раньше назначения; пересечение и два «работает сейчас» — предупреждения', () => {
    const d = (from_date: string, to_date = '') => ({ key: newDirKey(), id: null, from_date, to_date });
    expect(validateTenures([d('2026-06-24'), d('24.06.2026'), d('2026-06-24', '2026-01-01')]).errors).toEqual([
      'Срок 2: дата назначения — в формате ГГГГ-ММ-ДД.',
      'Срок 3: увольнение раньше назначения.',
    ]);
    expect(validateTenures([d('2006-09-07', '2007-12-05'), d('2007-06-01', '2008-01-01'), d('2009-09-02'), d('2026-06-24')]).warnings).toEqual([
      'Сроки с 2006-09-07 и с 2007-06-01 пересекаются.',
      'Сроки с 2009-09-02 и с 2026-06-24 пересекаются.',
      'Без даты увольнения больше одного срока — «работает сейчас» должен быть один.',
    ]);
  });

  it('сохранение: добавить, поправить, убрать; повтор без изменений', async () => {
    let records = await loadTenures();
    let draft = [...tenuresDraft(records), { key: newDirKey(), id: null, from_date: '2025-09-09', to_date: '2026-06-23' }, { key: newDirKey(), id: null, from_date: '2026-06-24', to_date: '' }];
    expect(isTenuresDirty(draft, records)).toBe(true);
    let out = await saveTenures(pgliteWriter(db), 1, records, draft);
    expect(out.error).toBeNull();
    records = await loadTenures();
    expect(records.map((r) => [r.from_date, r.to_date])).toEqual([
      ['2025-09-09', '2026-06-23'],
      ['2026-06-24', null],
    ]);
    expect(isTenuresDirty(out.draft, records)).toBe(false);

    // первый срок убрали, у второго появилась дата увольнения
    draft = tenuresDraft(records).slice(1).map((x) => ({ ...x, to_date: '2026-12-31' }));
    out = await saveTenures(pgliteWriter(db), 1, records, draft);
    expect(out.error).toBeNull();
    expect((await loadTenures()).map((r) => [r.from_date, r.to_date])).toEqual([['2026-06-24', '2026-12-31']]);
  });
});
