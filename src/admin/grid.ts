// Сетка сезона «игроки × матчи», как в таблице автора: в ячейке минуты.
// Пусто — не в заявке на матч, 0 — в запасе, число — минуты на поле, «+» — в заявке, минуты неизвестны.
// Пропуск матча — буквой: т — травма, д — дисквалификация, с — сборная.
import type { AbsenceReason, AbsenceRecord, AppearanceRecord } from './match';
import type { Writer } from './writer';

export const ABSENCE_CODE: Record<AbsenceReason, string> = { injury: 'т', suspension: 'д', national_team: 'с' };
const CODE_REASON: Record<string, AbsenceReason> = { т: 'injury', д: 'suspension', с: 'national_team', t: 'injury', d: 'suspension', c: 'national_team' };

export type Cell =
  | { kind: 'none' }
  | { kind: 'minutes'; minutes: number | null }
  | { kind: 'absence'; reason: AbsenceReason }
  | { kind: 'invalid' };

export function parseCell(text: string): Cell {
  const t = text.trim().toLowerCase();
  if (t === '') return { kind: 'none' };
  if (t === '+') return { kind: 'minutes', minutes: null };
  if (CODE_REASON[t]) return { kind: 'absence', reason: CODE_REASON[t] };
  if (/^\d{1,3}$/.test(t) && Number(t) <= 130) return { kind: 'minutes', minutes: Number(t) };
  return { kind: 'invalid' };
}

export const cellKey = (matchId: number, playerId: number) => `${matchId}:${playerId}`;

export function cellText(a: AppearanceRecord | undefined, b: AbsenceRecord | undefined): string {
  if (a) return a.minutes == null ? '+' : String(a.minutes);
  if (b) return ABSENCE_CODE[b.reason];
  return '';
}

/** Что сейчас в базе: строки состава и пропусков сезона по ключу ячейки. */
export interface GridBase {
  appearances: Map<string, AppearanceRecord>;
  absences: Map<string, AbsenceRecord>;
}

export function gridBase(appearances: AppearanceRecord[], absences: AbsenceRecord[]): GridBase {
  return {
    appearances: new Map(appearances.map((a) => [cellKey(a.match_id, a.player_id), a])),
    absences: new Map(absences.map((a) => [cellKey(a.match_id, a.player_id), a])),
  };
}

const APPEARANCE_FIELDS = ['role', 'minutes', 'minute_on', 'minute_off', 'replaced_player_id', 'injured', 'sent_off'] as const;

const sameAppearance = (a: AppearanceRecord | undefined, b: AppearanceRecord | undefined) =>
  a === b || (!!a && !!b && APPEARANCE_FIELDS.every((f) => a[f] === b[f]));
const sameAbsence = (a: AbsenceRecord | undefined, b: AbsenceRecord | undefined) => a?.reason === b?.reason;

/**
 * Ячейки, которые правка действительно меняет. Сравниваются обе строки ячейки, а не текст:
 * после сбоя посередине записи в базе могут оказаться и выход на поле, и пропуск сразу.
 */
export function changedCells(base: GridBase, edits: Map<string, string>): string[] {
  return [...edits]
    .filter(([key, text]) => {
      const next = parseCell(text);
      if (next.kind === 'invalid') return true;
      const [row, absence] = cellRows(next, key, base);
      return !sameAppearance(row, base.appearances.get(key)) || !sameAbsence(absence, base.absences.get(key));
    })
    .map(([key]) => key);
}

const splitKey = (key: string) => key.split(':').map(Number) as [number, number];

/** Строки базы, которые получатся из ячейки. Роль и замены старой строки сохраняются, пока они не противоречат минутам. */
function cellRows(cell: Cell, key: string, base: GridBase): [AppearanceRecord | undefined, AbsenceRecord | undefined] {
  const [matchId, playerId] = splitKey(key);
  if (cell.kind === 'absence') return [undefined, { match_id: matchId, player_id: playerId, reason: cell.reason }];
  if (cell.kind !== 'minutes') return [undefined, undefined];
  const old = base.appearances.get(key);
  const row: AppearanceRecord = old
    ? { ...old, minutes: cell.minutes }
    : {
        match_id: matchId,
        player_id: playerId,
        role: null,
        minutes: cell.minutes,
        minute_on: null,
        minute_off: null,
        replaced_player_id: null,
        injured: false,
        sent_off: false,
      };
  if (cell.minutes === 0) {
    // 0 — в запасе, как в таблице автора: ни выхода, ни замены
    Object.assign(row, { role: 'bench', minute_on: null, minute_off: null, replaced_player_id: null });
  } else if (row.role === 'bench') {
    // был в запасе, а теперь с минутами — вышел, но как, неизвестно
    row.role = null;
  }
  return [row, undefined];
}

export interface GridPlan {
  upserts: AppearanceRecord[];
  deletes: Map<number, number[]>;
  absenceUpserts: AbsenceRecord[];
  absenceDeletes: Map<number, number[]>;
  errors: string[];
}

export function planGrid(base: GridBase, edits: Map<string, string>, nameOf: (id: number) => string, matchLabel: (id: number) => string): GridPlan {
  const plan: GridPlan = { upserts: [], deletes: new Map(), absenceUpserts: [], absenceDeletes: new Map(), errors: [] };
  const push = (map: Map<number, number[]>, matchId: number, playerId: number) => map.set(matchId, [...(map.get(matchId) ?? []), playerId]);
  const touched = new Set<number>();

  for (const key of changedCells(base, edits)) {
    const [matchId, playerId] = splitKey(key);
    const cell = parseCell(edits.get(key)!);
    if (cell.kind === 'invalid') {
      plan.errors.push(`${matchLabel(matchId)}, ${nameOf(playerId)}: «${edits.get(key)}» — непонятно. Число минут, 0, «+», т, д или с.`);
      continue;
    }
    const [row, absence] = cellRows(cell, key, base);
    if (row && !sameAppearance(row, base.appearances.get(key))) plan.upserts.push(row);
    else if (!row && base.appearances.has(key)) push(plan.deletes, matchId, playerId);
    if (absence && !sameAbsence(absence, base.absences.get(key))) plan.absenceUpserts.push(absence);
    else if (!absence && base.absences.has(key)) push(plan.absenceDeletes, matchId, playerId);
    touched.add(matchId);
  }

  // Убрать из заявки того, кого кто-то заменил, нельзя: в базе ссылка «кого заменил»
  for (const matchId of touched) {
    const removed = new Set(plan.deletes.get(matchId) ?? []);
    if (removed.size === 0) continue;
    const after = new Map<number, AppearanceRecord>();
    for (const a of base.appearances.values()) if (a.match_id === matchId && !removed.has(a.player_id)) after.set(a.player_id, a);
    for (const a of plan.upserts) if (a.match_id === matchId) after.set(a.player_id, a);
    for (const a of after.values()) {
      if (a.replaced_player_id != null && removed.has(a.replaced_player_id)) {
        plan.errors.push(
          `${matchLabel(matchId)}: ${nameOf(a.player_id)} вышел вместо ${nameOf(a.replaced_player_id)} — ` +
            `сначала уберите эту замену в карточке матча.`,
        );
      }
    }
  }
  return plan;
}

export interface GridSaveOutcome {
  base: GridBase;
  error: unknown;
}

/** Запись сетки: состав одним upsert, удаления — по матчам. Записанное сразу попадает в base. */
export async function saveGrid(w: Writer, base0: GridBase, plan: GridPlan): Promise<GridSaveOutcome> {
  const base: GridBase = { appearances: new Map(base0.appearances), absences: new Map(base0.absences) };
  try {
    if (plan.upserts.length > 0) {
      await w.upsert('appearance', plan.upserts as unknown as Record<string, unknown>[], 'match_id,player_id');
      for (const a of plan.upserts) base.appearances.set(cellKey(a.match_id, a.player_id), a);
    }
    for (const [matchId, players] of plan.deletes) {
      await w.remove('appearance', { match_id: matchId }, ['player_id', players]);
      for (const p of players) base.appearances.delete(cellKey(matchId, p));
    }
    if (plan.absenceUpserts.length > 0) {
      await w.upsert('absence', plan.absenceUpserts as unknown as Record<string, unknown>[], 'match_id,player_id');
      for (const a of plan.absenceUpserts) base.absences.set(cellKey(a.match_id, a.player_id), a);
    }
    for (const [matchId, players] of plan.absenceDeletes) {
      await w.remove('absence', { match_id: matchId }, ['player_id', players]);
      for (const p of players) base.absences.delete(cellKey(matchId, p));
    }
    return { base, error: null };
  } catch (error) {
    return { base, error };
  }
}
