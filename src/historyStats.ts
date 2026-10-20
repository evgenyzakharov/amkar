// Расчёты для «Истории»: голы по минутам и возраст состава.
import type { Debut } from './coaches';
import type { FirstGoal, GoalMinute, PlayerSeasonAge } from './db/types';
import { ageYears } from './format';

// ===========================================================================
// Голы по минутам
// ===========================================================================

export interface MinuteColumn {
  label: string;
  scored: number;
  conceded: number;
}

/** 15-минутки; голы в добавленное время первого и второго тайма — отдельно, дополнительное время — одной колонкой. */
export const BUCKETS = ['1–15', '16–30', '31–45', '45+', '46–60', '61–75', '76–90', '90+', 'Доп. время'] as const;

export function bucketOf(minute: number, added: boolean): (typeof BUCKETS)[number] {
  if (minute > 90) return 'Доп. время';
  if (added && minute === 45) return '45+';
  if (added && minute === 90) return '90+';
  if (minute <= 15) return '1–15';
  if (minute <= 30) return '16–30';
  if (minute <= 45) return '31–45';
  if (minute <= 60) return '46–60';
  if (minute <= 75) return '61–75';
  return '76–90';
}

const add = (map: Map<string, MinuteColumn>, label: string, r: GoalMinute) => {
  const c = map.get(label) ?? { label, scored: 0, conceded: 0 };
  if (r.side === 'amkar') c.scored += r.goals;
  else c.conceded += r.goals;
  map.set(label, c);
};

export function bucketColumns(rows: GoalMinute[]): MinuteColumn[] {
  const map = new Map<string, MinuteColumn>(BUCKETS.map((b) => [b, { label: b, scored: 0, conceded: 0 }]));
  for (const r of rows) add(map, bucketOf(r.minute, r.added), r);
  // пустые «45+», «90+» и дополнительное время не показываем
  return [...map.values()].filter((c) => !['45+', '90+', 'Доп. время'].includes(c.label) || c.scored + c.conceded > 0);
}

/** По минутам: 1…45, 45+, 46…90, 90+ и дополнительное время. */
export function minuteColumns(rows: GoalMinute[]): MinuteColumn[] {
  const labels = [
    ...Array.from({ length: 45 }, (_, i) => String(i + 1)),
    '45+',
    ...Array.from({ length: 45 }, (_, i) => String(i + 46)),
    '90+',
    'Доп. время',
  ];
  const map = new Map<string, MinuteColumn>(labels.map((l) => [l, { label: l, scored: 0, conceded: 0 }]));
  for (const r of rows) {
    const b = bucketOf(r.minute, r.added);
    add(map, b === '45+' || b === '90+' || b === 'Доп. время' ? b : String(r.minute), r);
  }
  return [...map.values()].filter((c) => !['45+', '90+', 'Доп. время'].includes(c.label) || c.scored + c.conceded > 0);
}

// ===========================================================================
// Возраст состава
// ===========================================================================

export interface PlayerAge {
  player_id: number;
  name: string;
  age: number;
}

export interface SeasonAge {
  /** Средний возраст по минутам: каждый весит столько, сколько сыграл. */
  avg: number | null;
  youngest: PlayerAge | null;
  oldest: PlayerAge | null;
  /** Игроки с матчами, но без даты рождения: в среднем не учтены. */
  missing: { name: string; minutes: number }[];
}

export function seasonAges(rows: PlayerSeasonAge[]): Map<number, SeasonAge> {
  const out = new Map<number, SeasonAge>();
  const bySeason = new Map<number, PlayerSeasonAge[]>();
  for (const r of rows) {
    if (!bySeason.has(r.season_id)) bySeason.set(r.season_id, []);
    bySeason.get(r.season_id)!.push(r);
  }
  for (const [id, list] of bySeason) {
    const dated = list.filter((r) => r.age_first != null && r.age_last != null);
    const minutes = dated.reduce((s, r) => s + r.minutes, 0);
    const ageMinutes = dated.reduce((s, r) => s + Number(r.age_minutes ?? 0), 0);
    const young = [...dated].sort((a, b) => Number(a.age_first) - Number(b.age_first))[0];
    const old = [...dated].sort((a, b) => Number(b.age_last) - Number(a.age_last))[0];
    out.set(id, {
      avg: minutes > 0 ? ageMinutes / minutes : null,
      youngest: young ? { player_id: young.player_id, name: young.display_name, age: Number(young.age_first) } : null,
      oldest: old ? { player_id: old.player_id, name: old.display_name, age: Number(old.age_last) } : null,
      missing: list.filter((r) => r.age_first == null).map((r) => ({ name: r.display_name, minutes: r.minutes })),
    });
  }
  return out;
}

export interface AgeRecord {
  player_id: number;
  name: string;
  age: number;
  match_id: number;
  date: string | null;
  opponent: string | null;
}

/** Самые молодые дебютант и автор гола, самый возрастной игрок. */
export function ageRecords(ages: PlayerSeasonAge[], debuts: Debut[], firstGoals: FirstGoal[]) {
  const birth = new Map<number, { name: string; birth: string }>();
  for (const a of ages) if (a.birth_date) birth.set(a.player_id, { name: a.display_name, birth: a.birth_date });
  const youngestDebut = debuts
    .filter((d) => d.birth_date && d.match_date)
    .map((d): AgeRecord => ({ player_id: d.player_id, name: d.display_name, age: ageYears(d.birth_date!, d.match_date!), match_id: d.match_id, date: d.match_date, opponent: d.opponent ?? null }))
    .sort((a, b) => a.age - b.age)[0];
  const youngestScorer = firstGoals
    .filter((g) => g.match_date && birth.has(g.player_id))
    .map((g): AgeRecord => {
      const b = birth.get(g.player_id)!;
      return { player_id: g.player_id, name: b.name, age: ageYears(b.birth, g.match_date!), match_id: g.match_id, date: g.match_date, opponent: g.opponent };
    })
    .sort((a, b) => a.age - b.age)[0];
  const oldest = ages.filter((a) => a.age_last != null).sort((a, b) => Number(b.age_last) - Number(a.age_last))[0];
  return {
    youngestDebut: youngestDebut ?? null,
    youngestScorer: youngestScorer ?? null,
    oldest: oldest ? { player_id: oldest.player_id, name: oldest.display_name, age: Number(oldest.age_last), season_id: oldest.season_id } : null,
  };
}
