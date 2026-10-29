// Загрузка данных для страниц. Все запросы — чтение через публичный API с анонимным ключом.
import type { CoachInfo, CoachMatch, CoachesData, Debut, Tenure } from '../coaches';
import type { OpponentMatch, OpponentTeam } from '../opponents';
import { NotFoundError, part, type Part } from '../load';
import type { SearchIndex } from '../search';
import { fullName, isPlayed } from '../format';
import { supabase } from './supabase';
import type {
  Absence,
  LeagueStats,
  FirstGoal,
  GoalMinute,
  PlayerSeasonAge,
  Appearance,
  BestXiSlot,
  CareerPoints,
  CareerStats,
  ExternalLink,
  GridAbsence,
  GridAppearance,
  Goal,
  MatchDetails,
  MatchRow,
  Milestone,
  Player,
  PlayerListItem,
  PlayerSeasonStats,
  Season,
  SeasonMatch,
  SeasonPoints,
  SeasonSummary,
  SeasonTransfer,
  SquadEntry,
  TeamStreak,
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

const SEASON_COLUMNS =
  'id, label, start_year, end_year, division, tier, final_place, teams_count, league_group, best_xi_formation, matches:match(count)';

/** Сезон с матчами: заведённый заранее пустой сезон посетители не видят, пока в нём не появится матч. */
export const hasMatches = (s: Season) => (s.matches?.[0]?.count ?? 0) > 0;
export const MATCH_COLUMNS =
  'id, seq, round, match_date, venue, opponent_id, opponent_raw, result, goals_for, goals_against, extra_time, ' +
  'pens_for, pens_against, awarded, competition(name, kind), team(name), opponent_name';
const STATS_COLUMNS =
  'season_id, player_id, season_label, start_year, end_year, division, display_name, academy, shirt_number, ' +
  'position, squad_group, on_loan, sort_order, games, minutes, goals, assists, goals_conceded, ' +
  'games_league, minutes_league, goals_league, assists_league, goals_conceded_league';

/** Итоги только чемпионата — из тех же строк player_season_stats, отдельным списком для фильтра «только чемпионат». */
const leagueOf = (stats: Part<(PlayerSeasonStats & LeagueStats)[]>): LeagueStats[] =>
  'data' in stats
    ? stats.data.map(({ season_id, player_id, games_league, minutes_league, goals_league, assists_league, goals_conceded_league }) => ({
        season_id,
        player_id,
        games_league,
        minutes_league,
        goals_league,
        assists_league,
        goals_conceded_league,
      }))
    : [];

// Данные, общие для многих страниц (сезоны, все матчи для тренеров и соперников), за визит грузим один раз:
// переход между страницами и «Назад» — без повторной загрузки. Живут 10 минут; запись из админки сбрасывает их сразу.
const CACHE_TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  // не загрузилось — в следующий раз пробуем снова
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Сбросить кэш — после записи в базу (admin/writer.ts). */
export function clearCache() {
  cache.clear();
}

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

/**
 * Необязательная часть страницы — ссылки, видео, карточки «Истории»: не загрузилась — страница без неё.
 * Только для частей, без которых остальное верно; ошибку видно в консоли браузера.
 */
async function optional<T>(promise: Promise<T[]>): Promise<T[]> {
  const result = await part(promise);
  if ('data' in result) return result.data;
  console.warn('Часть страницы не загрузилась:', result.error);
  return [];
}

export const loadSeasons = () =>
  cached('seasons', () => rows<Season[]>(db().from('season').select(SEASON_COLUMNS).order('start_year').order('end_year')));

/** Схема сборной сезона, '' — без схемы. */
export async function loadFormation(seasonId: number): Promise<string> {
  return (await loadSeasons()).find((s) => s.id === seasonId)?.best_xi_formation ?? '';
}

export interface SeasonPageData {
  season: Season;
  prev: Season | null;
  next: Season | null;
  matches: SeasonMatch[];
  /** Из view: не загрузилась — остальная страница всё равно показывается. */
  squad: Part<PlayerSeasonStats[]>;
  bestXi: BestXiSlot[];
  /** Схема сборной, '' — без схемы. */
  formation: string;
  links: ExternalLink[];
  /** Очки сезона игроков; не загрузились — страница работает без них. */
  points: Part<SeasonPoints[]>;
  /** Итоги только чемпионата; пусто — заявка не загрузилась, фильтра нет. */
  league: LeagueStats[];
  /** Пришли и ушли за сезон — по окнам, как в карточке игрока. */
  transfers: SeasonTransfer[];
}

const POINTS_COLUMNS = 'season_id, player_id, season_label, display_name, position, points, season_rank, overall_rank, adjustment, adjustment_comment';
const CAREER_POINTS_COLUMNS = 'player_id, display_name, seasons, first_season, last_season, value, career_rank, tier';

export async function loadSeason(label: string): Promise<SeasonPageData> {
  const all = await loadSeasons();
  const season = all.find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  // Соседи — среди сезонов с матчами; сам пустой сезон открывается по прямой ссылке (из админки)
  const seasons = all.filter((s) => s === season || hasMatches(s));
  const i = seasons.indexOf(season);

  const [matches, squad, bestXi, links, points, transfers] = await Promise.all([
    rows<SeasonMatch[]>(
      db().from('match').select(`${MATCH_COLUMNS}, coach(id, full_name)`).eq('season_id', season.id).order('seq'),
    ),
    part(
      rows<(PlayerSeasonStats & LeagueStats)[]>(
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
    part(rows<SeasonPoints[]>(db().from('player_season_points').select(POINTS_COLUMNS).eq('season_id', season.id).order('points', { ascending: false }))),
    rows<SeasonTransfer[]>(
      db()
        .from('transfer')
        .select('id, direction, transfer_window, transfer_date, kind, other_team_id, other_team_raw, notes, other_team_name, player(id, display_name)')
        .eq('season_id', season.id)
        .order('id'),
    ),
  ]);
  return {
    season,
    prev: seasons[i - 1] ?? null,
    next: seasons[i + 1] ?? null,
    matches,
    squad,
    bestXi,
    formation: season.best_xi_formation ?? '',
    links,
    points,
    league: leagueOf(squad),
    transfers,
  };
}

export interface PlayerPoints {
  seasons: SeasonPoints[];
  /** null — игрок без сезонов в заявке. */
  career: CareerPoints | null;
  /** Лучший сезон в истории — общая шкала полос у всех игроков. */
  scaleMax: number;
}

/** Лучший сезон в истории: view считает все сезоны всех игроков, поэтому — один раз за визит. */
const loadTopSeasonPoints = () =>
  cached('top-season-points', () =>
    rows<{ points: number }[]>(db().from('player_season_points').select('points').order('points', { ascending: false }).limit(1)),
  );

/** Очки игрока по сезонам и за карьеру. */
async function loadPlayerPoints(id: number): Promise<PlayerPoints> {
  const [seasons, career, top] = await Promise.all([
    rows<SeasonPoints[]>(db().from('player_season_points').select(POINTS_COLUMNS).eq('player_id', id)),
    rows<CareerPoints | null>(db().from('player_career_points').select(CAREER_POINTS_COLUMNS).eq('player_id', id).maybeSingle()),
    loadTopSeasonPoints(),
  ]);
  return { seasons, career, scaleMax: top[0]?.points ?? 0 };
}

export interface PyramidData {
  /** Игроки в пирамиде, по убыванию ценности. */
  careers: CareerPoints[];
  /** Пороги ярусов сверху вниз и сколько лучших сезонов считаются ещё раз. */
  thresholds: number[];
  peakSeasons: number;
  best: SeasonPoints[];
  /** Лига сезона — для таблицы лучших сезонов. */
  divisions: Map<number, string | null>;
}

export async function loadPyramid(): Promise<PyramidData> {
  type Settings = { peak_seasons: number; tier_1_from: number; tier_2_from: number; tier_3_from: number; tier_4_from: number; tier_5_from: number };
  const [careers, settings, best, seasons] = await Promise.all([
    rows<CareerPoints[]>(
      db().from('player_career_points').select(CAREER_POINTS_COLUMNS).not('tier', 'is', null).order('value', { ascending: false }),
    ),
    rows<Settings | null>(
      db().from('points_settings').select('peak_seasons, tier_1_from, tier_2_from, tier_3_from, tier_4_from, tier_5_from').eq('id', 1).maybeSingle(),
    ),
    rows<SeasonPoints[]>(db().from('player_season_points').select(POINTS_COLUMNS).order('points', { ascending: false }).limit(20)),
    loadSeasons(),
  ]);
  if (!settings) throw new Error('Формулы очков в базе нет.');
  return {
    careers,
    thresholds: [settings.tier_1_from, settings.tier_2_from, settings.tier_3_from, settings.tier_4_from, settings.tier_5_from],
    peakSeasons: settings.peak_seasons,
    best,
    divisions: new Map(seasons.map((s) => [s.id, s.division])),
  };
}

export interface MatchPageData {
  match: MatchDetails;
  lineup: Appearance[];
  goals: Goal[];
  absences: Absence[];
  squad: SquadEntry[];
  prevId: number | null;
  nextId: number | null;
  /** Зрители; null — не записано. */
  attendance: number | null;
}

export async function loadMatch(id: number): Promise<MatchPageData> {
  // Состав, голы и пропуски зависят только от id матча — грузим их вместе с самим матчем
  const details = Promise.all([
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
  ]);
  // ошибку покажет await ниже; если матча нет, она не нужна
  details.catch(() => {});
  const match = await rows<(MatchDetails & { attendance: number | null }) | null>(
    db()
      .from('match')
      .select(`${MATCH_COLUMNS}, season_id, opponent_id, formation, notes, attendance, season(label), coach(id, short_name)`)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!match) throw new NotFoundError(`Матча №${id} в базе нет.`);

  const [[lineup, goals, absences], squad, seasonMatches] = await Promise.all([
    details,
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
    attendance: match.attendance,
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
  /** Очки сезона и рейтинг карьеры; не загрузились — страница работает без них. */
  points: Part<PlayerPoints>;
  /** Итоги только чемпионата по сезонам; пусто — карьера не загрузилась. */
  league: LeagueStats[];
  /** Действующий игрок. */
  current: boolean;
}

// Порядок окон внутри сезона: в сезоне «весна — осень» зимнее окно раньше летнего, в «осень — весна» — наоборот
const windowOrder = (t: Transfer) => {
  const winterFirst = t.season.start_year === t.season.end_year;
  if (t.transfer_window === 'winter') return winterFirst ? 0 : 1;
  if (t.transfer_window === 'summer') return winterFirst ? 1 : 0;
  return 2;
};

export async function loadPlayer(id: number): Promise<PlayerPageData> {
  // Всё остальное зависит только от id игрока — грузим вместе со строкой игрока
  const [player, links, career, transfers, points, current] = await Promise.all([
    rows<Player | null>(db().from('player').select('*').eq('id', id).maybeSingle()),
    optional(rows<ExternalLink[]>(db().from('player_link').select('site, url').eq('player_id', id))),
    part(
      rows<(PlayerSeasonStats & LeagueStats)[]>(
        db().from('player_season_stats').select(STATS_COLUMNS).eq('player_id', id).order('start_year').order('end_year'),
      ),
    ),
    rows<Transfer[]>(
      db()
        .from('transfer')
        .select(
          'id, direction, transfer_window, transfer_date, kind, other_team_id, other_team_raw, notes, season(label, start_year, end_year), team(name), other_team_name',
        )
        .eq('player_id', id),
    ),
    part(loadPlayerPoints(id)),
    rows<{ player_id: number }[]>(db().from('current_player').select('player_id').eq('player_id', id)),
  ]);
  if (!player) throw new NotFoundError(`Игрока №${id} в базе нет.`);
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
  return { player, photoUrl, links, career, transfers, points, league: leagueOf(career), current: current.length > 0 };
}

export interface PlayersPageItem extends PlayerListItem {
  /** Первый и последний сезон в заявке «Амкара»; null — игрок известен только по трансферам. */
  firstYear: number | null;
  lastYear: number | null;
  seasons: number;
  games: number;
  /** Действующий игрок: годы — «2021 — н. в.». */
  current: boolean;
}

export async function loadPlayers(): Promise<PlayersPageItem[]> {
  const [players, careers, current] = await Promise.all([
    allRows<PlayerListItem>((from, to) =>
      db().from('player').select('id, display_name, last_name').order('id').range(from, to),
    ),
    // итоги за карьеру — из view, по тем же правилам, что сезоны
    allRows<Pick<CareerStats, 'player_id' | 'first_year' | 'last_year' | 'seasons' | 'games'>>((from, to) =>
      db().from('player_career_stats').select('player_id, first_year, last_year, seasons, games').order('player_id').range(from, to),
    ),
    loadCurrentPlayers(),
  ]);
  const careerOf = new Map(careers.map((c) => [c.player_id, c]));
  const items = players.map((p): PlayersPageItem => {
    const c = careerOf.get(p.id);
    return {
      ...p,
      firstYear: c?.first_year ?? null,
      lastYear: c?.last_year ?? null,
      seasons: c?.seasons ?? 0,
      games: c?.games ?? 0,
      current: current.has(p.id),
    };
  });
  return items.sort(
    (a, b) => a.last_name.localeCompare(b.last_name, 'ru') || a.display_name.localeCompare(b.display_name, 'ru'),
  );
}

/** Действующие игроки (view current_player). Не загрузились — ошибка страницы: иначе у них были бы годы, как у ушедших. */
export async function loadCurrentPlayers(): Promise<Set<number>> {
  const list = await rows<{ player_id: number }[]>(db().from('current_player').select('player_id'));
  return new Set(list.map((r) => r.player_id));
}

export interface LeadersData {
  careers: CareerStats[];
  current: Set<number>;
}

/** Итоги всех игроков за карьеру — для страницы лидеров; сортирует и режет страница. */
export async function loadLeaders(): Promise<LeadersData> {
  const [careers, current] = await Promise.all([
    allRows<CareerStats>((from, to) =>
      db()
        .from('player_career_stats')
        .select('player_id, display_name, last_name, first_year, last_year, games, games_league, goals, goals_league')
        .order('player_id')
        .range(from, to),
    ),
    loadCurrentPlayers(),
  ]);
  return { careers, current };
}

export interface SeasonGridData {
  appearances: GridAppearance[];
  absences: GridAbsence[];
}

/** Выходы и пропуски всех матчей сезона — для тепловой карты. Выходов в сезоне бывает больше 1000: грузим страницами. */
export async function loadSeasonGrid(seasonId: number): Promise<SeasonGridData> {
  const [appearances, absences] = await Promise.all([
    allRows<GridAppearance>((from, to) =>
      db()
        .from('appearance')
        .select('match_id, player_id, role, minutes, injured, sent_off, match!inner(season_id)')
        .eq('match.season_id', seasonId)
        .order('match_id')
        .order('player_id')
        .range(from, to),
    ),
    allRows<GridAbsence>((from, to) =>
      db()
        .from('absence')
        .select('match_id, player_id, reason, match!inner(season_id)')
        .eq('match.season_id', seasonId)
        .order('match_id')
        .order('player_id')
        .range(from, to),
    ),
  ]);
  return { appearances, absences };
}

export interface HistoryPageData {
  /** Все сезоны одной строкой. */
  seasons: SeasonSummary[];
  /** Воспитанники с наибольшим числом матчей. */
  academy: CareerStats[];
  /** Голы по минутам; не загрузились — пусто, карточки нет. Так же возраст, дебюты и первые голы. */
  minutes: GoalMinute[];
  /** Игроки с матчами по сезонам и их возраст. */
  ages: PlayerSeasonAge[];
  /** Дебюты и первые голы — для рекордов возраста. */
  debuts: Debut[];
  firstGoals: FirstGoal[];
  /** Кубковые матчи — для карточки «Кубок России»; не загрузились — карточки нет. */
  cup: AnyMatch[];
  /** «Имя Фамилия» по id игрока — для рекордов возраста. */
  names: Map<number, string>;
}

const loadAges = () =>
  optional(
    allRows<PlayerSeasonAge>((from, to) =>
      db()
        .from('player_season_age')
        .select('*')
        .order('season_id')
        .order('player_id')
        .range(from, to),
    ),
  );

/**
 * Последний матч самого возрастного игрока. Отдельным запросом: последний матч по всем строкам вида
 * считается секунды и не укладывается в лимит анонимного запроса, а по одной строке — мгновенно.
 */
async function withOldestLastMatch(ages: PlayerSeasonAge[]): Promise<PlayerSeasonAge[]> {
  const oldest = ages.filter((a) => a.age_last != null).sort((a, b) => Number(b.age_last) - Number(a.age_last))[0];
  if (!oldest) return ages;
  const [last] = await optional(
    rows<Pick<PlayerSeasonAge, 'last_match_id' | 'last_match_date' | 'last_opponent'>[]>(
      db()
        .from('player_season_age')
        .select('last_match_id, last_match_date, last_opponent')
        .eq('season_id', oldest.season_id)
        .eq('player_id', oldest.player_id),
    ),
  );
  return last ? ages.map((a) => (a === oldest ? { ...a, ...last } : a)) : ages;
}

export async function loadHistory(): Promise<HistoryPageData> {
  const data = await loadHistoryData();
  // Сезон без официальных матчей (заведён заранее) в истории не показываем
  return { ...data, seasons: data.seasons.filter((s) => s.league_played + s.league_unknown > 0) };
}

async function loadHistoryData(): Promise<HistoryPageData> {
  const [seasons, graduates, minutes, ages, debuts, firstGoals, cup, names] = await Promise.all([
    rows<SeasonSummary[]>(
      db()
        .from('season_summary')
        .select(
          'season_id, label, start_year, end_year, division, tier, final_place, teams_count, league_group, league_played, league_wins, ' +
            'league_draws, league_losses, league_unknown, league_points, minutes, academy_minutes',
        )
        .order('start_year')
        .order('end_year'),
    ),
    rows<{ id: number }[]>(db().from('player').select('id').eq('academy', true)),
    optional(rows<GoalMinute[]>(db().from('goal_minutes').select('side, minute, added, competition_kind, goals'))),
    loadAges().then(withOldestLastMatch),
    optional(
      allRows<Debut>((from, to) =>
        db()
          .from('player_debut')
          .select('player_id, display_name, academy, match_id, match_date, coach_id, season_label, start_year, opponent, birth_date')
          .order('player_id')
          .range(from, to),
      ),
    ),
    optional(rows<FirstGoal[]>(db().from('player_first_goal').select('player_id, match_id, match_date, season_label, opponent, minute'))),
    optional(loadAllMatches()).then((all) => all.filter((m) => m.competition.kind === 'cup')),
    namesOrEmpty(),
  ]);
  const academy =
    graduates.length === 0
      ? []
      : await rows<CareerStats[]>(
          db()
            .from('player_career_stats')
            .select('player_id, display_name, last_name, first_year, last_year, games, games_league, goals, goals_league')
            .in(
              'player_id',
              graduates.map((g) => g.id),
            )
            .gt('games', 0)
            .order('games', { ascending: false })
            .order('last_name')
            .limit(10),
        );
  return { seasons, academy, minutes, ages, debuts, firstGoals, cup, names };
}

/** Серии: пять самых длинных за историю и лучшие в каждом сезоне, для всех турниров и только чемпионата. */
export const loadStreaks = () =>
  allRows<TeamStreak>((from, to) =>
    db()
      .from('team_streaks')
      .select(
        'span, scope, kind, season_id, length, wins, draws, losses, rank, first_match_id, first_season_label, first_seq, ' +
          'first_date, last_match_id, last_season_label, last_seq, last_date',
      )
      .order('span')
      .order('scope')
      .order('kind')
      .order('length', { ascending: false })
      .order('first_match_id')
      .range(from, to),
  );

export interface MilestonesData {
  milestones: Milestone[];
  /** Порядок сезонов — чтобы ставить рубежи по времени. */
  seasons: Season[];
}

/** Рубежи игроков: 100, 200, 300… матчей и 50, 100… голов. */
export async function loadMilestones(): Promise<MilestonesData> {
  const [milestones, seasons] = await Promise.all([
    allRows<Milestone>((from, to) =>
      db()
        .from('player_milestones')
        .select('player_id, display_name, stat, milestone, season_id, season_label, match_id, seq, match_date, opponent')
        .order('stat')
        .order('milestone')
        .order('player_id')
        .range(from, to),
    ),
    loadSeasons(),
  ]);
  return { milestones, seasons };
}

// ===========================================================================
// Тренеры
// ===========================================================================

/** Все матчи клуба (около тысячи) — для тренеров, соперников и главной; за визит — один раз. */
export type AnyMatch = CoachMatch & OpponentMatch;

const ALL_MATCH_COLUMNS =
  'id, seq, season_id, coach_id, opponent_id, round, match_date, venue, opponent_raw, opponent_name, result, goals_for, goals_against, ' +
  'extra_time, pens_for, pens_against, awarded, competition(name, kind), team(name)';

export const loadAllMatches = () =>
  cached('matches', () => allRows<AnyMatch>((from, to) => db().from('match').select(ALL_MATCH_COLUMNS).order('id').range(from, to)));

/**
 * Всё для статистики тренеров: матчи (около тысячи), сроки и дебюты — одно на все страницы тренеров, поэтому за визит один раз.
 * Сроки обязательны: без них у нынешнего тренера был бы «последний матч».
 */
export const loadCoaches = () => cached('coaches', loadCoachesData);

async function loadCoachesData(): Promise<CoachesData> {
  const [coaches, tenures, seasons, matches, debuts] = await Promise.all([
    rows<CoachInfo[]>(db().from('coach').select('id, full_name, short_name, birth_date').order('id')),
    rows<Tenure[]>(db().from('coach_tenure').select('coach_id, from_date, to_date')),
    loadSeasons(),
    loadAllMatches(),
    optional(
      allRows<Debut>((from, to) =>
        db()
          .from('player_debut')
          .select('player_id, display_name, academy, match_id, match_date, coach_id, season_label, start_year')
          .order('player_id')
          .range(from, to),
      ),
    ),
  ]);
  return { coaches, tenures, seasons, matches, debuts };
}

/** Игрок при тренере: матчи, минуты, голы. */
export interface CoachPlayer {
  player_id: number;
  display_name: string;
  games: number;
  minutes: number;
  goals: number;
}

export interface CoachPageData {
  data: CoachesData;
  players: CoachPlayer[];
}

/** Карточка тренера: общие данные (рекорды считаются среди всех тренеров) и его игроки. */
export async function loadCoachPage(id: number): Promise<CoachPageData> {
  const [data, players] = await Promise.all([
    loadCoaches(),
    optional(rows<CoachPlayer[]>(db().from('coach_player_stats').select('player_id, display_name, games, minutes, goals').eq('coach_id', id))),
  ]);
  if (!data.coaches.some((c) => c.id === id)) throw new NotFoundError(`Тренера №${id} в базе нет.`);
  return { data, players };
}

// ===========================================================================
// Соперники
// ===========================================================================

const OPPONENT_MATCH_COLUMNS = ALL_MATCH_COLUMNS;

export interface OpponentsData {
  teams: OpponentTeam[];
  seasons: Season[];
  matches: OpponentMatch[];
}

/** Все клубы справочника и все матчи с ними: личные встречи считаются на сайте. За визит — один раз. */
export const loadOpponents = () => cached('opponents', loadOpponentsData);

async function loadOpponentsData(): Promise<OpponentsData> {
  const [teams, seasons, matches] = await Promise.all([
    rows<OpponentTeam[]>(db().from('team').select('id, name, city').order('name')),
    loadSeasons(),
    loadAllMatches(),
  ]);
  return { teams, seasons, matches: matches.filter((m) => m.opponent_id != null) };
}

/** Бомбардир «Амкара» в матчах с клубом. */
export interface OpponentScorer {
  player_id: number;
  display_name: string;
  goals: number;
}

export interface OpponentPageData {
  team: OpponentTeam;
  seasons: Season[];
  matches: OpponentMatch[];
  scorers: OpponentScorer[];
}

export async function loadOpponent(id: number): Promise<OpponentPageData> {
  const [teams, seasons, matches] = await Promise.all([
    rows<OpponentTeam[]>(db().from('team').select('id, name, city').eq('id', id)),
    loadSeasons(),
    rows<OpponentMatch[]>(db().from('match').select(OPPONENT_MATCH_COLUMNS).eq('opponent_id', id).order('id')),
  ]);
  const team = teams[0];
  if (!team) throw new NotFoundError(`Клуба №${id} в справочнике нет.`);
  const official = matches.filter((m) => m.competition.kind !== 'friendly').map((m) => m.id);
  return { team, seasons, matches, scorers: await scorersOf(official) };
}

/** Бомбардиры «Амкара» в этих матчах: голы без автоголов соперника. */
async function scorersOf(matchIds: number[]): Promise<OpponentScorer[]> {
  if (matchIds.length === 0) return [];
  const goals = await rows<{ scorer_id: number; player: { display_name: string } }[]>(
    db()
      .from('goal')
      .select('scorer_id, player:scorer_id(display_name)')
      .in('match_id', matchIds)
      .eq('side', 'amkar')
      .neq('kind', 'own_goal')
      .not('scorer_id', 'is', null),
  );
  const by = new Map<number, OpponentScorer>();
  for (const g of goals) {
    const s = by.get(g.scorer_id) ?? { player_id: g.scorer_id, display_name: g.player.display_name, goals: 0 };
    s.goals++;
    by.set(g.scorer_id, s);
  }
  return [...by.values()];
}

// ===========================================================================
// Кубок России
// ===========================================================================

export interface CupPageData {
  matches: AnyMatch[];
  seasons: Season[];
  scorers: OpponentScorer[];
}

/** Кубковые матчи — из всех матчей клуба (общий кэш с главной, тренерами и «Историей»), бомбардиры — по их голам. */
export async function loadCup(): Promise<CupPageData> {
  const [all, seasons] = await Promise.all([loadAllMatches(), loadSeasons()]);
  const matches = all.filter((m) => m.competition.kind === 'cup');
  return { matches, seasons, scorers: await scorersOf(matches.map((m) => m.id)) };
}

// ===========================================================================
// Выпускники академии
// ===========================================================================

export interface AcademyPlayer {
  id: number;
  display_name: string;
  first_name: string | null;
  last_name: string;
  birth_date: string | null;
}

export interface AcademyData {
  players: AcademyPlayer[];
  debuts: Debut[];
  firstGoals: FirstGoal[];
  careers: CareerStats[];
}

/** Все воспитанники: дебют, первый гол, итоги за «Амкар». */
export async function loadAcademy(): Promise<AcademyData> {
  const players = await rows<AcademyPlayer[]>(
    db().from('player').select('id, display_name, first_name, last_name, birth_date').eq('academy', true).order('last_name'),
  );
  const ids = players.map((p) => p.id);
  if (ids.length === 0) return { players, debuts: [], firstGoals: [], careers: [] };
  const [debuts, firstGoals, careers] = await Promise.all([
    optional(
      rows<Debut[]>(
        db()
          .from('player_debut')
          .select('player_id, display_name, academy, match_id, match_date, coach_id, season_label, start_year, opponent, birth_date')
          .in('player_id', ids),
      ),
    ),
    optional(
      rows<FirstGoal[]>(db().from('player_first_goal').select('player_id, match_id, match_date, season_label, opponent, minute').in('player_id', ids)),
    ),
    rows<CareerStats[]>(
      db()
        .from('player_career_stats')
        .select('player_id, display_name, last_name, first_year, last_year, games, games_league, goals, goals_league')
        .in('player_id', ids),
    ),
  ]);
  return { players, debuts, firstGoals, careers };
}

// ===========================================================================
// Главная
// ===========================================================================

export interface HomeData {
  /** Сезоны с матчами — по порядку. */
  seasons: Season[];
  matches: AnyMatch[];
  /** Действующие игроки с итогами за карьеру — для «Близко к рубежу». */
  current: CareerStats[];
  /** Для «В этот день»: дни рождения игроков с матчами за «Амкар» и тренеров, трансферы с датой. */
  birthdays: { kind: 'player' | 'coach'; id: number; name: string; birth_date: string }[];
  transfers: { id: number; direction: 'in' | 'out'; transfer_date: string; kind: Transfer['kind']; club: string | null; player: { id: number; display_name: string } }[];
  /** «Имя Фамилия» по id игрока — для «В этот день» и «Близко к рубежу». */
  names: Map<number, string>;
}

export async function loadHome(): Promise<HomeData> {
  const [seasons, matches, current, born, played, coaches, transfers, names] = await Promise.all([
    loadSeasons(),
    loadAllMatches(),
    loadCurrentPlayers(),
    allRows<{ id: number; display_name: string; first_name: string | null; last_name: string; birth_date: string }>((from, to) =>
      db().from('player').select('id, display_name, first_name, last_name, birth_date').not('birth_date', 'is', null).order('id').range(from, to),
    ),
    allRows<{ player_id: number; games: number }>((from, to) =>
      db().from('player_career_stats').select('player_id, games').gt('games', 0).order('player_id').range(from, to),
    ),
    rows<{ id: number; full_name: string; birth_date: string }[]>(db().from('coach').select('id, full_name, birth_date').not('birth_date', 'is', null)),
    allRows<{ id: number; direction: 'in' | 'out'; transfer_date: string; kind: Transfer['kind']; other_team_name: string | null; other_team_raw: string | null; player: { id: number; display_name: string } }>(
      (from, to) =>
        db()
          .from('transfer')
          .select('id, direction, transfer_date, kind, other_team_raw, other_team_name, player(id, display_name)')
          .not('transfer_date', 'is', null)
          .order('id')
          .range(from, to),
    ),
    namesOrEmpty(),
  ]);
  const playedIds = new Set(played.map((p) => p.player_id));
  const careers =
    current.size === 0
      ? []
      : await rows<CareerStats[]>(
          db()
            .from('player_career_stats')
            .select('player_id, display_name, last_name, seasons, first_year, last_year, games, games_league, goals, goals_league')
            .in('player_id', [...current]),
        );
  return {
    seasons: seasons.filter(hasMatches),
    matches,
    current: careers,
    birthdays: [
      ...born.filter((p) => playedIds.has(p.id)).map((p) => ({ kind: 'player' as const, id: p.id, name: fullName(p), birth_date: p.birth_date })),
      ...coaches.map((c) => ({ kind: 'coach' as const, id: c.id, name: c.full_name, birth_date: c.birth_date })),
    ],
    transfers: transfers.map((t) => ({ id: t.id, direction: t.direction, transfer_date: t.transfer_date, kind: t.kind, club: t.other_team_name ?? t.other_team_raw, player: t.player })),
    names,
  };
}

// ===========================================================================
// Полные имена
// ===========================================================================

/**
 * «Имя Фамилия» всех игроков (fullName) — для мест, где игрок упомянут поштучно: «В этот день», рубежи, рекорды.
 * View отдают только «как показывать», поэтому имена — отдельным запросом, один раз за визит. Не загрузились —
 * пусто: страницы показывают «как показывать».
 */
export const loadPlayerNames = () =>
  cached('playerNames', async () => {
    const players = await allRows<{ id: number; display_name: string; first_name: string | null; last_name: string }>((from, to) =>
      db().from('player').select('id, display_name, first_name, last_name').order('id').range(from, to),
    );
    return new Map(players.map((p) => [p.id, fullName(p)]));
  });

const namesOrEmpty = () =>
  loadPlayerNames().catch((e: unknown) => {
    console.warn('Имена игроков не загрузились:', e);
    return new Map<number, string>();
  });

// ===========================================================================
// Общий поиск
// ===========================================================================

const span = (from: number | null, to: number | null) => (from == null ? null : from === to || to == null ? String(from) : `${from}–${to}`);

/** Всё для поиска в шапке — при первом нажатии в поле и один раз за визит. */
export const loadSearchIndex = () =>
  cached('search', async (): Promise<SearchIndex> => {
    const [players, careers, teams, names, coaches, tenures, seasons] = await Promise.all([
      allRows<{ id: number; display_name: string; last_name: string; first_name: string | null }>((from, to) =>
        db().from('player').select('id, display_name, last_name, first_name').order('id').range(from, to),
      ),
      allRows<Pick<CareerStats, 'player_id' | 'first_year' | 'last_year' | 'games'>>((from, to) =>
        db().from('player_career_stats').select('player_id, first_year, last_year, games').order('player_id').range(from, to),
      ),
      rows<{ id: number; name: string; city: string | null }[]>(db().from('team').select('id, name, city')),
      rows<{ team_id: number; name: string }[]>(db().from('team_name').select('team_id, name')),
      rows<{ id: number; full_name: string; short_name: string }[]>(db().from('coach').select('id, full_name, short_name')),
      rows<Tenure[]>(db().from('coach_tenure').select('coach_id, from_date, to_date')),
      loadSeasons(),
    ]);
    const careerOf = new Map(careers.map((c) => [c.player_id, c]));
    const year = (d: string | null) => (d ? Number(d.slice(0, 4)) : null);
    return {
      players: players.map((p) => {
        const c = careerOf.get(p.id);
        return { id: p.id, name: p.display_name, last: p.last_name, first: p.first_name, years: c ? span(c.first_year, c.last_year) : null, games: c?.games ?? 0 };
      }),
      teams: teams.map((t) => ({ ...t, names: names.filter((n) => n.team_id === t.id).map((n) => n.name) })),
      coaches: coaches.map((c) => {
        const ts = tenures.filter((t) => t.coach_id === c.id);
        const from = ts.length ? Math.min(...ts.map((t) => year(t.from_date)!)) : null;
        const to = ts.some((t) => !t.to_date) ? null : ts.length ? Math.max(...ts.map((t) => year(t.to_date)!)) : null;
        return { id: c.id, name: c.full_name, short: c.short_name, years: from == null ? null : to == null ? `${from} — н. в.` : span(from, to) };
      }),
      seasons: seasons.filter(hasMatches).map((s) => ({ label: s.label, division: s.division })),
    };
  });

// ===========================================================================
// Карточка игрока: ключевые матчи, тренеры, соперники, все матчи
// ===========================================================================

/** Официальный матч игрока с минутами — для «Все матчи» и всего, что из них считается. */
export interface PlayerMatch {
  minutes: number | null;
  role: 'start' | 'sub' | 'bench' | null;
  match: MatchRow & { season_id: number; opponent_id: number | null; season: { label: string; start_year: number; end_year: number } };
}

export interface PlayerLinksData {
  /** Официальные матчи, где игрок вышел на поле, — по порядку. */
  matches: PlayerMatch[];
  goals: Map<number, number>;
  assists: Map<number, number>;
  coaches: { coach_id: number; name: string; games: number; minutes: number; goals: number }[];
  debutMatchId: number | null;
  firstGoal: { match_id: number; minute: number | null } | null;
}

export async function loadPlayerLinks(id: number): Promise<PlayerLinksData> {
  const [apps, goals, assists, coachStats, coaches, debut, firstGoal] = await Promise.all([
    allRows<PlayerMatch & { match_id: number }>((from, to) =>
      db()
        .from('appearance')
        .select(
          'match_id, minutes, role, match(id, seq, season_id, round, match_date, venue, opponent_id, opponent_raw, opponent_name, result, ' +
            'goals_for, goals_against, extra_time, pens_for, pens_against, awarded, team(name), season(label, start_year, end_year), competition(name, kind))',
        )
        .eq('player_id', id)
        .order('match_id')
        .range(from, to),
    ),
    rows<{ match_id: number }[]>(db().from('goal').select('match_id').eq('scorer_id', id).eq('side', 'amkar').neq('kind', 'own_goal')),
    rows<{ match_id: number }[]>(db().from('goal').select('match_id').eq('assist_id', id)),
    rows<{ coach_id: number; games: number; minutes: number; goals: number }[]>(
      db().from('coach_player_stats').select('coach_id, games, minutes, goals').eq('player_id', id),
    ),
    rows<{ id: number; full_name: string }[]>(db().from('coach').select('id, full_name')),
    rows<{ match_id: number }[]>(db().from('player_debut').select('match_id').eq('player_id', id)),
    rows<{ match_id: number; minute: number | null }[]>(db().from('player_first_goal').select('match_id, minute').eq('player_id', id)),
  ]);
  const count = (list: { match_id: number }[]) => {
    const m = new Map<number, number>();
    for (const g of list) m.set(g.match_id, (m.get(g.match_id) ?? 0) + 1);
    return m;
  };
  const order = (a: PlayerMatch, b: PlayerMatch) =>
    a.match.season.start_year - b.match.season.start_year ||
    a.match.season.end_year - b.match.season.end_year ||
    (a.match.match_date ?? '9999').localeCompare(b.match.match_date ?? '9999') ||
    a.match.seq - b.match.seq;
  const nameOf = new Map(coaches.map((c) => [c.id, c.full_name]));
  return {
    matches: apps.filter((a) => a.match.competition.kind !== 'friendly' && isPlayed(a)).sort(order),
    goals: count(goals),
    assists: count(assists),
    coaches: coachStats
      .map((c) => ({ ...c, name: nameOf.get(c.coach_id) ?? `тренер №${c.coach_id}` }))
      .sort((a, b) => b.games - a.games || b.minutes - a.minutes),
    debutMatchId: debut[0]?.match_id ?? null,
    firstGoal: firstGoal[0] ?? null,
  };
}

// ===========================================================================
// Сравнение игроков и сезонов
// ===========================================================================

export interface ComparePlayer {
  id: number;
  name: string;
  position: Player['position'];
  career: CareerStats | null;
  points: CareerPoints | null;
  seasons: PlayerSeasonStats[];
  seasonPoints: SeasonPoints[];
}

/** Двое для сравнения: итоги за карьеру, ценность в пирамиде и сезоны — одной волной. key: «27-33». */
export async function loadComparePlayers(key: string): Promise<[ComparePlayer, ComparePlayer]> {
  const ids = key.split('-').map(Number);
  const [players, careers, points, seasons, seasonPoints] = await Promise.all([
    rows<{ id: number; display_name: string; first_name: string | null; last_name: string; position: Player['position'] }[]>(
      db().from('player').select('id, display_name, first_name, last_name, position').in('id', ids),
    ),
    rows<CareerStats[]>(
      db().from('player_career_stats').select('player_id, display_name, last_name, seasons, first_year, last_year, games, games_league, goals, goals_league').in('player_id', ids),
    ),
    rows<CareerPoints[]>(db().from('player_career_points').select(CAREER_POINTS_COLUMNS).in('player_id', ids)),
    rows<PlayerSeasonStats[]>(db().from('player_season_stats').select(STATS_COLUMNS).in('player_id', ids).order('start_year').order('end_year')),
    rows<SeasonPoints[]>(db().from('player_season_points').select(POINTS_COLUMNS).in('player_id', ids)),
  ]);
  const one = (id: number): ComparePlayer => {
    const p = players.find((x) => x.id === id);
    if (!p) throw new NotFoundError(`Игрока №${id} в базе нет.`);
    return {
      id,
      name: fullName(p),
      position: p.position,
      career: careers.find((c) => c.player_id === id) ?? null,
      points: points.find((c) => c.player_id === id) ?? null,
      seasons: seasons.filter((s) => s.player_id === id),
      seasonPoints: seasonPoints.filter((s) => s.player_id === id),
    };
  };
  return [one(ids[0]), one(ids[1])];
}

export interface CompareSeason {
  season: Season;
  summary: SeasonSummary;
  /** Голы в официальных матчах со счётом: забито, пропущено и в скольких матчах. */
  goalsFor: number;
  goalsAgainst: number;
  scored: number;
  topScorer: { player_id: number; display_name: string; goals: number } | null;
  ages: PlayerSeasonAge[];
}

/** Два сезона для сравнения. key: «2008|2024». */
export async function loadCompareSeasons(key: string): Promise<[CompareSeason, CompareSeason]> {
  const labels = key.split('|');
  const all = await loadSeasons();
  const picked = labels.map((l) => {
    const s = all.find((x) => x.label === l);
    if (!s) throw new NotFoundError(`Сезона «${l}» в базе нет.`);
    return s;
  });
  const ids = picked.map((s) => s.id);
  const [summaries, matches, scorers, ages] = await Promise.all([
    rows<SeasonSummary[]>(
      db()
        .from('season_summary')
        .select(
          'season_id, label, start_year, end_year, division, tier, final_place, teams_count, league_group, league_played, league_wins, ' +
            'league_draws, league_losses, league_unknown, league_points, minutes, academy_minutes',
        )
        .in('season_id', ids),
    ),
    rows<{ season_id: number; goals_for: number | null; goals_against: number | null }[]>(
      db().from('official_match').select('season_id, goals_for, goals_against').in('season_id', ids),
    ),
    Promise.all(
      ids.map((id) =>
        rows<{ player_id: number; display_name: string; goals: number }[]>(
          db().from('player_season_stats').select('player_id, display_name, goals').eq('season_id', id).order('goals', { ascending: false }).limit(1),
        ),
      ),
    ),
    rows<PlayerSeasonAge[]>(db().from('player_season_age').select('*').in('season_id', ids)),
  ]);
  return picked.map((season, i): CompareSeason => {
    const ms = matches.filter((m) => m.season_id === season.id);
    const top = scorers[i][0];
    return {
      season,
      summary: summaries.find((s) => s.season_id === season.id)!,
      goalsFor: ms.reduce((n, m) => n + (m.goals_for ?? 0), 0),
      goalsAgainst: ms.reduce((n, m) => n + (m.goals_against ?? 0), 0),
      scored: ms.filter((m) => m.goals_for != null).length,
      topScorer: top && top.goals > 0 ? top : null,
      ages: ages.filter((a) => a.season_id === season.id),
    };
  }) as [CompareSeason, CompareSeason];
}
