// Очки сезона: числа формулы (points_settings) и ручные поправки автора к сезону игрока.
// Сама формула считается во view player_season_points (миграция 20261020200000) — здесь только правка чисел.
import { TIER_NAMES } from '../pyramid';
import type { Writer } from './writer';

const TIER_KEYS = ['tier_1_from', 'tier_2_from', 'tier_3_from', 'tier_4_from', 'tier_5_from'] as const;

// ===========================================================================
// Числа формулы
// ===========================================================================

/** Числовые поля points_settings. */
export const POINTS_NUMBER_KEYS = [
  'per_90', 'per_start', 'goal_gk', 'goal_df', 'goal_mf', 'goal_fw', 'per_assist',
  'clean_gk', 'clean_df', 'clean_mf', 'clean_fw', 'per_win', 'per_draw',
  'absolute_share', 'tier_rate_1', 'tier_rate_2', 'tier_rate_3', 'tier_rate_4', 'short_season_power',
  'place_last', 'place_first', 'expect_range',
  'peak_seasons', 'peak_weight',
  'tier_1_from', 'tier_2_from', 'tier_3_from', 'tier_4_from', 'tier_5_from',
] as const;
export type PointsNumberKey = (typeof POINTS_NUMBER_KEYS)[number];

export type PointsSettings = Record<PointsNumberKey, number> & { long_season_full: boolean };

export const POINTS_SETTINGS_COLUMNS = [...POINTS_NUMBER_KEYS, 'long_season_full'].join(', ');

interface FieldSpec {
  label: string;
  min: number;
  max: number;
  /** Знаков после запятой — как у столбца в базе. */
  digits: number;
  /** Минимум не включается: курс уровня лиги и множитель за место больше нуля. */
  above?: boolean;
  note?: string;
}

const weight = (label: string): FieldSpec => ({ label, min: 0, max: 20, digits: 2 });
const share = (label: string, note?: string): FieldSpec => ({ label, min: 0, max: 1, digits: 3, note });
const tierRate = (label: string): FieldSpec => ({ label, min: 0, max: 2, digits: 3, above: true });
const tierFrom = (name: string): FieldSpec => ({ label: `«${name}» — от`, min: 0, max: 10000, digits: 1 });

export const POINTS_FIELDS: Record<PointsNumberKey, FieldSpec> = {
  per_90: weight('За 90 минут'),
  per_start: weight('За старт'),
  goal_gk: weight('Гол вратаря'),
  goal_df: weight('Гол защитника'),
  goal_mf: weight('Гол полузащитника'),
  goal_fw: weight('Гол нападающего'),
  per_assist: weight('Передача'),
  clean_gk: weight('«Сухой» — вратарь'),
  clean_df: weight('«Сухой» — защитник'),
  clean_mf: weight('«Сухой» — полузащитник'),
  clean_fw: weight('«Сухой» — нападающий'),
  per_win: weight('Победа'),
  per_draw: weight('Ничья'),
  absolute_share: share('Доля абсолютных очков', '0,7 — 70 % абсолютных, остальное — «лучший в сезоне = 100»'),
  tier_rate_1: tierRate('Премьер-лига'),
  tier_rate_2: tierRate('Первая лига'),
  tier_rate_3: tierRate('Вторая лига и её «А»'),
  tier_rate_4: tierRate('Третья лига и вторая «Б»'),
  short_season_power: share('Короткий сезон тянуть к 30 турам', '0 — не тянуть, 1 — полностью (12 туров ×2,5), 0,5 — наполовину'),
  place_last: { label: 'За последнее место', min: 0, max: 3, digits: 3, above: true },
  place_first: { label: 'За первое место', min: 0, max: 3, digits: 3, above: true },
  expect_range: share('Ожидания', '0,25 — ±25 %, если команда финишировала на всю таблицу выше или ниже ожидаемого места'),
  peak_seasons: { label: 'Лучших сезонов ещё раз', min: 0, max: 10, digits: 0 },
  peak_weight: { label: 'С весом', min: 0, max: 5, digits: 2 },
  tier_1_from: tierFrom(TIER_NAMES[0]),
  tier_2_from: tierFrom(TIER_NAMES[1]),
  tier_3_from: tierFrom(TIER_NAMES[2]),
  tier_4_from: tierFrom(TIER_NAMES[3]),
  tier_5_from: tierFrom(TIER_NAMES[4]),
};

/** Группы полей формы — в порядке формулы. */
export const POINTS_GROUPS: { title: string; note: string; keys: PointsNumberKey[] }[] = [
  {
    title: 'Сырые очки сезона',
    note: 'Все официальные матчи. «Сухие» матчи и результат — когда игрок провёл на поле 45+ минут.',
    keys: ['per_90', 'per_start', 'goal_gk', 'goal_df', 'goal_mf', 'goal_fw', 'per_assist', 'clean_gk', 'clean_df', 'clean_mf', 'clean_fw', 'per_win', 'per_draw'],
  },
  {
    title: 'Шкала сезона',
    note: 'Абсолютные очки: средний лидер сезона = 100. Курс уровня лиги — только для абсолютной части.',
    keys: ['absolute_share', 'tier_rate_1', 'tier_rate_2', 'tier_rate_3', 'tier_rate_4', 'short_season_power'],
  },
  {
    title: 'Множитель команды',
    note: 'Место в лиге — от множителя за последнее до множителя за первое; 1 и 1 — место не учитывается. Ожидаемое место — на вкладке «Сезон».',
    keys: ['place_last', 'place_first', 'expect_range'],
  },
  {
    title: 'Ценность за карьеру',
    note: 'Сумма очков всех сезонов плюс лучшие сезоны ещё раз с этим весом.',
    keys: ['peak_seasons', 'peak_weight'],
  },
  {
    title: 'Ярусы Амкаровской пирамиды',
    note: 'С какого рейтинга карьеры начинается ярус; ниже последнего порога — вне пирамиды.',
    keys: ['tier_1_from', 'tier_2_from', 'tier_3_from', 'tier_4_from', 'tier_5_from'],
  },
];

export type PointsDraft = Record<PointsNumberKey, string> & { long_season_full: boolean };

/** Число для поля ввода: с запятой, как пишут по-русски. */
export const decimalText = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** «0,7», «0.7», « 2 » → число; пусто или не число — NaN. */
export function parseDecimal(s: string) {
  const t = s.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function pointsDraft(s: PointsSettings): PointsDraft {
  const draft = Object.fromEntries(POINTS_NUMBER_KEYS.map((k) => [k, decimalText(s[k])])) as Record<PointsNumberKey, string>;
  return { ...draft, long_season_full: s.long_season_full };
}

function pointsValues(d: PointsDraft): PointsSettings {
  const values = Object.fromEntries(POINTS_NUMBER_KEYS.map((k) => [k, parseDecimal(d[k])])) as Record<PointsNumberKey, number>;
  return { ...values, long_season_full: d.long_season_full };
}

const decimals = (s: string) => s.trim().replace(',', '.').split('.')[1]?.length ?? 0;

export function validatePoints(d: PointsDraft) {
  const errors: string[] = [];
  for (const k of POINTS_NUMBER_KEYS) {
    const f = POINTS_FIELDS[k];
    const n = parseDecimal(d[k]);
    const range = f.above
      ? `больше ${decimalText(f.min)} и не больше ${decimalText(f.max)}`
      : `от ${decimalText(f.min)} до ${decimalText(f.max)}`;
    if (Number.isNaN(n)) errors.push(`${f.label}: нужно число ${range}.`);
    else if (n > f.max || (f.above ? n <= f.min : n < f.min)) errors.push(`${f.label}: ${range}.`);
    else if (decimals(d[k]) > f.digits) {
      errors.push(f.digits === 0 ? `${f.label}: целое число.` : `${f.label}: не больше ${f.digits} знаков после запятой.`);
    }
  }
  const [last, first] = [parseDecimal(d.place_last), parseDecimal(d.place_first)];
  if (!Number.isNaN(last) && !Number.isNaN(first) && first < last) errors.push('За первое место множитель не может быть меньше, чем за последнее.');
  const tiers = TIER_KEYS.map((k) => parseDecimal(d[k]));
  if (tiers.every((n) => !Number.isNaN(n)) && tiers.some((n, i) => i > 0 && n >= tiers[i - 1])) {
    errors.push('Пороги ярусов — по убыванию: у «Пантеона» выше, чем у «Легенд», и так далее.');
  }
  return errors;
}

export const isPointsDirty = (d: PointsDraft, s: PointsSettings) => JSON.stringify(pointsValues(d)) !== JSON.stringify(pointsValues(pointsDraft(s)));

/** Числа формулы — одна строка, одним update. */
export async function savePoints(w: Writer, d: PointsDraft) {
  await w.update('points_settings', { ...pointsValues(d) }, { id: 1 });
}

// ===========================================================================
// Ручные поправки к сезону игрока
// ===========================================================================

export interface AdjustmentRecord {
  season_id: number;
  player_id: number;
  points: number;
  comment: string;
}

/** Сезон игрока в карточке: очки по формуле (если view уже есть) и место среди игроков сезона. */
export interface PlayerSeasonPoints {
  season_id: number;
  label: string;
  start_year: number;
  points: number | null;
  season_rank: number | null;
}

/** Сезон → поправка и комментарий; пустые поля — поправки нет. */
export type AdjustmentDraft = Record<number, { points: string; comment: string }>;

export function adjustmentDraft(seasons: { season_id: number }[], rows: AdjustmentRecord[]): AdjustmentDraft {
  return Object.fromEntries(
    seasons.map((s) => {
      const r = rows.find((x) => x.season_id === s.season_id);
      return [s.season_id, { points: r ? decimalText(r.points) : '', comment: r?.comment ?? '' }];
    }),
  );
}

export function validateAdjustments(d: AdjustmentDraft, labelOf: (seasonId: number) => string) {
  const errors: string[] = [];
  for (const [id, a] of Object.entries(d)) {
    const label = labelOf(Number(id));
    if (!a.points.trim()) {
      if (a.comment.trim()) errors.push(`${label}: у комментария нет поправки — укажите очки или сотрите комментарий.`);
      continue;
    }
    const n = parseDecimal(a.points);
    if (Number.isNaN(n) || n < -5 || n > 5 || n === 0 || decimals(a.points) > 1) {
      errors.push(`${label}: поправка — от −5 до +5, не ноль, не больше одного знака после запятой.`);
    }
    if (!a.comment.trim()) errors.push(`${label}: напишите, за что поправка.`);
  }
  return errors;
}

const adjustmentValue = (a: { points: string; comment: string }) =>
  a.points.trim() ? { points: parseDecimal(a.points), comment: a.comment.trim() } : null;

export function isAdjustmentsDirty(d: AdjustmentDraft, seasons: { season_id: number }[], rows: AdjustmentRecord[]) {
  const saved = adjustmentDraft(seasons, rows);
  return Object.keys(d).some((id) => JSON.stringify(adjustmentValue(d[Number(id)])) !== JSON.stringify(adjustmentValue(saved[Number(id)])));
}

/** Поправки игрока: заполненные и изменённые — upsert, стёртые — удалить. */
export async function saveAdjustments(w: Writer, playerId: number, seasons: { season_id: number }[], rows: AdjustmentRecord[], d: AdjustmentDraft) {
  const saved = adjustmentDraft(seasons, rows);
  const changed: AdjustmentRecord[] = [];
  const removed: number[] = [];
  for (const [key, a] of Object.entries(d)) {
    const id = Number(key);
    const now = adjustmentValue(a);
    const before = adjustmentValue(saved[id]);
    if (JSON.stringify(now) === JSON.stringify(before)) continue;
    if (now) changed.push({ season_id: id, player_id: playerId, ...now });
    else removed.push(id);
  }
  if (changed.length > 0) await w.upsert('player_season_adjustment', changed.map((r) => ({ ...r })), 'season_id,player_id');
  if (removed.length > 0) await w.remove('player_season_adjustment', { player_id: playerId }, ['season_id', removed]);
}
