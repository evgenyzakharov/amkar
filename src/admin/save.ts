// Сохранение карточки матча. Транзакции на весь матч у PostgREST нет, поэтому пишем по частям:
// шапка → голы → состав → пропуски. Каждая записанная часть сразу попадает в base, так что после ошибки
// повторное сохранение допишет только оставшееся, без дублей.
import {
  goalValues,
  headerValues,
  lineupRecords,
  matchEnd,
  type AbsenceRecord,
  type CardBase,
  type CardDraft,
  type Coach,
  type GoalRecord,
  type GoalValues,
  type MatchRecord,
  type MatchValues,
  type Team,
} from './match';
import type { Row, Writer } from './writer';

const MATCH_FIELDS = [
  'id', 'season_id', 'competition_id', 'seq', 'round', 'match_date', 'venue', 'opponent_id', 'opponent_raw',
  'result', 'goals_for', 'goals_against', 'extra_time', 'pens_for', 'pens_against', 'awarded', 'coach_id',
  'formation', 'notes',
] as const;
const GOAL_FIELDS = ['id', 'match_id', 'side', 'minute', 'added_time', 'kind', 'scorer_id', 'scorer_name', 'assist_id'] as const;
const APPEARANCE_FIELDS = [
  'match_id', 'player_id', 'role', 'minutes', 'minute_on', 'minute_off', 'replaced_player_id', 'injured', 'sent_off',
] as const;

function pick<T>(row: object, fields: readonly string[]): T {
  const r = row as Record<string, unknown>;
  return Object.fromEntries(fields.map((f) => [f, r[f] ?? null])) as T;
}

/** Совпадают ли строки по всем полям из fields, что есть в b. */
function same(a: object | undefined, b: object, fields: readonly string[]): boolean {
  if (!a) return false;
  const [ra, rb] = [a as Record<string, unknown>, b as Record<string, unknown>];
  return fields.filter((f) => f in rb).every((f) => (ra[f] ?? null) === (rb[f] ?? null));
}

export interface SaveOutcome {
  /** База с учётом всего, что успело записаться. */
  base: CardBase;
  /** Черновик; новым голам проставлены id. */
  draft: CardDraft;
  error: unknown;
}

export async function saveMatchCard(w: Writer, base0: CardBase, draft0: CardDraft): Promise<SaveOutcome> {
  let base = base0;
  let draft = draft0;
  try {
    // --- шапка ---
    const header = headerValues(draft.header, base);
    let values: MatchValues = header.values;
    if (header.newTeam) {
      const [team] = await w.insert<Team>('team', [{ name: header.newTeam }]);
      base = { ...base, teams: [...base.teams, { id: team.id, name: team.name }] };
      values = { ...values, opponent_id: team.id };
    }
    if (header.newCoach) {
      const [coach] = await w.insert<Coach>('coach', [{ short_name: header.newCoach, full_name: header.newCoach }]);
      base = { ...base, coaches: [...base.coaches, pick<Coach>(coach, ['id', 'short_name', 'full_name'])] };
      values = { ...values, coach_id: coach.id };
    }
    let match = base.match;
    if (!match) {
      const [created] = await w.insert<MatchRecord>('match', [values as unknown as Row]);
      match = pick<MatchRecord>(created, MATCH_FIELDS);
    } else if (!same(match, values, MATCH_FIELDS)) {
      await w.update('match', values as unknown as Row, { id: match.id });
      match = { ...values, id: match.id };
    }
    base = { ...base, match };
    const matchId = match.id;

    // --- голы: удалить убранные, изменить правленые, вставить новые ---
    const goals = draft.goals.map((g) => goalValues(g, matchId));
    const keptIds = new Set(goals.flatMap((g) => (g.id != null ? [g.id] : [])));
    const removedGoals = base.goals.filter((g) => !keptIds.has(g.id)).map((g) => g.id);
    if (removedGoals.length > 0) {
      await w.remove('goal', { match_id: matchId }, ['id', removedGoals]);
      base = { ...base, goals: base.goals.filter((g) => keptIds.has(g.id)) };
    }
    const goalById = new Map(base.goals.map((g) => [g.id, g]));
    const changedGoals = goals.filter((g): g is GoalRecord => g.id != null && !same(goalById.get(g.id), g, GOAL_FIELDS));
    if (changedGoals.length > 0) {
      await w.upsert('goal', changedGoals.map((g) => pick<Row>(g, GOAL_FIELDS)), 'id');
      const changed = new Map(changedGoals.map((g) => [g.id, g]));
      base = { ...base, goals: base.goals.map((g) => changed.get(g.id) ?? g) };
    }
    const newGoals = goals.filter((g): g is GoalValues => g.id == null);
    if (newGoals.length > 0) {
      const inserted = await w.insert<GoalRecord>(
        'goal',
        newGoals.map((g) => pick<Row>(g, GOAL_FIELDS.filter((f) => f !== 'id'))),
      );
      let i = 0;
      draft = { ...draft, goals: draft.goals.map((g) => (g.id == null ? { ...g, id: inserted[i++].id } : g)) };
      base = { ...base, goals: [...base.goals, ...inserted.map((g) => pick<GoalRecord>(g, GOAL_FIELDS))] };
    }

    // --- состав и пропуски: сначала записать новое (ссылки «кого заменил» уже на актуальных), потом удалить лишнее ---
    const { appearances, absences } = lineupRecords(draft.lineup, matchId, matchEnd(draft.header));

    const appearanceBy = new Map(base.appearances.map((a) => [a.player_id, a]));
    const changedAppearances = appearances.filter((a) => !same(appearanceBy.get(a.player_id), a, APPEARANCE_FIELDS));
    if (changedAppearances.length > 0) {
      await w.upsert('appearance', changedAppearances as unknown as Row[], 'match_id,player_id');
      const changed = new Map(changedAppearances.map((a) => [a.player_id, a]));
      base = {
        ...base,
        appearances: [
          ...base.appearances.map((a) => changed.get(a.player_id) ?? a),
          ...changedAppearances.filter((a) => !appearanceBy.has(a.player_id)),
        ],
      };
    }
    const playing = new Set(appearances.map((a) => a.player_id));
    const removedAppearances = base.appearances.filter((a) => !playing.has(a.player_id)).map((a) => a.player_id);
    if (removedAppearances.length > 0) {
      await w.remove('appearance', { match_id: matchId }, ['player_id', removedAppearances]);
      base = { ...base, appearances: base.appearances.filter((a) => playing.has(a.player_id)) };
    }

    const absenceBy = new Map(base.absences.map((a) => [a.player_id, a]));
    const changedAbsences = absences.filter((a) => absenceBy.get(a.player_id)?.reason !== a.reason);
    if (changedAbsences.length > 0) {
      await w.upsert('absence', changedAbsences as unknown as Row[], 'match_id,player_id');
      const changed = new Map(changedAbsences.map((a) => [a.player_id, a]));
      base = {
        ...base,
        absences: [
          ...base.absences.map((a) => changed.get(a.player_id) ?? a),
          ...changedAbsences.filter((a) => !absenceBy.has(a.player_id)),
        ],
      };
    }
    const absent = new Set(absences.map((a) => a.player_id));
    const removedAbsences = base.absences.filter((a) => !absent.has(a.player_id)).map((a) => a.player_id);
    if (removedAbsences.length > 0) {
      await w.remove('absence', { match_id: matchId }, ['player_id', removedAbsences]);
      base = { ...base, absences: base.absences.filter((a) => absent.has(a.player_id)) };
    }

    return { base, draft, error: null };
  } catch (error) {
    return { base, draft, error };
  }
}

/** Есть ли в черновике что сохранять. */
export function isDirty(base: CardBase, draft: CardDraft): boolean {
  if (!base.match) return true;
  const header = headerValues(draft.header, base);
  if (header.newTeam || header.newCoach || !same(base.match, header.values, MATCH_FIELDS)) return true;

  const goals = draft.goals.map((g) => goalValues(g, base.match!.id));
  if (goals.length !== base.goals.length) return true;
  const goalById = new Map(base.goals.map((g) => [g.id, g]));
  if (goals.some((g) => g.id == null || !same(goalById.get(g.id), g, GOAL_FIELDS))) return true;

  const { appearances, absences } = lineupRecords(draft.lineup, base.match.id, matchEnd(draft.header));
  if (appearances.length !== base.appearances.length || absences.length !== base.absences.length) return true;
  const appearanceBy = new Map(base.appearances.map((a) => [a.player_id, a]));
  if (appearances.some((a) => !same(appearanceBy.get(a.player_id), a, APPEARANCE_FIELDS))) return true;
  const absenceBy = new Map<number, AbsenceRecord>(base.absences.map((a) => [a.player_id, a]));
  return absences.some((a) => absenceBy.get(a.player_id)?.reason !== a.reason);
}

