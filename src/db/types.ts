// Строки таблиц и view из supabase/migrations. Добавляем по мере того, как страницы начинают их читать.
// Вложенные объекты (competition, team, player…) — связанные строки, которые PostgREST подтягивает по внешнему ключу.

export type Result = 'W' | 'D' | 'L';
export type Position = 'GK' | 'DF' | 'MF' | 'FW';
export type CompetitionKind = 'league' | 'cup' | 'europe' | 'playoff' | 'friendly';
export type AbsenceReason = 'injury' | 'suspension' | 'national_team';

export interface Season {
  id: number;
  label: string;
  start_year: number;
  end_year: number;
  division: string | null;
  tier: number | null;
  final_place: number | null;
  teams_count: number | null;
}

/** Матч в списке сезона. */
export interface MatchRow {
  id: number;
  seq: number;
  round: string | null;
  match_date: string | null;
  venue: 'home' | 'away' | 'neutral' | null;
  opponent_raw: string | null;
  result: Result | null;
  goals_for: number | null;
  goals_against: number | null;
  extra_time: boolean;
  pens_for: number | null;
  pens_against: number | null;
  awarded: boolean;
  competition: { name: string; kind: CompetitionKind };
  team: { name: string } | null;
  /** Соперник так, как он назывался в сезон матча (вычисляемый столбец opponent_name). */
  opponent_name?: string | null;
}

export interface MatchDetails extends MatchRow {
  season_id: number;
  formation: string | null;
  notes: string | null;
  season: { label: string };
  coach: { short_name: string } | null;
}

/** Строка view player_season_stats: игрок в заявке сезона с итогами. */
export interface PlayerSeasonStats {
  season_id: number;
  player_id: number;
  season_label: string;
  start_year: number;
  end_year: number;
  division: string | null;
  display_name: string;
  academy: boolean;
  shirt_number: number | null;
  position: Position | null;
  squad_group: 'main' | 'youth';
  on_loan: boolean;
  sort_order: number | null;
  games: number;
  minutes: number;
  goals: number | null;
  assists: number | null;
  goals_conceded: number | null;
  /** Откуда голы и передачи: matches — по матчам, excel — итоги из таблицы автора. */
  goals_source?: 'matches' | 'excel';
}

export interface BestXiSlot {
  slot: string;
  player: { id: number; display_name: string };
}

export interface Appearance {
  player_id: number;
  role: 'start' | 'sub' | 'bench' | null;
  minutes: number | null;
  minute_on: number | null;
  minute_off: number | null;
  replaced_player_id: number | null;
  injured: boolean;
  sent_off: boolean;
  player: { display_name: string };
}

/** Гол матча с именами автора и ассистента. */
export interface Goal {
  id: number;
  side: 'amkar' | 'opponent';
  minute: number | null;
  added_time: number | null;
  kind: 'open_play' | 'penalty' | 'own_goal';
  scorer_id: number | null;
  scorer_name: string | null;
  assist_id: number | null;
  scorer: { display_name: string } | null;
  assist: { display_name: string } | null;
}

export interface Absence {
  player_id: number;
  reason: AbsenceReason;
  player: { display_name: string };
}

/** Номер и позиция игрока в заявке сезона — для состава на матч. */
export interface SquadEntry {
  player_id: number;
  shirt_number: number | null;
  position: Position | null;
  sort_order: number | null;
}

export interface Player {
  id: number;
  display_name: string;
  last_name: string;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string | null;
  academy: boolean;
  notes: string | null;
  /** Основная позиция для карточки игрока. */
  position: Position | null;
  /** Путь к фото в бакете player-photos. */
  photo_path: string | null;
  /** Фото по ссылке на внешний сайт (до миграции 20261018200000 столбца нет). */
  photo_url?: string | null;
  photo_credit: string | null;
}

/** Профиль игрока или страница сезона на внешнем сайте (player_link, season_link). */
export type LinkSite = 'transfermarkt' | 'wikipedia' | 'championat';
export interface ExternalLink {
  site: LinkSite;
  url: string;
}

/** Матч в карточке сезона: с тренером, чтобы найти главного. */
export interface SeasonMatch extends MatchRow {
  coach: { id: number; full_name: string } | null;
}

/** Игрок в списке всех игроков. */
export interface PlayerListItem {
  id: number;
  display_name: string;
  last_name: string;
}

export interface Transfer {
  id: number;
  direction: 'in' | 'out';
  transfer_window: 'winter' | 'summer' | null;
  transfer_date: string | null;
  kind: 'permanent' | 'loan' | 'loan_end' | null;
  other_team_raw: string | null;
  notes: string | null;
  season: { label: string; start_year: number; end_year: number };
  team: { name: string } | null;
  /** Клуб так, как он назывался в сезон трансфера (вычисляемый столбец other_team_name). */
  other_team_name?: string | null;
}

/** Строка view player_career_stats: игрок за все сезоны в заявке «Амкара». */
export interface CareerStats {
  player_id: number;
  display_name: string;
  last_name: string;
  first_year: number;
  last_year: number;
  games: number;
  games_league: number;
  goals: number | null;
  goals_league: number | null;
}

/** Выход игрока в матче — клетка тепловой карты сезона. */
export interface GridAppearance {
  match_id: number;
  player_id: number;
  role: 'start' | 'sub' | 'bench' | null;
  minutes: number | null;
  injured: boolean;
  sent_off: boolean;
}

/** Пропуск матча — клетка тепловой карты сезона. */
export interface GridAbsence {
  match_id: number;
  player_id: number;
  reason: AbsenceReason;
}
