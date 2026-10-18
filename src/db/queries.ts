// Загрузка данных для страниц. Все запросы — чтение через публичный API с анонимным ключом.
import { NotFoundError, part, type Part } from '../load';
import { supabase } from './supabase';
import type {
  Absence,
  Appearance,
  BestXiSlot,
  MatchDetails,
  MatchRow,
  Player,
  PlayerSeasonStats,
  Season,
  SquadEntry,
  Transfer,
} from './types';

export function db() {
  if (!supabase) throw new Error('Supabase не настроен: заполните .env');
  return supabase;
}

/** Данные ответа PostgREST или исключение с текстом его ошибки. */
export async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

const SEASON_COLUMNS = 'id, label, start_year, end_year, division, tier, final_place, teams_count';
export const MATCH_COLUMNS =
  'id, seq, round, match_date, venue, opponent_raw, result, goals_for, goals_against, extra_time, ' +
  'pens_for, pens_against, awarded, competition(name, kind), team(name)';
const STATS_COLUMNS =
  'season_id, player_id, season_label, start_year, end_year, division, display_name, academy, shirt_number, ' +
  'position, squad_group, on_loan, sort_order, games, minutes, goals, assists, goals_conceded';

export const loadSeasons = () =>
  rows<Season[]>(db().from('season').select(SEASON_COLUMNS).order('start_year').order('end_year'));

export interface SeasonPageData {
  season: Season;
  prev: Season | null;
  next: Season | null;
  matches: MatchRow[];
  /** Из view: пока миграция не выполнена, остальная страница всё равно показывается. */
  squad: Part<PlayerSeasonStats[]>;
  bestXi: BestXiSlot[];
}

export async function loadSeason(label: string): Promise<SeasonPageData> {
  const seasons = await loadSeasons();
  const i = seasons.findIndex((s) => s.label === label);
  if (i < 0) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  const season = seasons[i];

  const [matches, squad, bestXi] = await Promise.all([
    rows<MatchRow[]>(db().from('match').select(MATCH_COLUMNS).eq('season_id', season.id).order('seq')),
    part(
      rows<PlayerSeasonStats[]>(
        db()
          .from('player_season_stats')
          .select(STATS_COLUMNS)
          .eq('season_id', season.id)
          .order('sort_order', { nullsFirst: false })
          .order('display_name'),
      ),
    ),
    rows<BestXiSlot[]>(db().from('season_best_xi').select('slot, player(id, display_name)').eq('season_id', season.id)),
  ]);
  return { season, prev: seasons[i - 1] ?? null, next: seasons[i + 1] ?? null, matches, squad, bestXi };
}

export interface MatchPageData {
  match: MatchDetails;
  lineup: Appearance[];
  absences: Absence[];
  squad: SquadEntry[];
  prevId: number | null;
  nextId: number | null;
}

export async function loadMatch(id: number): Promise<MatchPageData> {
  const match = await rows<MatchDetails | null>(
    db()
      .from('match')
      .select(`${MATCH_COLUMNS}, season_id, formation, notes, season(label), coach(short_name)`)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!match) throw new NotFoundError(`Матча №${id} в базе нет.`);

  const [lineup, absences, squad, seasonMatches] = await Promise.all([
    rows<Appearance[]>(
      db()
        .from('appearance')
        .select('player_id, role, minutes, minute_on, minute_off, replaced_player_id, injured, sent_off, player(display_name)')
        .eq('match_id', id),
    ),
    rows<Absence[]>(db().from('absence').select('player_id, reason, player(display_name)').eq('match_id', id)),
    rows<SquadEntry[]>(
      db().from('squad_member').select('player_id, shirt_number, position, sort_order').eq('season_id', match.season_id),
    ),
    rows<{ id: number }[]>(db().from('match').select('id').eq('season_id', match.season_id).order('seq')),
  ]);
  const i = seasonMatches.findIndex((m) => m.id === id);
  return {
    match,
    lineup,
    absences,
    squad,
    prevId: seasonMatches[i - 1]?.id ?? null,
    nextId: seasonMatches[i + 1]?.id ?? null,
  };
}

export interface PlayerPageData {
  player: Player;
  career: Part<PlayerSeasonStats[]>;
  transfers: Transfer[];
}

// Порядок окон внутри сезона: в сезоне «весна — осень» зимнее окно раньше летнего, в «осень — весна» — наоборот
const windowOrder = (t: Transfer) => {
  const winterFirst = t.season.start_year === t.season.end_year;
  if (t.transfer_window === 'winter') return winterFirst ? 0 : 1;
  if (t.transfer_window === 'summer') return winterFirst ? 1 : 0;
  return 2;
};

export async function loadPlayer(id: number): Promise<PlayerPageData> {
  const player = await rows<Player | null>(
    db()
      .from('player')
      .select('id, display_name, last_name, first_name, middle_name, birth_date, academy, notes')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!player) throw new NotFoundError(`Игрока №${id} в базе нет.`);

  const [career, transfers] = await Promise.all([
    part(
      rows<PlayerSeasonStats[]>(
        db().from('player_season_stats').select(STATS_COLUMNS).eq('player_id', id).order('start_year').order('end_year'),
      ),
    ),
    rows<Transfer[]>(
      db()
        .from('transfer')
        .select(
          'id, direction, transfer_window, transfer_date, kind, other_team_raw, notes, season(label, start_year, end_year), team(name)',
        )
        .eq('player_id', id),
    ),
  ]);
  transfers.sort(
    (a, b) =>
      a.season.start_year - b.season.start_year ||
      a.season.end_year - b.season.end_year ||
      windowOrder(a) - windowOrder(b) ||
      (a.transfer_date ?? '').localeCompare(b.transfer_date ?? '') ||
      a.id - b.id,
  );
  return { player, career, transfers };
}
