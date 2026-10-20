import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbErrorMessage } from '../src/admin/dbErrors';
import { SEASON_RECORD_COLUMNS, isSeasonDirty, saveSeason, seasonDraft, validateSeason, type SeasonRecord } from '../src/admin/people';
import {
  POINTS_SETTINGS_COLUMNS,
  adjustmentDraft,
  isAdjustmentsDirty,
  isPointsDirty,
  parseDecimal,
  pointsDraft,
  saveAdjustments,
  savePoints,
  validateAdjustments,
  validatePoints,
  type AdjustmentRecord,
  type PointsSettings,
} from '../src/admin/points';
import { STRANGER, migratedDb, pgliteWriter } from './db';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into season (id, label, start_year, end_year, final_place, teams_count) values (1, '2008', 2008, 2008, 4, 16), (2, '2009', 2009, 2009, 13, 16);
    insert into player (id, display_name, last_name) values (1, 'Дринчич', 'Дринчич'), (2, 'Пеев', 'Пеев');
    insert into squad_member (season_id, player_id) values (1, 1), (2, 1), (1, 2);
  `);
}, 60_000);

/** Строка настроек так, как её отдаёт API: числа — числами. */
const loadSettings = async () =>
  (await db.query<{ j: PointsSettings }>(`select to_json(t) j from (select ${POINTS_SETTINGS_COLUMNS} from points_settings) t`)).rows[0].j;
const loadAdjustments = async (playerId: number) =>
  (await db.query<{ j: AdjustmentRecord }>(`select to_json(a) j from player_season_adjustment a where player_id = ${playerId} order by season_id`)).rows.map(
    (r) => r.j,
  );

describe('формула очков: числа', () => {
  it('десятичные — с запятой или точкой', () => {
    expect([parseDecimal('0,7'), parseDecimal(' 0.25 '), parseDecimal('3'), parseDecimal(''), parseDecimal('1,2,3')]).toEqual([0.7, 0.25, 3, NaN, NaN]);
  });

  it('пределы как в базе: веса, доли, курс уровня, множитель места, карьера', async () => {
    const d = pointsDraft(await loadSettings());
    expect(d.absolute_share).toBe('0,7');
    expect(validatePoints(d)).toEqual([]);
    expect(
      validatePoints({ ...d, per_90: '-1', absolute_share: '1,5', tier_rate_2: '0', place_last: '1,2', place_first: '1', peak_seasons: '2,5', per_draw: '0,333' }),
    ).toEqual([
      'За 90 минут: от 0 до 20.',
      'Ничья: не больше 2 знаков после запятой.',
      'Доля абсолютных очков: от 0 до 1.',
      'Первый дивизион: больше 0 и не больше 2.',
      'Лучших сезонов ещё раз: целое число.',
      'За первое место множитель не может быть меньше, чем за последнее.',
    ]);
    expect(validatePoints({ ...d, goal_fw: 'много' })).toEqual(['Гол нападающего: нужно число от 0 до 20.']);
    expect(d.tier_2_from).toBe('650');
    expect(validatePoints({ ...d, tier_2_from: '1000' })).toEqual(['Пороги ярусов — по убыванию: у «Пантеона» выше, чем у «Легенд», и так далее.']);
  });

  it('сохранение: одна строка, перечитанная — без изменений; посторонний не меняет', async () => {
    const s = await loadSettings();
    const d = { ...pointsDraft(s), goal_fw: '3,5', expect_range: '0,3', long_season_full: false };
    expect(isPointsDirty(d, s)).toBe(true);
    await savePoints(pgliteWriter(db), d);
    const after = await loadSettings();
    expect(after).toMatchObject({ goal_fw: 3.5, expect_range: 0.3, long_season_full: false, per_90: 1 });
    expect(isPointsDirty(pointsDraft(after), after)).toBe(false);
    await expect(savePoints(pgliteWriter(db, STRANGER), d)).rejects.toThrow(/не изменилась/);
  });
});

describe('ручные поправки к сезону игрока', () => {
  const seasons = [{ season_id: 1 }, { season_id: 2 }];
  const label = (id: number) => (id === 1 ? '2008' : '2009');

  it('поправка без комментария, комментарий без поправки, больше 5 — ошибки', () => {
    expect(
      validateAdjustments({ 1: { points: '6', comment: 'много' }, 2: { points: '', comment: 'за что?' } }, label),
    ).toEqual(['2008: поправка — от −5 до +5, не ноль, не больше одного знака после запятой.', '2009: у комментария нет поправки — укажите очки или сотрите комментарий.']);
    expect(validateAdjustments({ 1: { points: '-5', comment: ' ' }, 2: { points: '', comment: '' } }, label)).toEqual([
      '2008: напишите, за что поправка.',
    ]);
  });

  it('добавить, изменить, стереть', async () => {
    const w = pgliteWriter(db);
    let rows = await loadAdjustments(1);
    let d = adjustmentDraft(seasons, rows);
    expect(isAdjustmentsDirty(d, seasons, rows)).toBe(false);
    d = { 1: { points: '4,5', comment: 'гол «Спартаку» в концовке' }, 2: { points: '-5', comment: 'провальный сезон' } };
    expect(isAdjustmentsDirty(d, seasons, rows)).toBe(true);
    await saveAdjustments(w, 1, seasons, rows, d);
    rows = await loadAdjustments(1);
    expect(rows).toEqual([
      { season_id: 1, player_id: 1, points: 4.5, comment: 'гол «Спартаку» в концовке' },
      { season_id: 2, player_id: 1, points: -5, comment: 'провальный сезон' },
    ]);
    expect(isAdjustmentsDirty(adjustmentDraft(seasons, rows), seasons, rows)).toBe(false);
    // изменили одну, стёрли другую
    await saveAdjustments(w, 1, seasons, rows, { 1: { points: '5', comment: 'гол «Спартаку» в концовке' }, 2: { points: '', comment: '' } });
    expect(await loadAdjustments(1)).toEqual([{ season_id: 1, player_id: 1, points: 5, comment: 'гол «Спартаку» в концовке' }]);
    // поправки другого игрока не задеты, убрать игрока с поправкой из заявки нельзя
    await saveAdjustments(w, 2, [{ season_id: 1 }], [], { 1: { points: '2', comment: 'передача на последней минуте' } });
    expect(await loadAdjustments(2)).toHaveLength(1);
    const err = await w.remove('squad_member', { season_id: 1, player_id: 2 }).catch((e: unknown) => e);
    expect(dbErrorMessage(err)).toBe('Удалить нельзя: на эту запись ссылаются ручные поправки очков сезона.');
  });
});

describe('ожидаемое место сезона', () => {
  const load = async () =>
    (await db.query<SeasonRecord>(`select ${SEASON_RECORD_COLUMNS}, expected_place::float8 as expected_place from season where id = 1`)).rows[0];

  it('дробное место через запятую, не больше числа команд; без столбца в базе поле не пишется', async () => {
    const s = await load();
    const d = seasonDraft(s, []);
    expect(d.expected_place).toBe('');
    expect(validateSeason({ ...d, expected_place: '17' }, (x) => x)).toEqual(['Ожидаемое место не может быть больше числа команд.']);
    expect(validateSeason({ ...d, expected_place: '0' }, (x) => x)).toEqual([
      'Ожидаемое место — число от 1, можно с одним знаком после запятой: 2,5 — «между 2-м и 3-м».',
    ]);
    await saveSeason(pgliteWriter(db), s, [], { ...d, expected_place: '8,5' });
    const after = await load();
    expect(after.expected_place).toBe(8.5);
    expect(seasonDraft(after, []).expected_place).toBe('8,5');
    expect(isSeasonDirty(seasonDraft(after, []), after, [])).toBe(false);
    // запись без столбца: ожидаемое место не загружено — его нет и в update
    const old: SeasonRecord = { ...after };
    delete old.expected_place;
    const draftOld = seasonDraft(old, []);
    expect(draftOld.expected_place).toBe(null);
    await saveSeason(pgliteWriter(db), old, [], { ...draftOld, notes: 'без ожиданий' });
    expect((await load()).expected_place).toBe(8.5);
  });
});
