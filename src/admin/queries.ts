// Чтение для админки. Запись — в save.ts через Writer.
import { NotFoundError } from '../load';
import { db, loadSeasons, MATCH_COLUMNS, rows } from '../db/queries';
import type { MatchRow, Position, Season } from '../db/types';
import {
  MATCH_RECORD_COLUMNS,
  type AbsenceRecord,
  type AppearanceRecord,
  type CardBase,
  type Coach,
  type Competition,
  type GoalRecord,
  type MatchRecord,
  type SquadPlayer,
  type Team,
} from './match';

/** Матч в списке админки: сколько уже записано по нему. */
export interface AdminMatchRow extends MatchRow {
  appearance: { count: number }[];
  goal: { count: number }[];
}

export interface AdminSeasonData {
  season: Season;
  matches: AdminMatchRow[];
}

export async function loadAdminSeason(label: string): Promise<AdminSeasonData> {
  const season = (await loadSeasons()).find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  const matches = await rows<AdminMatchRow[]>(
    db()
      .from('match')
      .select(`${MATCH_COLUMNS}, appearance(count), goal(count)`)
      .eq('season_id', season.id)
      .order('seq'),
  );
  return { season, matches };
}

/** Число из встроенного count() PostgREST: [{ count: 5 }]. */
export const embeddedCount = (list: { count: number }[]) => list[0]?.count ?? 0;

// ===========================================================================
// Карточка матча
// ===========================================================================

export interface MatchCardData {
  base: CardBase;
  competitions: Competition[];
  /** Заявка сезона и все, кто записан в составе матча, — по порядку для таблицы состава. */
  squad: SquadPlayer[];
  prevId: number | null;
  nextId: number | null;
}

interface SquadRow {
  player_id: number;
  shirt_number: number | null;
  position: Position | null;
  squad_group: 'main' | 'youth';
  sort_order: number | null;
  player: { display_name: string };
}

type Named<T> = T & { player: { display_name: string } };

const POSITION_RANK: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };

function squadPlayers(squad: SquadRow[], others: Named<{ player_id: number }>[]): SquadPlayer[] {
  const list: SquadPlayer[] = squad.map((s) => ({
    player_id: s.player_id,
    display_name: s.player.display_name,
    shirt_number: s.shirt_number,
    position: s.position,
    squad_group: s.squad_group,
    sort_order: s.sort_order,
    inSquad: true,
  }));
  const known = new Set(list.map((p) => p.player_id));
  for (const o of others) {
    if (known.has(o.player_id)) continue;
    known.add(o.player_id);
    list.push({
      player_id: o.player_id,
      display_name: o.player.display_name,
      shirt_number: null,
      position: null,
      squad_group: 'main',
      sort_order: null,
      inSquad: false,
    });
  }
  const rank = (p: SquadPlayer) => (p.inSquad ? 0 : 2) + (p.squad_group === 'youth' ? 1 : 0);
  return list.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (POSITION_RANK[a.position ?? ''] ?? 9) - (POSITION_RANK[b.position ?? ''] ?? 9) ||
      (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
      a.display_name.localeCompare(b.display_name, 'ru'),
  );
}

async function loadCard(season: Season, match: MatchRecord | null): Promise<MatchCardData> {
  const matchId = match?.id ?? -1;
  const [competitions, teams, coaches, squad, seasonMatches, goals, appearances, absences] = await Promise.all([
    rows<Competition[]>(db().from('competition').select('id, name, kind').order('id')),
    rows<Team[]>(db().from('team').select('id, name').order('name')),
    rows<Coach[]>(db().from('coach').select('id, short_name, full_name').order('short_name')),
    rows<SquadRow[]>(
      db()
        .from('squad_member')
        .select('player_id, shirt_number, position, squad_group, sort_order, player(display_name)')
        .eq('season_id', season.id),
    ),
    rows<{ id: number; seq: number }[]>(db().from('match').select('id, seq').eq('season_id', season.id).order('seq')),
    rows<GoalRecord[]>(db().from('goal').select('id, match_id, side, minute, added_time, kind, scorer_id, scorer_name, assist_id').eq('match_id', matchId).order('id')),
    rows<Named<AppearanceRecord>[]>(
      db()
        .from('appearance')
        .select('match_id, player_id, role, minutes, minute_on, minute_off, replaced_player_id, injured, sent_off, player(display_name)')
        .eq('match_id', matchId),
    ),
    rows<Named<AbsenceRecord>[]>(db().from('absence').select('match_id, player_id, reason, player(display_name)').eq('match_id', matchId)),
  ]);
  const i = seasonMatches.findIndex((m) => m.id === matchId);
  const strip = <T extends { player: unknown }>({ player, ...rest }: T) => {
    void player;
    return rest;
  };
  return {
    base: {
      season: { id: season.id, label: season.label, start_year: season.start_year, end_year: season.end_year },
      match,
      nextSeq: (seasonMatches.at(-1)?.seq ?? 0) + 1,
      goals,
      appearances: appearances.map(strip),
      absences: absences.map(strip),
      teams,
      coaches,
    },
    competitions,
    squad: squadPlayers(squad, [...appearances, ...absences]),
    prevId: i > 0 ? seasonMatches[i - 1].id : null,
    nextId: i >= 0 ? (seasonMatches[i + 1]?.id ?? null) : null,
  };
}

export async function loadMatchCard(id: number): Promise<MatchCardData> {
  const match = await rows<MatchRecord | null>(db().from('match').select(MATCH_RECORD_COLUMNS).eq('id', id).maybeSingle());
  if (!match) throw new NotFoundError(`Матча №${id} в базе нет.`);
  const season = (await loadSeasons()).find((s) => s.id === match.season_id);
  if (!season) throw new NotFoundError(`Сезона матча №${id} в базе нет.`);
  return loadCard(season, match);
}

export async function loadNewMatchCard(label: string): Promise<MatchCardData> {
  const season = (await loadSeasons()).find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  return loadCard(season, null);
}
