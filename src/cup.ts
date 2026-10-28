// Кубок России: розыгрыши, стадии и итоги — из кубковых матчей «Амкара».
import type { MatchRow } from './db/types';
import { opponentName } from './format';

export interface CupMatch extends MatchRow {
  season_id: number;
}

/** Стадии по порядку. Раунд, который не узнали по названию, — стадия −1, раньше 1/256. */
export const CUP_STAGES = ['1/256', '1/128', '1/64', '1/32', '1/16', '1/8', '1/4', '1/2', 'Финал'] as const;
export const FINAL = CUP_STAGES.length - 1;
export const SEMI = FINAL - 1;
const STAGE_NAMES = ['1/256 финала', '1/128 финала', '1/64 финала', '1/32 финала', '1/16 финала', '1/8 финала', '1/4 финала', 'полуфинал', 'финал'];
/** С 1/8 финала весенний матч — окончание розыгрыша, начатого прошлым летом. */
const LATE = CUP_STAGES.indexOf('1/8');

/**
 * Раунды «пути регионов» — те же стадии от 1/256 до 1/8: раундов шесть, первый — 1/256 финала (Википедия,
 * розыгрыши 2024/25–2026/27). В базе 2024/25 записан стадиями 1/128…1/8 — это раунды 2–6, а с 2025/26 — раундами.
 */
const PATH_ROUNDS = ['перв', 'втор', 'трет', 'четв', 'пят', 'шест'];

function pathRound(round: string): number {
  const m = /^(?:(\d)-й|(\S+)) раунд/i.exec(round);
  if (!m) return -1;
  const n = m[1] ? Number(m[1]) : PATH_ROUNDS.findIndex((w) => m[2].toLowerCase().startsWith(w)) + 1;
  return n >= 1 && n <= PATH_ROUNDS.length ? n - 1 : -1;
}

/** Стадия по названию раунда: «1/8 финала, второй матч» — 1/8, «Второй раунд пути регионов» — 1/128; неизвестный — −1. */
export function stageOf(round: string | null): number {
  const r = (round ?? '').trim();
  const i = CUP_STAGES.findIndex((s) => r.startsWith(s));
  return i >= 0 ? i : pathRound(r);
}

/** Название раунда из протокола; у раунда «пути регионов» — и стадия: «Второй раунд пути регионов (1/128)». */
export function roundText(round: string | null): string {
  if (!round) return '—';
  const stage = pathRound(round.trim());
  return stage >= 0 ? `${round} (${CUP_STAGES[stage]})` : round;
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
      const stage = stageOf(m.round);
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

/** Итог розыгрыша: «обладатель», «финал», «1/8 финала»; идущий — «в игре: …». */
export function editionResult(e: CupEdition): string {
  if (e.won) return 'обладатель';
  return e.alive ? `в игре: ${stageName(e.best)}` : stageName(e.best);
}

/** Счёт коротко: «2:2, пен. 1:4»; без счёта — пусто. */
export function shortScore(m: Pick<MatchRow, 'goals_for' | 'goals_against' | 'pens_for' | 'pens_against'>): string {
  if (m.goals_for == null || m.goals_against == null) return '';
  return `${m.goals_for}:${m.goals_against}${m.pens_for != null && m.pens_against != null ? `, пен. ${m.pens_for}:${m.pens_against}` : ''}`;
}

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
