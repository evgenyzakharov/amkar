// Статистика главных тренеров для страниц «Тренеры» и карточки тренера: всё считается из официальных матчей
// (без товарищеских), сроков работы (coach_tenure) и дебютов игроков (view player_debut).
import type { CompetitionKind, MatchRow, Result, Season } from './db/types';
import { NEW_CLUB_FROM, formatRatio, plural } from './format';

export interface CoachInfo {
  id: number;
  full_name: string;
  short_name: string;
  birth_date: string | null;
}

export interface Tenure {
  coach_id: number;
  from_date: string;
  /** null — работает сейчас. */
  to_date: string | null;
}

export interface CoachMatch extends MatchRow {
  season_id: number;
  coach_id: number | null;
}

export interface Debut {
  player_id: number;
  display_name: string;
  academy: boolean;
  match_id: number;
  match_date: string | null;
  coach_id: number | null;
  season_label: string;
  start_year: number;
  /** Соперник и дата рождения — из миграции 20261020160000. */
  opponent?: string | null;
  birth_date?: string | null;
}

export interface CoachesData {
  coaches: CoachInfo[];
  tenures: Tenure[];
  seasons: Season[];
  matches: CoachMatch[];
  debuts: Debut[];
}

export interface Totals {
  p: number;
  w: number;
  d: number;
  l: number;
  /** Мячи — только у матчей со счётом. */
  gf: number;
  ga: number;
  cleanSheets: number;
  points: number;
  /** Очки за матч: 3 за победу, 1 за ничью; null — матчей нет. */
  ppm: number | null;
  winPct: number | null;
}

/** Матч со счётом и результатом — всё, что нужно для итогов и серий (тренера, соперника). */
export type ScoredMatch = Pick<MatchRow, 'result' | 'goals_for' | 'goals_against'>;

export interface Run<M = CoachMatch> {
  n: number;
  from: M | null;
  to: M | null;
}

export interface CoachSeason {
  season: Season;
  totals: Totals;
  /** Тренер провёл бо́льшую часть матчей чемпионата: место в таблице — его. */
  led: boolean;
}

export type AchievementKind = 'record' | 'title' | 'promotion' | 'place' | 'cup' | 'europe' | 'streak' | 'youth' | 'longevity';

export interface Achievement {
  kind: AchievementKind;
  icon: string;
  title: string;
}

export interface Period {
  from: string;
  /** null — работает сейчас. */
  to: string | null;
}

export interface CoachStats {
  coach: CoachInfo;
  /** Сроки работы; если их не внесли — по первому и последнему матчу. */
  periods: Period[];
  current: boolean;
  matches: CoachMatch[];
  all: Totals;
  league: Totals;
  byKind: Partial<Record<CompetitionKind, Totals>>;
  byVenue: Partial<Record<'home' | 'away' | 'neutral', Totals>>;
  /** Чемпионат по уровню лиги (season.tier). */
  byTier: Record<number, Totals>;
  seasons: CoachSeason[];
  streaks: { win: Run; unbeaten: Run; cleanSheets: Run; losses: Run };
  first: CoachMatch | null;
  /** Последний матч — только у тех, кто уже не работает. */
  last: CoachMatch | null;
  bigWin: CoachMatch | null;
  bigLoss: CoachMatch | null;
  /** Дебютанты с 1996 года: в первом сезоне 1995 дебютировали все. */
  debutants: Debut[];
  achievements: Achievement[];
}

/** С этого года считаем дебюты: в 1995 за «Амкар» дебютировали все. */
export const DEBUTS_FROM = 1996;

/** Уровни лиги по схеме автора (season.tier). */
export const TIER_LABEL: Record<number, string> = {
  1: 'Высшая',
  2: 'Первая',
  3: 'Вторая',
  4: 'Третья / «А» Серебро',
  5: 'Вторая «Б»',
};
const TIER_IN: Record<number, string> = {
  1: 'в высшей лиге',
  2: 'в первой лиге',
  3: 'во второй лиге',
  4: 'в третьей лиге и «А» Серебро',
  5: 'во второй лиге «Б»',
};

const POINTS: Record<Result, number> = { W: 3, D: 1, L: 0 };

export function totals(matches: ScoredMatch[]): Totals {
  const t = { p: matches.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, cleanSheets: 0, points: 0 };
  for (const m of matches) {
    if (m.result === 'W') t.w++;
    else if (m.result === 'D') t.d++;
    else if (m.result === 'L') t.l++;
    if (m.result) t.points += POINTS[m.result];
    if (m.goals_for != null && m.goals_against != null) {
      t.gf += m.goals_for;
      t.ga += m.goals_against;
      if (m.goals_against === 0) t.cleanSheets++;
    }
  }
  return { ...t, ppm: t.p ? t.points / t.p : null, winPct: t.p ? Math.round((100 * t.w) / t.p) : null };
}

/** Самая длинная серия подряд идущих матчей, где выполнено условие. */
export function longestRun<M extends ScoredMatch>(matches: M[], ok: (m: M) => boolean): Run<M> {
  let best: Run<M> = { n: 0, from: null, to: null };
  let start = 0;
  let n = 0;
  matches.forEach((m, i) => {
    if (!ok(m)) {
      n = 0;
      return;
    }
    if (n === 0) start = i;
    n++;
    if (n > best.n) best = { n, from: matches[start], to: m };
  });
  return best;
}

const margin = (m: ScoredMatch) => (m.goals_for ?? 0) - (m.goals_against ?? 0);
const hasScore = (m: ScoredMatch) => m.goals_for != null && m.goals_against != null;
const cupStage = (m: CoachMatch) => (m.competition.kind === 'cup' ? (m.round ?? '').replace(/,.*$/, '').trim() : '');
const year = (m: CoachMatch) => m.match_date?.slice(0, 4) ?? '';
const newClub = (s: Season) => s.start_year >= NEW_CLUB_FROM;

/** Самая крупная победа: по разнице мячей, при равенстве — больше забитых. */
export function biggest<M extends ScoredMatch>(matches: M[], sign: 1 | -1): M | null {
  let best: M | null = null;
  for (const m of matches) {
    if (!hasScore(m) || Math.sign(margin(m)) !== sign) continue;
    const better =
      !best ||
      sign * margin(m) > sign * margin(best) ||
      (margin(m) === margin(best) && (sign > 0 ? m.goals_for! > best.goals_for! : m.goals_against! > best.goals_against!));
    if (better) best = m;
  }
  return best;
}

const VENUES = ['home', 'away', 'neutral'] as const;
const KINDS: CompetitionKind[] = ['league', 'cup', 'europe', 'playoff'];

/** Статистика всех тренеров, у которых есть официальные матчи или сроки, — в порядке назначения. */
export function coachStats(data: CoachesData): CoachStats[] {
  const seasonOf = new Map(data.seasons.map((s) => [s.id, s]));
  const order = (m: CoachMatch) => {
    const s = seasonOf.get(m.season_id);
    return `${s?.start_year ?? 0}-${s?.end_year ?? 0}-${m.match_date ?? '9999'}-${String(m.seq).padStart(3, '0')}`;
  };
  const official = data.matches
    .filter((m) => m.competition.kind !== 'friendly')
    .sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));

  // Кто вёл сезон: тренер большинства матчей чемпионата
  const leadOf = new Map<number, number>();
  for (const s of data.seasons) {
    const count = new Map<number, number>();
    for (const m of official) if (m.season_id === s.id && m.competition.kind === 'league' && m.coach_id) count.set(m.coach_id, (count.get(m.coach_id) ?? 0) + 1);
    let best: [number, number] | null = null;
    for (const [id, n] of count) if (!best || n > best[1]) best = [id, n];
    if (best) leadOf.set(s.id, best[0]);
  }
  const seasonsSorted = [...data.seasons].sort((a, b) => a.start_year - b.start_year || a.end_year - b.end_year);

  const stats = data.coaches
    .map((coach): CoachStats => {
      const ms = official.filter((m) => m.coach_id === coach.id);
      const league = ms.filter((m) => m.competition.kind === 'league');
      const tenures = data.tenures.filter((t) => t.coach_id === coach.id).sort((a, b) => a.from_date.localeCompare(b.from_date));
      const periods: Period[] = tenures.length
        ? tenures.map((t) => ({ from: t.from_date, to: t.to_date }))
        : ms.length && ms[0].match_date
          ? [{ from: ms[0].match_date, to: ms.at(-1)!.match_date ?? ms[0].match_date }]
          : [];
      const current = tenures.some((t) => t.to_date == null);

      const byKind: CoachStats['byKind'] = {};
      for (const k of KINDS) {
        const x = ms.filter((m) => m.competition.kind === k);
        if (x.length) byKind[k] = totals(x);
      }
      const byVenue: CoachStats['byVenue'] = {};
      for (const v of VENUES) {
        const x = ms.filter((m) => m.venue === v);
        if (x.length) byVenue[v] = totals(x);
      }
      const byTier: Record<number, Totals> = {};
      for (const tier of new Set(league.map((m) => seasonOf.get(m.season_id)?.tier).filter((t): t is number => t != null))) {
        byTier[tier] = totals(league.filter((m) => seasonOf.get(m.season_id)?.tier === tier));
      }
      const seasons = [...new Set(ms.map((m) => m.season_id))].flatMap((id) => {
        const season = seasonOf.get(id);
        return season ? [{ season, totals: totals(ms.filter((m) => m.season_id === id)), led: leadOf.get(id) === coach.id }] : [];
      });

      return {
        coach,
        periods,
        current,
        matches: ms,
        all: totals(ms),
        league: totals(league),
        byKind,
        byVenue,
        byTier,
        seasons,
        streaks: {
          win: longestRun(ms, (m) => m.result === 'W'),
          unbeaten: longestRun(ms, (m) => m.result === 'W' || m.result === 'D'),
          cleanSheets: longestRun(ms, (m) => m.goals_against === 0),
          losses: longestRun(ms, (m) => m.result === 'L'),
        },
        first: ms[0] ?? null,
        last: current ? null : (ms.at(-1) ?? null),
        bigWin: biggest(ms, 1),
        bigLoss: biggest(ms, -1),
        debutants: data.debuts.filter((d) => d.coach_id === coach.id && d.start_year >= DEBUTS_FROM),
        achievements: [],
      };
    })
    .filter((c) => c.matches.length > 0 || c.periods.length > 0)
    .sort((a, b) => (a.periods[0]?.from ?? '').localeCompare(b.periods[0]?.from ?? ''));

  for (const c of stats) c.achievements = achievements(c, seasonsSorted);
  addTierRecords(stats, seasonOf);
  return stats;
}

function achievements(c: CoachStats, seasonsSorted: Season[]): Achievement[] {
  const out: Achievement[] = [];
  const led = c.seasons.filter((s) => s.led).map((s) => s.season);
  for (const s of led) {
    if (s.final_place === 1) out.push({ kind: 'title', icon: '🏆', title: `Победитель: ${s.division ?? 'чемпионат'}, ${s.label}` });
    const next = seasonsSorted[seasonsSorted.indexOf(s) + 1];
    if (next && newClub(next) === newClub(s) && next.tier != null && s.tier != null && next.tier < s.tier) {
      out.push({ kind: 'promotion', icon: '⬆', title: next.tier === 1 ? `Вывел в высшую лигу: ${s.label}` : `Повышение в классе: ${s.label}` });
    }
  }
  const top = led.filter((s) => s.tier === 1 && s.final_place != null && s.final_place <= 8).sort((a, b) => a.final_place! - b.final_place!)[0];
  if (top) out.push({ kind: 'place', icon: '⭐', title: `${top.final_place}-е место в высшей лиге (${top.label})` });

  // Кубок: годы матчей стадии; полуфинал — в те годы, когда до финала не дошли
  const stageYears = (stage: string) => [...new Set(c.matches.filter((m) => cupStage(m) === stage).map(year))];
  const finals = stageYears('Финал');
  const semis = stageYears('1/2 финала').filter((y) => !finals.includes(y));
  if (finals.length) out.push({ kind: 'cup', icon: '🥈', title: `Финал Кубка России ${finals.join(', ')}` });
  if (semis.length) out.push({ kind: 'cup', icon: '🏟', title: `Полуфинал Кубка России ${semis.join(', ')}` });
  const europe = c.byKind.europe?.p;
  if (europe) out.push({ kind: 'europe', icon: '🌍', title: `Еврокубки: ${europe} ${plural(europe, ['матч', 'матча', 'матчей'])}` });

  const { win, unbeaten, cleanSheets } = c.streaks;
  if (win.n >= 5) out.push({ kind: 'streak', icon: '🔥', title: `${win.n} ${plural(win.n, ['победа', 'победы', 'побед'])} подряд` });
  if (unbeaten.n >= 10) out.push({ kind: 'streak', icon: '🛡', title: `${unbeaten.n} ${plural(unbeaten.n, ['матч', 'матча', 'матчей'])} без поражений` });
  if (cleanSheets.n >= 4) {
    out.push({ kind: 'streak', icon: '🧱', title: `${cleanSheets.n} ${plural(cleanSheets.n, ['«сухой» матч', '«сухих» матча', '«сухих» матчей'])} подряд` });
  }
  const academy = c.debutants.filter((d) => d.academy).length;
  if (academy >= 3) out.push({ kind: 'youth', icon: '🌱', title: `Дебют у ${academy} ${plural(academy, ['воспитанника', 'воспитанников', 'воспитанников'])}` });
  if (c.all.p >= 100) out.push({ kind: 'longevity', icon: '⏳', title: `${c.all.p} ${plural(c.all.p, ['официальный матч', 'официальных матча', 'официальных матчей'])}` });
  return out;
}

/**
 * Рекорды клуба — отдельно по уровню лиги: среди тренеров, работавших на этом уровне (минимум двое),
 * у кого самая длинная серия или самая крупная победа. Считаются все официальные матчи сезонов этого уровня.
 */
function addTierRecords(stats: CoachStats[], seasonOf: Map<number, Season>) {
  const tiers = new Set(stats.flatMap((c) => c.matches.map((m) => seasonOf.get(m.season_id)?.tier)).filter((t): t is number => t != null));
  for (const tier of [...tiers].sort((a, b) => a - b)) {
    const at = stats
      .map((c) => ({ c, ms: c.matches.filter((m) => seasonOf.get(m.season_id)?.tier === tier) }))
      .filter((x) => x.ms.length > 0);
    if (at.length < 2) continue;
    const metrics: { value: (ms: CoachMatch[]) => number; title: (n: number) => string; min: number }[] = [
      { value: (ms) => longestRun(ms, (m) => m.result === 'W').n, title: (n) => `${n} ${plural(n, ['победа', 'победы', 'побед'])} подряд`, min: 3 },
      {
        value: (ms) => longestRun(ms, (m) => m.result === 'W' || m.result === 'D').n,
        title: (n) => `${n} ${plural(n, ['матч', 'матча', 'матчей'])} без поражений`,
        min: 5,
      },
      {
        value: (ms) => longestRun(ms, (m) => m.goals_against === 0).n,
        title: (n) => `${n} ${plural(n, ['«сухой» матч', '«сухих» матча', '«сухих» матчей'])} подряд`,
        min: 3,
      },
    ];
    for (const metric of metrics) {
      const values = at.map((x) => ({ ...x, v: metric.value(x.ms) }));
      const best = Math.max(...values.map((x) => x.v));
      if (best < metric.min) continue;
      for (const x of values.filter((x) => x.v === best)) {
        x.c.achievements.unshift({ kind: 'record', icon: '👑', title: `Рекорд клуба ${TIER_IN[tier] ?? `на уровне ${tier}`}: ${metric.title(best)}` });
      }
    }
    const wins = at.map((x) => ({ ...x, m: biggest(x.ms, 1) })).filter((x) => x.m);
    const top = Math.max(...wins.map((x) => margin(x.m!)));
    for (const x of wins.filter((x) => margin(x.m!) === top && top >= 3)) {
      const m = x.m!;
      x.c.achievements.unshift({
        kind: 'record',
        icon: '👑',
        title: `Самая крупная победа ${TIER_IN[tier] ?? `на уровне ${tier}`}: ${m.goals_for}:${m.goals_against}`,
      });
    }
  }
}

// «В–Н–П» не переносится по тире: между буквами — невидимые неразрывные соединители
export const WDL = 'В⁠–⁠Н⁠–⁠П';

export const ppmText = (t: Totals) => (t.ppm == null ? '—' : formatRatio(t.ppm));

/** Строки разрезов «по турнирам» и «дома и в гостях». */
export const KIND_ROWS = [
  ['league', 'Чемпионат'],
  ['cup', 'Кубок России'],
  ['europe', 'Лига Европы'],
  ['playoff', 'Переходные матчи'],
] as const;

export const VENUE_ROWS = [
  ['home', 'Дома'],
  ['away', 'В гостях'],
  ['neutral', 'Нейтральное поле'],
] as const;
