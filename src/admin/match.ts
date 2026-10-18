// Карточка матча без React: строки базы, черновик формы, перевод одного в другое и проверки.
// Минуты на поле считаются по минутам замен, как в таблице автора: заменённый на 64-й минуте сыграл 64,
// вышедший на 64-й — 26 (до 90-й, с дополнительным временем — до 120-й).
import type { CompetitionKind, Position, Result } from '../db/types';
import { videoSite, type VideoKind } from '../db/videos';

export type Venue = 'home' | 'away' | 'neutral';
export type Role = 'start' | 'sub' | 'bench';
export type AbsenceReason = 'injury' | 'suspension' | 'national_team';
export type GoalSide = 'amkar' | 'opponent';
export type GoalKind = 'open_play' | 'penalty' | 'own_goal';

// ===========================================================================
// Строки базы
// ===========================================================================

export interface MatchRecord {
  id: number;
  season_id: number;
  competition_id: number;
  seq: number;
  round: string | null;
  match_date: string | null;
  venue: Venue | null;
  opponent_id: number | null;
  opponent_raw: string | null;
  result: Result | null;
  goals_for: number | null;
  goals_against: number | null;
  extra_time: boolean;
  pens_for: number | null;
  pens_against: number | null;
  awarded: boolean;
  coach_id: number | null;
  formation: string | null;
  notes: string | null;
}

export type MatchValues = Omit<MatchRecord, 'id'>;

export const MATCH_RECORD_COLUMNS =
  'id, season_id, competition_id, seq, round, match_date, venue, opponent_id, opponent_raw, result, goals_for, ' +
  'goals_against, extra_time, pens_for, pens_against, awarded, coach_id, formation, notes';

export interface AppearanceRecord {
  match_id: number;
  player_id: number;
  role: Role | null;
  minutes: number | null;
  minute_on: number | null;
  minute_off: number | null;
  replaced_player_id: number | null;
  injured: boolean;
  sent_off: boolean;
}

export interface AbsenceRecord {
  match_id: number;
  player_id: number;
  reason: AbsenceReason;
}

export interface GoalRecord {
  id: number;
  match_id: number;
  side: GoalSide;
  minute: number | null;
  added_time: number | null;
  kind: GoalKind;
  scorer_id: number | null;
  scorer_name: string | null;
  assist_id: number | null;
}

export type GoalValues = Omit<GoalRecord, 'id'> & { id?: number };

/** Видео матча (match_video); site база вычисляет сама. */
export interface VideoRecord {
  id: number;
  match_id: number;
  kind: VideoKind;
  url: string;
  title: string | null;
}

export interface VideoDraft {
  key: string;
  id: number | null;
  kind: VideoKind;
  url: string;
  title: string;
}

export interface Team {
  id: number;
  name: string;
}

export interface Coach {
  id: number;
  short_name: string;
  full_name: string;
}

export interface Competition {
  id: number;
  name: string;
  kind: CompetitionKind;
}

/** Игрок, которого можно поставить в состав матча. */
export interface SquadPlayer {
  player_id: number;
  display_name: string;
  shirt_number: number | null;
  position: Position | null;
  squad_group: 'main' | 'youth';
  sort_order: number | null;
  /** false — в составе матча записан, а в заявке сезона его нет. */
  inSquad: boolean;
}

/** Что карточка знает о базе. match = null — новый матч. */
export interface CardBase {
  season: { id: number; label: string; start_year: number; end_year: number };
  match: MatchRecord | null;
  /** Номер для нового матча: следующий после последнего в сезоне. */
  nextSeq: number;
  goals: GoalRecord[];
  appearances: AppearanceRecord[];
  absences: AbsenceRecord[];
  videos: VideoRecord[];
  teams: Team[];
  coaches: Coach[];
}

// ===========================================================================
// Черновик формы: всё строками, как в полях ввода
// ===========================================================================

export interface HeaderDraft {
  seq: string;
  competition_id: string;
  round: string;
  match_date: string;
  venue: '' | Venue;
  /** Название соперника: из справочника или новое — тогда при сохранении заводится в team. */
  opponent: string;
  result: '' | Result;
  goals_for: string;
  goals_against: string;
  extra_time: boolean;
  pens_for: string;
  pens_against: string;
  awarded: boolean;
  /** Тренер: короткое имя из справочника или новое. */
  coach: string;
  formation: string;
  notes: string;
}

/** Статус игрока в карточке: роль в составе, пропуск матча или '' — нет в заявке на матч. */
export type LineupStatus = '' | Role | 'unknown' | AbsenceReason;

export interface LineupRow {
  status: LineupStatus;
  minute_on: string;
  minute_off: string;
  /** Кого заменил: player_id строкой. */
  replaced: string;
  /** null — считать по минутам замен; строка — введено вручную ('' — неизвестно). */
  minutes: string | null;
  injured: boolean;
  sent_off: boolean;
}

export type Lineup = Record<number, LineupRow>;

export interface GoalDraft {
  /** Ключ строки в форме: у новых голов id ещё нет. */
  key: string;
  id: number | null;
  side: GoalSide;
  /** «23» или «90+3». */
  minute: string;
  kind: GoalKind;
  scorer_id: string;
  scorer_name: string;
  assist_id: string;
}

export interface CardDraft {
  header: HeaderDraft;
  goals: GoalDraft[];
  lineup: Lineup;
  videos: VideoDraft[];
}

export const EMPTY_ROW: LineupRow = {
  status: '',
  minute_on: '',
  minute_off: '',
  replaced: '',
  minutes: null,
  injured: false,
  sent_off: false,
};

export const isAppearance = (s: LineupStatus): s is Role | 'unknown' =>
  s === 'start' || s === 'sub' || s === 'bench' || s === 'unknown';
export const isAbsence = (s: LineupStatus): s is AbsenceReason =>
  s === 'injury' || s === 'suspension' || s === 'national_team';

const str = (n: number | null | undefined) => (n == null ? '' : String(n));

/** Целое число из поля ввода: null — пусто, NaN — не число. */
export function parseInt0(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().replaceAll('ё', 'е');

export const findTeam = (teams: Team[], name: string) => teams.find((t) => normName(t.name) === normName(name));
export const findCoach = (coaches: Coach[], name: string) =>
  coaches.find((c) => normName(c.short_name) === normName(name) || normName(c.full_name) === normName(name));

// ===========================================================================
// Шапка матча
// ===========================================================================

export function headerDraft(base: CardBase, competitions: Competition[]): HeaderDraft {
  const m = base.match;
  const league = competitions.find((c) => c.kind === 'league');
  return {
    seq: str(m ? m.seq : base.nextSeq),
    competition_id: str(m ? m.competition_id : league?.id),
    round: m?.round ?? '',
    match_date: m?.match_date ?? '',
    venue: m?.venue ?? '',
    opponent: base.teams.find((t) => t.id === m?.opponent_id)?.name ?? '',
    result: m?.result ?? '',
    goals_for: str(m?.goals_for),
    goals_against: str(m?.goals_against),
    extra_time: m?.extra_time ?? false,
    pens_for: str(m?.pens_for),
    pens_against: str(m?.pens_against),
    awarded: m?.awarded ?? false,
    coach: base.coaches.find((c) => c.id === m?.coach_id)?.short_name ?? '',
    formation: m?.formation ?? '',
    notes: m?.notes ?? '',
  };
}

const byScore = (gf: number, ga: number): Result => (gf > ga ? 'W' : gf < ga ? 'L' : 'D');

/** Какие результаты допускает счёт — как проверка в базе. */
export function allowedResults(h: HeaderDraft): Result[] {
  const [gf, ga, pf, pa] = [h.goals_for, h.goals_against, h.pens_for, h.pens_against].map(parseInt0);
  if (gf == null || ga == null || Number.isNaN(gf) || Number.isNaN(ga)) return ['W', 'D', 'L'];
  if (pf == null || pa == null || Number.isNaN(pf) || Number.isNaN(pa) || pf === pa) return [byScore(gf, ga)];
  return ['D', pf > pa ? 'W' : 'L'];
}

/**
 * После правки счёта: если результат перестал сходиться (или не был задан), ставим подходящий.
 * При серии пенальти — итог серии; результат из Excel, если он допустим, не трогаем.
 */
export function fixResult(h: HeaderDraft): HeaderDraft {
  const allowed = allowedResults(h);
  if (allowed.length === 3 || (h.result && allowed.includes(h.result))) return h;
  return { ...h, result: allowed[allowed.length - 1] };
}

export const matchEnd = (h: Pick<HeaderDraft, 'extra_time'>) => (h.extra_time ? 120 : 90);

export interface HeaderValues {
  values: MatchValues;
  /** Соперник, которого нет в справочнике: заводится при сохранении, opponent_id подставляется тогда же. */
  newTeam: string | null;
  newCoach: string | null;
}

export function headerValues(h: HeaderDraft, base: CardBase): HeaderValues {
  const num = (s: string) => {
    const n = parseInt0(s);
    return n == null || Number.isNaN(n) ? null : n;
  };
  const text = (s: string) => s.trim() || null;
  const opponent = h.opponent.trim();
  const team = opponent ? findTeam(base.teams, opponent) : undefined;
  const coachName = h.coach.trim();
  const coach = coachName ? findCoach(base.coaches, coachName) : undefined;
  return {
    values: {
      season_id: base.season.id,
      competition_id: Number(h.competition_id),
      seq: num(h.seq) ?? 0,
      round: text(h.round),
      match_date: text(h.match_date),
      venue: h.venue || null,
      opponent_id: team?.id ?? null,
      // Текст из Excel остаётся как был: по нему видно, откуда взялся соперник
      opponent_raw: base.match?.opponent_raw ?? null,
      result: h.result || null,
      goals_for: num(h.goals_for),
      goals_against: num(h.goals_against),
      extra_time: h.extra_time,
      pens_for: num(h.pens_for),
      pens_against: num(h.pens_against),
      awarded: h.awarded,
      coach_id: coach?.id ?? null,
      formation: text(h.formation),
      notes: text(h.notes),
    },
    newTeam: opponent && !team ? opponent : null,
    newCoach: coachName && !coach ? coachName : null,
  };
}

export function validateHeader(h: HeaderDraft, base: CardBase): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seq = parseInt0(h.seq);
  if (seq == null || Number.isNaN(seq) || seq < 1) errors.push('Номер матча в сезоне — целое число больше нуля.');
  if (!h.competition_id) errors.push('Выберите турнир.');

  const pair = (a: string, b: string, what: string, max: number) => {
    const [x, y] = [parseInt0(a), parseInt0(b)];
    if ((x != null && (Number.isNaN(x) || x > max)) || (y != null && (Number.isNaN(y) || y > max))) {
      errors.push(`${what}: целые числа от 0 до ${max}.`);
      return null;
    }
    if ((x == null) !== (y == null)) {
      errors.push(`${what}: заполните обе команды или оставьте оба поля пустыми.`);
      return null;
    }
    return x == null || y == null ? null : [x, y];
  };
  const goals = pair(h.goals_for, h.goals_against, 'Счёт', 99);
  const pens = pair(h.pens_for, h.pens_against, 'Серия пенальти', 99);
  if (pens) {
    if (!goals || goals[0] !== goals[1]) errors.push('Серия пенальти бывает только после ничьей — проверьте счёт.');
    else if (pens[0] === pens[1]) errors.push('В серии пенальти должен быть победитель.');
  }
  if (h.result && !allowedResults(h).includes(h.result)) {
    errors.push(pens ? 'Результат не сходится с серией пенальти: можно «ничья» или итог серии.' : 'Результат не сходится со счётом.');
  }
  if (h.awarded && !h.result) errors.push('У технического результата выберите победу, ничью или поражение.');

  if (!h.opponent.trim() && !base.match?.opponent_raw) errors.push('Укажите соперника.');

  if (h.match_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.match_date)) errors.push('Дата — в формате ГГГГ-ММ-ДД.');
    else {
      const year = Number(h.match_date.slice(0, 4));
      if (year < base.season.start_year || year > base.season.end_year) {
        warnings.push(`Дата ${h.match_date.split('-').reverse().join('.')} — вне сезона ${base.season.label}.`);
      }
    }
  }
  return { errors, warnings };
}

// ===========================================================================
// Состав
// ===========================================================================

/** Минуты на поле по минутам замен; null — посчитать нельзя (вышел на замену, а минута выхода не записана). */
export function computeMinutes(row: Pick<LineupRow, 'status' | 'minute_on' | 'minute_off'>, end: number): number | null {
  const on = parseInt0(row.minute_on);
  const off = parseInt0(row.minute_off);
  if (Number.isNaN(on) || Number.isNaN(off)) return null;
  if (row.status === 'bench') return 0;
  if (row.status === 'start') return off ?? end;
  if (row.status === 'sub') {
    if (on == null) return null;
    // Вышедший в самом конце всё равно играл: 0 в таблице автора значит «в запасе»
    return Math.max(1, (off ?? end) - on);
  }
  return null;
}

/** Минуты, которые уйдут в базу: введённые вручную или посчитанные. */
export function rowMinutes(row: LineupRow, end: number): number | null {
  if (row.status === 'bench') return 0;
  if (row.minutes !== null && (row.status === 'unknown' || row.status === 'start' || row.status === 'sub')) {
    const n = parseInt0(row.minutes);
    return n == null || Number.isNaN(n) ? null : n;
  }
  return computeMinutes(row, end);
}

export function lineupDraft(base: CardBase): Lineup {
  const end = base.match?.extra_time ? 120 : 90;
  const lineup: Lineup = {};
  for (const a of base.appearances) {
    const row: LineupRow = {
      status: a.role ?? 'unknown',
      minute_on: str(a.minute_on),
      minute_off: str(a.minute_off),
      replaced: str(a.replaced_player_id),
      minutes: null,
      injured: a.injured,
      sent_off: a.sent_off,
    };
    // Минуты, не совпадающие с подсчётом (старые матчи: минуты есть, минут замен нет), сохраняем как введённые
    if (row.status === 'unknown' || (row.status !== 'bench' && computeMinutes(row, end) !== a.minutes)) {
      row.minutes = str(a.minutes);
    }
    lineup[a.player_id] = row;
  }
  for (const a of base.absences) lineup[a.player_id] = { ...EMPTY_ROW, status: a.reason };
  return lineup;
}

/**
 * Правка строки состава. Заодно:
 * - роль или минуты замен поменялись — минуты снова считаются автоматически;
 * - лишнее для новой роли очищается (минута выхода — только у вышедших на замену);
 * - замена связывается с заменённым: его минута ухода = минута выхода замены, и наоборот.
 */
export function updateRow(lineup: Lineup, playerId: number, patch: Partial<LineupRow>): Lineup {
  const prev = lineup[playerId] ?? EMPTY_ROW;
  let row: LineupRow = { ...prev, ...patch };
  const timingChanged = 'status' in patch || 'minute_on' in patch || 'minute_off' in patch;
  if (timingChanged && row.status !== 'unknown') row.minutes = null;

  if (patch.status !== undefined && patch.status !== prev.status) {
    if (!isAppearance(row.status)) row = { ...EMPTY_ROW, status: row.status };
    if (row.status !== 'sub') row = { ...row, minute_on: '', replaced: '' };
    if (row.status === 'bench') row = { ...row, minute_off: '' };
    if (row.status === 'unknown') row = { ...row, minutes: prev.minutes ?? '' };
  }

  const next: Lineup = { ...lineup, [playerId]: row };
  if (row.status !== 'sub' || !row.replaced) return next;

  const targetId = Number(row.replaced);
  const target = next[targetId];
  if (!target || !isAppearance(target.status)) return next;
  if ('replaced' in patch && !row.minute_on && target.minute_off) {
    next[playerId] = { ...row, minute_on: target.minute_off, minutes: null };
  } else if (
    ('minute_on' in patch || 'replaced' in patch) &&
    row.minute_on &&
    (!target.minute_off || target.minute_off === prev.minute_on)
  ) {
    next[targetId] = { ...target, minute_off: row.minute_on, minutes: target.status === 'unknown' ? target.minutes : null };
  }
  return next;
}

export function lineupRecords(lineup: Lineup, matchId: number, end: number) {
  const appearances: AppearanceRecord[] = [];
  const absences: AbsenceRecord[] = [];
  const ids = Object.keys(lineup)
    .map(Number)
    .sort((a, b) => a - b);
  for (const id of ids) {
    const r = lineup[id];
    if (isAbsence(r.status)) absences.push({ match_id: matchId, player_id: id, reason: r.status });
    if (!isAppearance(r.status)) continue;
    const n = (s: string) => {
      const v = parseInt0(s);
      return v == null || Number.isNaN(v) ? null : v;
    };
    appearances.push({
      match_id: matchId,
      player_id: id,
      role: r.status === 'unknown' ? null : r.status,
      minutes: rowMinutes(r, end),
      minute_on: r.status === 'sub' ? n(r.minute_on) : null,
      minute_off: r.status === 'bench' ? null : n(r.minute_off),
      replaced_player_id: r.status === 'sub' ? n(r.replaced) : null,
      injured: r.injured,
      sent_off: r.sent_off,
    });
  }
  return { appearances, absences };
}

export function validateLineup(lineup: Lineup, nameOf: (id: number) => string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const inMatch = (id: number) => isAppearance(lineup[id]?.status ?? '');
  const replacedBy = new Map<number, number[]>();
  let starters = 0;

  for (const [key, r] of Object.entries(lineup)) {
    const id = Number(key);
    if (!isAppearance(r.status)) continue;
    const name = nameOf(id);
    if (r.status === 'start') starters++;
    const on = parseInt0(r.minute_on);
    const off = parseInt0(r.minute_off);
    if (on != null && (Number.isNaN(on) || on < 1 || on > 130)) errors.push(`${name}: минута выхода — от 1 до 130.`);
    if (off != null && (Number.isNaN(off) || off < 1 || off > 130)) errors.push(`${name}: минута ухода — от 1 до 130.`);
    if (on != null && off != null && off < on) errors.push(`${name}: ушёл с поля раньше, чем вышел.`);
    if (r.minutes !== null && r.minutes.trim() !== '') {
      const m = parseInt0(r.minutes);
      if (m == null || Number.isNaN(m) || m > 130) errors.push(`${name}: минуты на поле — от 0 до 130.`);
    }
    if (r.status === 'sub') {
      if (r.replaced) {
        const target = Number(r.replaced);
        if (target === id) errors.push(`${name} не может заменить сам себя.`);
        else if (!inMatch(target)) errors.push(`${name} заменил игрока (${nameOf(target)}), которого нет в составе на матч.`);
        replacedBy.set(target, [...(replacedBy.get(target) ?? []), id]);
      }
      if (on == null) warnings.push(`${name}: не записана минута выхода — минуты на поле неизвестны.`);
    }
  }
  for (const [target, subs] of replacedBy) {
    if (subs.length > 1) warnings.push(`${nameOf(target)} заменён дважды: ${subs.map(nameOf).join(', ')}.`);
  }
  if (starters > 0 && starters !== 11) warnings.push(`В старте ${starters} игроков, а не 11.`);
  return { errors, warnings };
}

// ===========================================================================
// Голы
// ===========================================================================

/** «23» → 23, «90+3» → 90 и 3; null — пусто; 'invalid' — не разобрать. */
export function parseGoalMinute(s: string): { minute: number; added: number | null } | null | 'invalid' {
  const t = s.trim();
  if (t === '') return null;
  const m = /^(\d{1,3})\s*(?:\+\s*(\d{1,2}))?$/.exec(t);
  if (!m) return 'invalid';
  return { minute: Number(m[1]), added: m[2] ? Number(m[2]) : null };
}

export const formatGoalMinute = (minute: number | null, added: number | null) =>
  minute == null ? '' : added ? `${minute}+${added}` : String(minute);

/** Автор гола выбирается из игроков «Амкара»: наш гол или автогол нашего игрока. Иначе — имя текстом. */
export const scorerIsAmkar = (side: GoalSide, kind: GoalKind) => (side === 'amkar') !== (kind === 'own_goal');
/** Голевая передача — только у гола «Амкара», не автогола. */
export const hasAssist = (side: GoalSide, kind: GoalKind) => side === 'amkar' && kind !== 'own_goal';

let goalKey = 0;
export const newGoalKey = () => `new-${++goalKey}`;

export function goalsDraft(base: CardBase): GoalDraft[] {
  return [...base.goals]
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || (a.added_time ?? 0) - (b.added_time ?? 0) || a.id - b.id)
    .map((g) => ({
      key: `id-${g.id}`,
      id: g.id,
      side: g.side,
      minute: formatGoalMinute(g.minute, g.added_time),
      kind: g.kind,
      scorer_id: str(g.scorer_id),
      scorer_name: g.scorer_name ?? '',
      assist_id: str(g.assist_id),
    }));
}

export function goalValues(g: GoalDraft, matchId: number): GoalValues {
  const minute = parseGoalMinute(g.minute);
  const parsed = minute && minute !== 'invalid' ? minute : null;
  const playerScorer = scorerIsAmkar(g.side, g.kind);
  return {
    ...(g.id != null ? { id: g.id } : {}),
    match_id: matchId,
    side: g.side,
    minute: parsed?.minute ?? null,
    added_time: parsed?.added ?? null,
    kind: g.kind,
    scorer_id: playerScorer && g.scorer_id ? Number(g.scorer_id) : null,
    scorer_name: !playerScorer ? g.scorer_name.trim() || null : null,
    assist_id: hasAssist(g.side, g.kind) && g.assist_id ? Number(g.assist_id) : null,
  };
}

export function validateGoals(goals: GoalDraft[], h: HeaderDraft) {
  const errors: string[] = [];
  const warnings: string[] = [];
  goals.forEach((g, i) => {
    const label = `Гол №${i + 1}`;
    const m = parseGoalMinute(g.minute);
    if (m === 'invalid') errors.push(`${label}: минута — число, добавленное время через плюс: 90+3.`);
    else if (m) {
      if (m.minute < 1 || m.minute > 130) errors.push(`${label}: минута — от 1 до 130.`);
      if (m.added != null) {
        if (![45, 90, 105, 120].includes(m.minute)) errors.push(`${label}: добавленное время бывает только после 45, 90, 105 или 120 минуты.`);
        if (m.added < 1 || m.added > 30) errors.push(`${label}: добавленное время — от 1 до 30 минут.`);
      }
    }
    if (hasAssist(g.side, g.kind) && g.assist_id && g.assist_id === g.scorer_id) {
      errors.push(`${label}: автор и ассистент — один и тот же игрок.`);
    }
  });
  const [gf, ga] = [parseInt0(h.goals_for), parseInt0(h.goals_against)];
  const count = (side: GoalSide) => goals.filter((g) => g.side === side).length;
  if (goals.length > 0 && gf != null && ga != null && !Number.isNaN(gf) && !Number.isNaN(ga)) {
    if (count('amkar') !== gf) warnings.push(`Голов «Амкара» в списке ${count('amkar')}, а в счёте ${gf}.`);
    if (count('opponent') !== ga) warnings.push(`Пропущенных в списке ${count('opponent')}, а в счёте ${ga}.`);
  }
  return { errors, warnings };
}

// ===========================================================================
// Вся карточка
// ===========================================================================

export function cardDraft(base: CardBase, competitions: Competition[]): CardDraft {
  return { header: headerDraft(base, competitions), goals: goalsDraft(base), lineup: lineupDraft(base), videos: videosDraft(base) };
}

// ===========================================================================
// Видео
// ===========================================================================

let videoKey = 0;
export const newVideoKey = () => `new-video-${++videoKey}`;

export function videosDraft(base: CardBase): VideoDraft[] {
  return [...base.videos]
    .sort((a, b) => a.id - b.id)
    .map((v) => ({ key: `id-${v.id}`, id: v.id, kind: v.kind, url: v.url, title: v.title ?? '' }));
}

export function videoValues(v: VideoDraft, matchId: number) {
  return { ...(v.id != null ? { id: v.id } : {}), match_id: matchId, kind: v.kind, url: v.url.trim(), title: v.title.trim() || null };
}

export function validateVideos(videos: VideoDraft[]) {
  const errors: string[] = [];
  const seen = new Set<string>();
  videos.forEach((v, i) => {
    const label = `Видео №${i + 1}`;
    const url = v.url.trim();
    if (!url) errors.push(`${label}: вставьте ссылку.`);
    else if (!url.startsWith('https://')) errors.push(`${label}: ссылка должна начинаться с https://`);
    else if (!videoSite(url)) errors.push(`${label}: только YouTube или ВК.`);
    else if (seen.has(url)) errors.push(`${label}: эта ссылка уже есть.`);
    seen.add(url);
  });
  return { errors, warnings: [] as string[] };
}

export function validateCard(draft: CardDraft, base: CardBase, nameOf: (id: number) => string) {
  const parts = [
    validateHeader(draft.header, base),
    validateGoals(draft.goals, draft.header),
    validateLineup(draft.lineup, nameOf),
    validateVideos(draft.videos),
  ];
  return { errors: parts.flatMap((p) => p.errors), warnings: parts.flatMap((p) => p.warnings) };
}
