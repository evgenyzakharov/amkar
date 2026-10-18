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
import type { SquadBase, SquadPlayerInfo, SquadRecord } from './squad';
import { TRANSFER_COLUMNS, type TransferBase, type TransferRecord } from './transfers';
import { rawOpponents, type DirRecord, type RawOpponent, type TeamNameRecord } from './directory';

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
  /** Как соперник назывался в сезон матча (opponent_name): «Ростсельмаш» у клуба «Ростов» в 1998. */
  opponentThen: string | null;
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

const SQUAD_COLUMNS = 'player_id, shirt_number, position, squad_group, sort_order, player(display_name)';

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

async function loadCard(season: Season, match: MatchRecord | null, opponentThen: string | null = null): Promise<MatchCardData> {
  const matchId = match?.id ?? -1;
  const [competitions, teams, coaches, squad, seasonMatches, goals, appearances, absences] = await Promise.all([
    rows<Competition[]>(db().from('competition').select('id, name, kind').order('id')),
    rows<Team[]>(db().from('team').select('id, name').order('name')),
    rows<Coach[]>(db().from('coach').select('id, short_name, full_name').order('short_name')),
    rows<SquadRow[]>(
      db()
        .from('squad_member')
        .select(SQUAD_COLUMNS)
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
    opponentThen,
  };
}

export async function loadMatchCard(id: number): Promise<MatchCardData> {
  const row = await rows<(MatchRecord & { opponent_name: string | null }) | null>(
    db().from('match').select(`${MATCH_RECORD_COLUMNS}, opponent_name`).eq('id', id).maybeSingle(),
  );
  if (!row) throw new NotFoundError(`Матча №${id} в базе нет.`);
  // название на тот сезон — отдельно: в строке match для сохранения его быть не должно
  const { opponent_name, ...match } = row;
  const season = (await loadSeasons()).find((s) => s.id === match.season_id);
  if (!season) throw new NotFoundError(`Сезона матча №${id} в базе нет.`);
  return loadCard(season, match, opponent_name);
}

export async function loadNewMatchCard(label: string): Promise<MatchCardData> {
  const season = (await loadSeasons()).find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  return loadCard(season, null);
}

// ===========================================================================
// Сетка сезона
// ===========================================================================

/** Все строки запроса: PostgREST отдаёт не больше 1000 за раз. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const chunk = await rows<T[]>(page(from, from + size - 1));
    out.push(...chunk);
    if (chunk.length < size) return out;
  }
}

export interface SeasonGridData {
  season: Season;
  matches: MatchRow[];
  players: SquadPlayer[];
  appearances: AppearanceRecord[];
  absences: AbsenceRecord[];
}

const APPEARANCE_COLUMNS = 'match_id, player_id, role, minutes, minute_on, minute_off, replaced_player_id, injured, sent_off';

export async function loadSeasonGrid(label: string): Promise<SeasonGridData> {
  const season = (await loadSeasons()).find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  const [matches, squad] = await Promise.all([
    rows<MatchRow[]>(db().from('match').select(MATCH_COLUMNS).eq('season_id', season.id).order('seq')),
    rows<SquadRow[]>(db().from('squad_member').select(SQUAD_COLUMNS).eq('season_id', season.id)),
  ]);
  const ids = matches.map((m) => m.id);
  const [appearances, absences] = ids.length
    ? await Promise.all([
        allRows<Named<AppearanceRecord>>((from, to) =>
          db()
            .from('appearance')
            .select(`${APPEARANCE_COLUMNS}, player(display_name)`)
            .in('match_id', ids)
            .order('match_id')
            .order('player_id')
            .range(from, to),
        ),
        allRows<Named<AbsenceRecord>>((from, to) =>
          db()
            .from('absence')
            .select('match_id, player_id, reason, player(display_name)')
            .in('match_id', ids)
            .order('match_id')
            .order('player_id')
            .range(from, to),
        ),
      ])
    : [[], []];
  const strip = <T extends { player: unknown }>({ player, ...rest }: T) => {
    void player;
    return rest;
  };
  return {
    season,
    matches,
    players: squadPlayers(squad, [...appearances, ...absences]),
    appearances: appearances.map(strip),
    absences: absences.map(strip),
  };
}

// ===========================================================================
// Заявка сезона
// ===========================================================================

export interface SquadEditorData {
  season: Season;
  base: SquadBase;
  /** Все игроки базы — для добавления в заявку. */
  allPlayers: SquadPlayerInfo[];
}

interface PlayerRow {
  id: number;
  display_name: string;
  last_name: string;
  first_name: string | null;
  birth_date: string | null;
  academy: boolean;
  squad_member: { season: { label: string; start_year: number } }[];
}

/** Все игроки базы с их сезонами в «Амкаре» — чтобы выбирать и отличать однофамильцев. */
async function loadAllPlayers(): Promise<SquadPlayerInfo[]> {
  const players = await allRows<PlayerRow>((from, to) =>
    db()
      .from('player')
      .select('id, display_name, last_name, first_name, birth_date, academy, squad_member(season(label, start_year))')
      .order('id')
      .range(from, to),
  );
  return players.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    last_name: p.last_name,
    first_name: p.first_name,
    birth_date: p.birth_date,
    academy: p.academy,
    seasons: p.squad_member
      .map((s) => s.season)
      .sort((a, b) => a.start_year - b.start_year)
      .map((s) => s.label),
  }));
}

export async function loadSquadEditor(label: string): Promise<SquadEditorData> {
  const season = (await loadSeasons()).find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  const [rowsOfSeason, allPlayers, matches] = await Promise.all([
    rows<SquadRecord[]>(
      db()
        .from('squad_member')
        .select('season_id, player_id, shirt_number, position, squad_group, on_loan, sort_order')
        .eq('season_id', season.id),
    ),
    loadAllPlayers(),
    rows<{ id: number }[]>(db().from('match').select('id').eq('season_id', season.id)),
  ]);
  const ids = matches.map((m) => m.id);
  const inMatches = new Set<number>();
  if (ids.length) {
    const [apps, abs] = await Promise.all([
      allRows<{ player_id: number }>((from, to) =>
        db().from('appearance').select('player_id').in('match_id', ids).order('match_id').order('player_id').range(from, to),
      ),
      allRows<{ player_id: number }>((from, to) =>
        db().from('absence').select('player_id').in('match_id', ids).order('match_id').order('player_id').range(from, to),
      ),
    ]);
    for (const r of [...apps, ...abs]) inMatches.add(r.player_id);
  }
  return {
    season,
    base: { seasonId: season.id, rows: rowsOfSeason, players: new Map(allPlayers.map((p) => [p.id, p])), inMatches },
    allPlayers,
  };
}

// ===========================================================================
// Трансферы сезона
// ===========================================================================

export interface TransfersEditorData {
  base: TransferBase;
  players: SquadPlayerInfo[];
  /** Игроки заявки сезона — их удобнее выбирать первыми. */
  squadIds: Set<number>;
}

export async function loadTransfersEditor(label: string): Promise<TransfersEditorData> {
  const season = (await loadSeasons()).find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  const [transfers, teams, players, squad] = await Promise.all([
    rows<TransferRecord[]>(db().from('transfer').select(TRANSFER_COLUMNS).eq('season_id', season.id)),
    rows<Team[]>(db().from('team').select('id, name').order('name')),
    loadAllPlayers(),
    rows<{ player_id: number }[]>(db().from('squad_member').select('player_id').eq('season_id', season.id)),
  ]);
  return {
    base: {
      season: { id: season.id, label: season.label, start_year: season.start_year, end_year: season.end_year },
      transfers,
      teams,
    },
    players,
    squadIds: new Set(squad.map((s) => s.player_id)),
  };
}

// ===========================================================================
// Справочники
// ===========================================================================

export interface TeamsPageData {
  records: (DirRecord & { match: { count: number }[]; transfer: { count: number }[]; team_name: { count: number }[] })[];
  raw: RawOpponent[];
}

export async function loadTeamsPage(): Promise<TeamsPageData> {
  const [records, unbound] = await Promise.all([
    rows<TeamsPageData['records']>(db().from('team').select('id, name, city, notes, match(count), transfer(count), team_name(count)').order('name')),
    allRows<{ opponent_raw: string | null; season: { label: string; start_year: number } }>((from, to) =>
      db().from('match').select('opponent_raw, season(label, start_year)').is('opponent_id', null).order('id').range(from, to),
    ),
  ]);
  return { records, raw: rawOpponents(unbound) };
}

export interface CoachesPageData {
  records: (DirRecord & { match: { count: number }[] })[];
}

export async function loadCoachesPage(): Promise<CoachesPageData> {
  return {
    records: await rows<CoachesPageData['records']>(
      db().from('coach').select('id, full_name, short_name, birth_date, notes, match(count)').order('short_name'),
    ),
  };
}

/** Где встречается клуб или тренер: матчи (и трансферы клуба) по сезонам. */
export interface UsageData {
  matches: (Pick<MatchRow, 'id' | 'seq' | 'match_date' | 'opponent_raw' | 'result' | 'goals_for' | 'goals_against' | 'extra_time' | 'pens_for' | 'pens_against' | 'awarded'> & {
    season: { label: string; start_year: number };
    team: { name: string } | null;
    opponent_name: string | null;
  })[];
  transfers: { id: number; direction: 'in' | 'out'; transfer_date: string | null; player: { id: number; display_name: string }; season: { label: string; start_year: number } }[];
}

const USAGE_MATCH_COLUMNS =
  'id, seq, match_date, opponent_raw, result, goals_for, goals_against, extra_time, pens_for, pens_against, awarded, season(label, start_year), team(name), opponent_name';

export async function loadUsage(kind: 'team' | 'coach', id: number): Promise<UsageData> {
  const [matches, transfers] = await Promise.all([
    allRows<UsageData['matches'][number]>((from, to) =>
      db()
        .from('match')
        .select(USAGE_MATCH_COLUMNS)
        .eq(kind === 'team' ? 'opponent_id' : 'coach_id', id)
        .order('id')
        .range(from, to),
    ),
    kind === 'team'
      ? rows<UsageData['transfers']>(
          db().from('transfer').select('id, direction, transfer_date, player(id, display_name), season(label, start_year)').eq('other_team_id', id),
        )
      : Promise.resolve([]),
  ]);
  matches.sort((a, b) => a.season.start_year - b.season.start_year || a.season.label.localeCompare(b.season.label) || a.seq - b.seq);
  transfers.sort((a, b) => a.season.start_year - b.season.start_year || (a.transfer_date ?? '').localeCompare(b.transfer_date ?? ''));
  return { matches, transfers };
}

export interface TeamNamesData {
  names: TeamNameRecord[];
  /** Матчи клуба: текст из Excel и сезон — для подсказок и предпросмотра. */
  matches: { opponent_raw: string | null; season: { label: string; start_year: number } }[];
}

export async function loadTeamNames(teamId: number): Promise<TeamNamesData> {
  const [names, matches] = await Promise.all([
    rows<TeamNameRecord[]>(db().from('team_name').select('id, team_id, name, from_year, to_year').eq('team_id', teamId)),
    allRows<TeamNamesData['matches'][number]>((from, to) =>
      db().from('match').select('opponent_raw, season(label, start_year)').eq('opponent_id', teamId).order('id').range(from, to),
    ),
  ]);
  return { names, matches };
}
