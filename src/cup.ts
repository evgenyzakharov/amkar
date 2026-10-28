// Кубок России: розыгрыши, стадии и итоги — из кубковых матчей «Амкара».
import type { MatchRow } from './db/types';
import { opponentName } from './format';

export interface CupMatch extends MatchRow {
  season_id: number;
}

/**
 * Стадии по порядку — по тому, сколько матчей оставалось выиграть до кубка: 1/256 — девять, финал — один.
 * Раунд, который не узнали по названию, — стадия −1, раньше всех.
 */
export const CUP_STAGES = ['1/2048', '1/1024', '1/512', '1/256', '1/128', '1/64', '1/32', '1/16', '1/8', '1/4', '1/2', 'Финал'] as const;
export const FINAL = CUP_STAGES.length - 1;
export const SEMI = FINAL - 1;
const STAGE_NAMES = [...CUP_STAGES.slice(0, SEMI).map((s) => `${s} финала`), 'полуфинал', 'финал'];
/** С 1/8 финала весенний матч — окончание розыгрыша, начатого прошлым летом. */
const LATE = CUP_STAGES.indexOf('1/8');

/** Раунды «пути регионов»: их шесть, официально — от 1/256 до 1/8 финала («1-й раунд — 1/256 финала», Википедия 2022/23). */
const PATH_ROUNDS = ['перв', 'втор', 'трет', 'четв', 'пят', 'шест'];

function pathRound(round: string): number {
  const m = /^(?:(\d)-й|(\S+)) раунд/i.exec(round);
  if (!m) return -1;
  const n = m[1] ? Number(m[1]) : PATH_ROUNDS.findIndex((w) => m[2].toLowerCase().startsWith(w)) + 1;
  return n >= 1 && n <= PATH_ROUNDS.length ? CUP_STAGES.indexOf('1/256') + n - 1 : -1;
}

/** Стадия по официальному названию: «1/8 финала, второй матч» — 1/8, «Второй раунд пути регионов» — 1/128; неизвестный — −1. */
export function stageOf(round: string | null): number {
  const r = (round ?? '').trim();
  const i = CUP_STAGES.findIndex((s) => r.startsWith(s));
  return i >= 0 ? i : pathRound(r);
}

/**
 * С 2022/23 кубок делится на путь РПЛ и путь регионов. После шести раундов пути регионов (официально 1/256…1/8)
 * команде ещё играть нижнюю сетку: 1/4 и 1/2 — по два этапа с разными соперниками, финал пути, суперфинал.
 * Поэтому по числу матчей до кубка раунды глубже своих названий (Википедия, сверено 28.10.2026):
 * в 2022/23 и финал пути был в два этапа — после 6-го раунда ещё 7 матчей, на 4 ступени глубже (2-й раунд — 1/2048);
 * с 2023/24 финал пути — один матч, на 3 ступени (2-й раунд — 1/1024, 6-й — 1/64).
 * В 2021/22 группы по три команды заменили 1/32 и 1/16 — те же два соперника, стадии как названы.
 * Нижнюю сетку «Амкар» пока не играл: для её этапов сдвиг другой, понадобится своё правило.
 */
const PATH_FROM = 2022;
const pathShift = (start: number) => (start < PATH_FROM ? 0 : start === PATH_FROM ? 4 : 3);

/** Стадия матча по числу матчей до кубка; 1-й раунд 2022/23 (1/4096) — в первом столбце, «Амкар» его не играл. */
export function depthOf(round: string | null, start: number): number {
  const stage = stageOf(round);
  return stage >= 0 && stage <= LATE ? Math.max(0, stage - pathShift(start)) : stage;
}

/**
 * Год начала розыгрыша. Розыгрыш идёт с лета до весны; первые раунды в 1990-х играли и весной — это уже следующий
 * розыгрыш (21.04.1996, 1/256 — розыгрыш 1996/97). Весенние матчи с 1/8 — окончание прошлогоднего. Без даты — по сезону.
 */
export function editionStart(m: Pick<CupMatch, 'match_date' | 'round'>, seasonStart: number): number {
  if (!m.match_date) return seasonStart;
  const year = Number(m.match_date.slice(0, 4));
  return Number(m.match_date.slice(5, 7)) >= 7 || stageOf(m.round) < LATE ? year : year - 1;
}

export const editionLabel = (start: number) => `${start}/${String(start + 1).slice(2)}`;

/** Противостояние на стадии: один матч или два с одним соперником. */
export interface CupTie {
  stage: number;
  opponent: string;
  matches: CupMatch[];
  /** На этом сопернике вылетели. */
  lost: boolean;
}

export interface CupEdition {
  label: string;
  start_year: number;
  /** Матчи по порядку. */
  matches: CupMatch[];
  ties: CupTie[];
  /** Самая дальняя стадия; −1 — только неизвестные раунды. */
  best: number;
  /** Выиграли финал. */
  won: boolean;
  /** Розыгрыш идёт, «Амкар» в нём: последний розыгрыш, а последний матч выигран, не сыгран или это первый из двух. */
  alive: boolean;
  exit: CupTie | null;
}

/** Розыгрыши по порядку, старые сначала. seasonStart — год начала сезона матча, для матчей без даты. */
export function cupEditions(matches: CupMatch[], seasonStart: Map<number, number>): CupEdition[] {
  const start = (m: CupMatch) => editionStart(m, seasonStart.get(m.season_id) ?? 0);
  const order = (m: CupMatch) => `${m.match_date ?? `${start(m)}-99`}-${String(m.seq).padStart(3, '0')}`;
  const sorted = [...matches].sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  const by = new Map<number, CupMatch[]>();
  for (const m of sorted) by.set(start(m), [...(by.get(start(m)) ?? []), m]);
  const years = [...by.keys()].sort((a, b) => a - b);
  return years.map((year) => {
    const list = by.get(year)!;
    const ties: CupTie[] = [];
    for (const m of list) {
      const prev = ties.at(-1);
      const stage = depthOf(m.round, year);
      if (prev && prev.stage === stage && prev.opponent === opponentName(m)) prev.matches.push(m);
      else ties.push({ stage, opponent: opponentName(m), matches: [m], lost: false });
    }
    const last = list.at(-1)!;
    const won = stageOf(last.round) === FINAL && last.result === 'W';
    const alive = year === years.at(-1) && !won && (last.result === 'W' || last.result == null || /первый матч/.test(last.round ?? ''));
    const exit = won || alive ? null : ties.at(-1)!;
    if (exit) exit.lost = true;
    return { label: editionLabel(year), start_year: year, matches: list, ties, best: Math.max(...ties.map((t) => t.stage)), won, alive, exit };
  });
}

export const stageName = (stage: number) => (stage < 0 ? 'отбор' : STAGE_NAMES[stage]);

/** Итог розыгрыша — стадия вылета, как в протоколе: «1/8 финала», «Третий раунд пути регионов»; «обладатель»; идущий — «в игре: …». */
export function editionResult(e: CupEdition): string {
  if (e.won) return 'обладатель';
  const round = e.matches.at(-1)!.round?.replace(/,.*$/, '') || stageName(e.best);
  return e.alive ? `в игре: ${round}` : round;
}

/** Счёт коротко: «2:2, пен. 1:4»; без счёта — пусто. */
export function shortScore(m: Pick<MatchRow, 'goals_for' | 'goals_against' | 'pens_for' | 'pens_against'>): string {
  if (m.goals_for == null || m.goals_against == null) return '';
  return `${m.goals_for}:${m.goals_against}${m.pens_for != null && m.pens_against != null ? `, пен. ${m.pens_for}:${m.pens_against}` : ''}`;
}

/** Счёт противостояния: «3:0 / 2:1»; неизвестный счёт матча — прочерк, ни одного известного — пусто. */
export const tieScore = (t: CupTie) => (t.matches.some((m) => shortScore(m)) ? t.matches.map((m) => shortScore(m) || '—').join(' / ') : '');

/** Крупнейшие победы: по разнице мячей, затем по забитым, затем раньше по дате. */
export function biggestWins<M extends Pick<MatchRow, 'goals_for' | 'goals_against' | 'match_date'>>(matches: M[], n: number): M[] {
  const margin = (m: M) => m.goals_for! - m.goals_against!;
  return matches
    .filter((m) => m.goals_for != null && m.goals_against != null && margin(m) > 0)
    .sort((a, b) => margin(b) - margin(a) || b.goals_for! - a.goals_for! || (a.match_date ?? '').localeCompare(b.match_date ?? ''))
    .slice(0, n);
}

/** Матчи с серией пенальти — новые сначала. */
export const shootouts = <M extends Pick<MatchRow, 'pens_for' | 'pens_against' | 'match_date'>>(matches: M[]) =>
  matches.filter((m) => m.pens_for != null && m.pens_against != null).sort((a, b) => (b.match_date ?? '').localeCompare(a.match_date ?? ''));
