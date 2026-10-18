// Загрузка данных для страниц. Все запросы — чтение через публичный API с анонимным ключом.
import { NotFoundError, part, type Part } from '../load';
import { supabase } from './supabase';
import type {
  Absence,
  Appearance,
  BestXiSlot,
  ExternalLink,
  Goal,
  MatchDetails,
  Player,
  PlayerListItem,
  PlayerSeasonStats,
  Season,
  SeasonMatch,
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

/** Все строки запроса, страницами по 1000: больше PostgREST за раз не отдаёт. Запросу нужен устойчивый порядок. */
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000;
  const result: T[] = [];
  for (let from = 0; ; from += size) {
    const chunk = await rows<T[]>(page(from, from + size - 1));
    result.push(...chunk);
    if (chunk.length < size) return result;
  }
}

/** Необязательная часть страницы — ссылки на внешние сайты: не загрузились — страница без них. */
async function optional<T>(promise: Promise<T[]>): Promise<T[]> {
  const result = await part(promise);
  return 'data' in result ? result.data : [];
}

export const loadSeasons = () =>
  rows<Season[]>(db().from('season').select(SEASON_COLUMNS).order('start_year').order('end_year'));

export interface SeasonPageData {
  season: Season;
  prev: Season | null;
  next: Season | null;
  matches: SeasonMatch[];
  /** Из view: пока миграция не выполнена, остальная страница всё равно показывается. */
  squad: Part<PlayerSeasonStats[]>;
  bestXi: BestXiSlot[];
  links: ExternalLink[];
}

export async function loadSeason(label: string): Promise<SeasonPageData> {
  const seasons = await loadSeasons();
  const i = seasons.findIndex((s) => s.label === label);
  if (i < 0) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  const season = seasons[i];

  const [matches, squad, bestXi, links] = await Promise.all([
    rows<SeasonMatch[]>(
      db().from('match').select(`${MATCH_COLUMNS}, coach(id, full_name)`).eq('season_id', season.id).order('seq'),
    ),
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
    optional(rows<ExternalLink[]>(db().from('season_link').select('site, url').eq('season_id', season.id))),
  ]);
  return { season, prev: seasons[i - 1] ?? null, next: seasons[i + 1] ?? null, matches, squad, bestXi, links };
}

export interface MatchPageData {
  match: MatchDetails;
  lineup: Appearance[];
  goals: Goal[];
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

  const [lineup, goals, absences, squad, seasonMatches] = await Promise.all([
    rows<Appearance[]>(
      db()
        .from('appearance')
        .select('player_id, role, minutes, minute_on, minute_off, replaced_player_id, injured, sent_off, player(display_name)')
        .eq('match_id', id),
    ),
    rows<Goal[]>(
      db()
        .from('goal')
        .select(
          'id, side, minute, added_time, kind, scorer_id, scorer_name, assist_id, ' +
            'scorer:player!scorer_id(display_name), assist:player!assist_id(display_name)',
        )
        .eq('match_id', id),
    ),
    rows<Absence[]>(db().from('absence').select('player_id, reason, player(display_name)').eq('match_id', id)),
    rows<SquadEntry[]>(
      db().from('squad_member').select('player_id, shirt_number, position, sort_order').eq('season_id', match.season_id),
    ),
    rows<{ id: number }[]>(db().from('match').select('id').eq('season_id', match.season_id).order('seq')),
  ]);
  const i = seasonMatches.findIndex((m) => m.id === id);
  // Голы по ходу матча; без минуты — в конце, в порядке записи
  goals.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || (a.added_time ?? 0) - (b.added_time ?? 0) || a.id - b.id);
  return {
    match,
    lineup,
    goals,
    absences,
    squad,
    prevId: seasonMatches[i - 1]?.id ?? null,
    nextId: seasonMatches[i + 1]?.id ?? null,
  };
}

export interface PlayerPageData {
  player: Player;
  /** Публичная ссылка на фото из бакета player-photos. */
  photoUrl: string | null;
  links: ExternalLink[];
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
      // * — а не список: до миграции 20261018150000 столбцов позиции и фото нет, и страница открывается без них
      .select('*')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!player) throw new NotFoundError(`Игрока №${id} в базе нет.`);

  const [links, career, transfers] = await Promise.all([
    optional(rows<ExternalLink[]>(db().from('player_link').select('site, url').eq('player_id', id))),
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
  const photoUrl = player.photo_path
    ? db().storage.from('player-photos').getPublicUrl(player.photo_path).data.publicUrl
    : null;
  return { player, photoUrl, links, career, transfers };
}

export interface PlayersPageItem extends PlayerListItem {
  /** Первый и последний сезон в заявке «Амкара»; null — игрок известен только по трансферам. */
  firstYear: number | null;
  lastYear: number | null;
  seasons: number;
  games: number;
}

export async function loadPlayers(): Promise<PlayersPageItem[]> {
  const [players, stats] = await Promise.all([
    allRows<PlayerListItem>((from, to) =>
      db().from('player').select('id, display_name, last_name').order('id').range(from, to),
    ),
    allRows<Pick<PlayerSeasonStats, 'player_id' | 'start_year' | 'end_year' | 'games'>>((from, to) =>
      db()
        .from('player_season_stats')
        .select('player_id, start_year, end_year, games')
        .order('player_id')
        .order('season_id')
        .range(from, to),
    ),
  ]);

  const byPlayer = new Map<number, PlayersPageItem>(
    players.map((p) => [p.id, { ...p, firstYear: null, lastYear: null, seasons: 0, games: 0 }]),
  );
  for (const s of stats) {
    const p = byPlayer.get(s.player_id);
    if (!p) continue;
    p.firstYear = Math.min(p.firstYear ?? s.start_year, s.start_year);
    p.lastYear = Math.max(p.lastYear ?? s.end_year, s.end_year);
    p.seasons += 1;
    p.games += s.games;
  }
  return [...byPlayer.values()].sort(
    (a, b) => a.last_name.localeCompare(b.last_name, 'ru') || a.display_name.localeCompare(b.display_name, 'ru'),
  );
}
