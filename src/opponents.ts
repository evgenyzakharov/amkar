// Личные встречи с соперниками: всё считается из официальных матчей (без товарищеских).
import { biggest, longestRun, totals, type Run, type Totals } from './coaches';
import type { CompetitionKind, MatchRow, Season } from './db/types';
import { opponentName } from './format';

export interface OpponentTeam {
  id: number;
  name: string;
  city: string | null;
}

export interface OpponentMatch extends MatchRow {
  season_id: number;
  opponent_id: number | null;
}

export interface OpponentStats {
  team: OpponentTeam;
  /** Официальные матчи по порядку. */
  matches: OpponentMatch[];
  all: Totals;
  league: Totals;
  byKind: Partial<Record<CompetitionKind, Totals>>;
  byVenue: Partial<Record<'home' | 'away' | 'neutral', Totals>>;
  first: OpponentMatch | null;
  last: OpponentMatch | null;
  bigWin: OpponentMatch | null;
  bigLoss: OpponentMatch | null;
  streaks: { win: Run<OpponentMatch>; unbeaten: Run<OpponentMatch>; loss: Run<OpponentMatch>; winless: Run<OpponentMatch> };
  /** Как клуб назывался в матчах — по порядку, если название менялось («Уралмаш», «Урал»). */
  names: string[];
}

const KINDS: CompetitionKind[] = ['league', 'cup', 'europe', 'playoff'];
const VENUES = ['home', 'away', 'neutral'] as const;

/** Порядок матчей: сезон, дата, номер матча в сезоне. */
export function byMatchOrder(seasons: Season[]) {
  const seasonOf = new Map(seasons.map((s) => [s.id, s]));
  const key = (m: { season_id: number; match_date: string | null; seq: number }) => {
    const s = seasonOf.get(m.season_id);
    return `${s?.start_year ?? 0}-${s?.end_year ?? 0}-${m.match_date ?? '9999'}-${String(m.seq).padStart(3, '0')}`;
  };
  return (a: { season_id: number; match_date: string | null; seq: number }, b: { season_id: number; match_date: string | null; seq: number }) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
}

/** Статистика встреч с одним клубом. */
export function opponentStats(team: OpponentTeam, matches: OpponentMatch[], seasons: Season[]): OpponentStats {
  const ms = matches.filter((m) => m.opponent_id === team.id && m.competition.kind !== 'friendly').sort(byMatchOrder(seasons));
  const byKind: OpponentStats['byKind'] = {};
  for (const k of KINDS) {
    const x = ms.filter((m) => m.competition.kind === k);
    if (x.length) byKind[k] = totals(x);
  }
  const byVenue: OpponentStats['byVenue'] = {};
  for (const v of VENUES) {
    const x = ms.filter((m) => m.venue === v);
    if (x.length) byVenue[v] = totals(x);
  }
  const names: string[] = [];
  for (const m of ms) {
    const n = opponentName(m);
    if (names.at(-1) !== n) names.push(n);
  }
  return {
    team,
    matches: ms,
    all: totals(ms),
    league: totals(ms.filter((m) => m.competition.kind === 'league')),
    byKind,
    byVenue,
    first: ms[0] ?? null,
    last: ms.at(-1) ?? null,
    bigWin: biggest(ms, 1),
    bigLoss: biggest(ms, -1),
    streaks: {
      win: longestRun(ms, (m) => m.result === 'W'),
      unbeaten: longestRun(ms, (m) => m.result === 'W' || m.result === 'D'),
      loss: longestRun(ms, (m) => m.result === 'L'),
      winless: longestRun(ms, (m) => m.result === 'D' || m.result === 'L'),
    },
    names: [...new Set(names)],
  };
}

/** Все соперники, с которыми были официальные матчи. */
export function allOpponents(teams: OpponentTeam[], matches: OpponentMatch[], seasons: Season[]): OpponentStats[] {
  const byTeam = new Map<number, OpponentMatch[]>();
  for (const m of matches) {
    if (m.opponent_id == null || m.competition.kind === 'friendly') continue;
    if (!byTeam.has(m.opponent_id)) byTeam.set(m.opponent_id, []);
    byTeam.get(m.opponent_id)!.push(m);
  }
  return teams.filter((t) => byTeam.has(t.id)).map((t) => opponentStats(t, byTeam.get(t.id)!, seasons));
}
