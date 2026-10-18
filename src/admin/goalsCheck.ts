// Сверка голов сезона: итоги из таблицы автора против голов, внесённых в карточки матчей.
// Помогает понять, все ли голы внесены, прежде чем включить у сезона «голы по матчам».

export interface CheckMatch {
  id: number;
  seq: number;
  opponent: string;
  goals_for: number | null;
  goals_against: number | null;
  friendly: boolean;
}

export interface CheckGoal {
  match_id: number;
  side: 'amkar' | 'opponent';
  kind: 'open_play' | 'penalty' | 'own_goal';
  scorer_id: number | null;
  assist_id: number | null;
}

export interface CheckTotal {
  player_id: number;
  goals: number | null;
  assists: number | null;
  friendly: boolean;
}

export interface PlayerCheck {
  player_id: number;
  name: string;
  excelGoals: number | null;
  matchGoals: number;
  excelAssists: number | null;
  matchAssists: number;
  /** Расходится ли хоть что-то. */
  differs: boolean;
}

export interface MatchGap {
  id: number;
  seq: number;
  opponent: string;
  /** Сколько голов в счёте и сколько внесено — «Амкара» и соперника. */
  scoredFor: number;
  enteredFor: number;
  scoredAgainst: number;
  enteredAgainst: number;
}

export interface GoalsCheck {
  players: PlayerCheck[];
  /** Матчи, где голов внесено не столько, сколько в счёте. */
  gaps: MatchGap[];
  /** Матчи без счёта — по ним не понять, все ли голы внесены. */
  noScore: { id: number; seq: number; opponent: string }[];
}

export function checkGoals(
  matches: CheckMatch[],
  goals: CheckGoal[],
  totals: CheckTotal[],
  nameOf: (id: number) => string,
): GoalsCheck {
  const official = matches.filter((m) => !m.friendly);
  const officialIds = new Set(official.map((m) => m.id));
  const counted = goals.filter((g) => officialIds.has(g.match_id));

  const byPlayer = new Map<number, PlayerCheck>();
  const row = (id: number) => {
    let r = byPlayer.get(id);
    if (!r) {
      r = { player_id: id, name: nameOf(id), excelGoals: null, matchGoals: 0, excelAssists: null, matchAssists: 0, differs: false };
      byPlayer.set(id, r);
    }
    return r;
  };
  for (const t of totals) {
    if (t.friendly) continue;
    const r = row(t.player_id);
    if (t.goals != null) r.excelGoals = (r.excelGoals ?? 0) + t.goals;
    if (t.assists != null) r.excelAssists = (r.excelAssists ?? 0) + t.assists;
  }
  for (const g of counted) {
    if (g.side === 'amkar' && g.kind !== 'own_goal' && g.scorer_id != null) row(g.scorer_id).matchGoals++;
    if (g.assist_id != null) row(g.assist_id).matchAssists++;
  }
  const players = [...byPlayer.values()]
    .map((r) => ({ ...r, differs: (r.excelGoals ?? 0) !== r.matchGoals || (r.excelAssists ?? 0) !== r.matchAssists }))
    .filter((r) => r.excelGoals || r.matchGoals || r.excelAssists || r.matchAssists)
    .sort((a, b) => Math.max(b.excelGoals ?? 0, b.matchGoals) - Math.max(a.excelGoals ?? 0, a.matchGoals) || a.name.localeCompare(b.name, 'ru'));

  const gaps: MatchGap[] = [];
  const noScore: GoalsCheck['noScore'] = [];
  for (const m of official) {
    if (m.goals_for == null || m.goals_against == null) {
      noScore.push({ id: m.id, seq: m.seq, opponent: m.opponent });
      continue;
    }
    const mine = counted.filter((g) => g.match_id === m.id);
    const enteredFor = mine.filter((g) => g.side === 'amkar').length;
    const enteredAgainst = mine.filter((g) => g.side === 'opponent').length;
    if (enteredFor !== m.goals_for || enteredAgainst !== m.goals_against) {
      gaps.push({ id: m.id, seq: m.seq, opponent: m.opponent, scoredFor: m.goals_for, enteredFor, scoredAgainst: m.goals_against, enteredAgainst });
    }
  }
  return { players, gaps, noScore };
}
