// Заявка сезона: номер, позиция, основа или молодёжь, аренда, порядок строк; добавить и убрать игрока.
// «Воспитанник» — флаг игрока целиком (player.academy), а не заявки: меняется сразу во всех сезонах.
import type { Position } from '../db/types';
import type { Writer } from './writer';

export interface SquadRecord {
  season_id: number;
  player_id: number;
  shirt_number: number | null;
  position: Position | null;
  squad_group: 'main' | 'youth';
  on_loan: boolean;
  sort_order: number | null;
}

export interface SquadPlayerInfo {
  id: number;
  display_name: string;
  last_name: string;
  first_name: string | null;
  birth_date: string | null;
  academy: boolean;
  /** Сезоны игрока в «Амкаре» — чтобы отличать однофамильцев. */
  seasons: string[];
}

export interface SquadBase {
  seasonId: number;
  rows: SquadRecord[];
  players: Map<number, SquadPlayerInfo>;
  /** Кто играл или пропускал матчи этого сезона: такого из заявки не убрать. */
  inMatches: Set<number>;
}

/** Строка формы. Новый игрок — с отрицательным id, пока не заведён в базе. */
export interface SquadRowDraft {
  player_id: number;
  shirt_number: string;
  position: '' | Position;
  squad_group: 'main' | 'youth';
  on_loan: boolean;
  academy: boolean;
  /** Только у нового игрока. */
  newPlayer?: { last_name: string; first_name: string; display_name: string };
}

export function squadDraft(base: SquadBase): SquadRowDraft[] {
  return [...base.rows]
    .sort(
      (a, b) =>
        (a.sort_order ?? 9999) - (b.sort_order ?? 9999) ||
        (base.players.get(a.player_id)?.display_name ?? '').localeCompare(base.players.get(b.player_id)?.display_name ?? '', 'ru'),
    )
    .map((r) => ({
      player_id: r.player_id,
      shirt_number: r.shirt_number == null ? '' : String(r.shirt_number),
      position: r.position ?? '',
      squad_group: r.squad_group,
      on_loan: r.on_loan,
      academy: base.players.get(r.player_id)?.academy ?? false,
    }));
}

let tempId = 0;
export const newTempId = () => --tempId;

export const rowName = (r: SquadRowDraft, base: SquadBase) =>
  r.newPlayer ? r.newPlayer.display_name.trim() || r.newPlayer.last_name.trim() || 'новый игрок' : (base.players.get(r.player_id)?.display_name ?? `игрок №${r.player_id}`);

const shirt = (s: string) => {
  const t = s.trim();
  if (t === '') return null;
  return /^\d{1,2}$/.test(t) && Number(t) >= 1 ? Number(t) : NaN;
};

/** Строка базы из строки формы; порядок в заявке — порядок строк в форме. */
function record(r: SquadRowDraft, index: number, seasonId: number, playerId = r.player_id): SquadRecord {
  return {
    season_id: seasonId,
    player_id: playerId,
    shirt_number: shirt(r.shirt_number) ?? null,
    position: r.position || null,
    squad_group: r.squad_group,
    on_loan: r.on_loan,
    sort_order: index + 1,
  };
}

const sameRecord = (a: SquadRecord | undefined, b: SquadRecord) =>
  !!a &&
  a.shirt_number === b.shirt_number &&
  a.position === b.position &&
  a.squad_group === b.squad_group &&
  a.on_loan === b.on_loan &&
  a.sort_order === b.sort_order;

export function validateSquad(draft: SquadRowDraft[], base: SquadBase) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byNumber = new Map<number, string[]>();
  for (const r of draft) {
    const name = rowName(r, base);
    const n = shirt(r.shirt_number);
    if (Number.isNaN(n)) errors.push(`${name}: номер — от 1 до 99.`);
    else if (n != null) byNumber.set(n, [...(byNumber.get(n) ?? []), name]);
    if (r.newPlayer && !r.newPlayer.last_name.trim()) errors.push('У нового игрока нужна фамилия.');
  }
  for (const [n, names] of byNumber) if (names.length > 1) warnings.push(`Номер ${n} у нескольких: ${names.join(', ')}.`);
  const kept = new Set(draft.map((r) => r.player_id));
  for (const r of base.rows) {
    if (!kept.has(r.player_id) && base.inMatches.has(r.player_id)) {
      errors.push(
        `${base.players.get(r.player_id)?.display_name ?? r.player_id}: есть матчи этого сезона — ` +
          'сначала уберите его из составов (сетка или карточки матчей).',
      );
    }
  }
  return { errors, warnings };
}

export function isSquadDirty(draft: SquadRowDraft[], base: SquadBase): boolean {
  if (draft.length !== base.rows.length) return true;
  const byId = new Map(base.rows.map((r) => [r.player_id, r]));
  return draft.some(
    (r, i) =>
      !!r.newPlayer ||
      !sameRecord(byId.get(r.player_id), record(r, i, base.seasonId)) ||
      (base.players.get(r.player_id)?.academy ?? false) !== r.academy,
  );
}

export interface SquadSaveOutcome {
  base: SquadBase;
  draft: SquadRowDraft[];
  error: unknown;
}

/** Новые игроки → заявка (upsert изменённого) → удаление лишних → флаг «воспитанник». */
export async function saveSquad(w: Writer, base0: SquadBase, draft0: SquadRowDraft[]): Promise<SquadSaveOutcome> {
  let base: SquadBase = { ...base0, players: new Map(base0.players), rows: [...base0.rows] };
  let draft = draft0;
  try {
    for (const r of draft.filter((x) => x.newPlayer)) {
      const p = r.newPlayer!;
      const last = p.last_name.trim();
      const first = p.first_name.trim() || null;
      const [created] = await w.insert<{ id: number }>('player', [
        { display_name: p.display_name.trim() || last, last_name: last, first_name: first, academy: r.academy },
      ]);
      base.players.set(created.id, {
        id: created.id,
        display_name: p.display_name.trim() || last,
        last_name: last,
        first_name: first,
        birth_date: null,
        academy: r.academy,
        seasons: [],
      });
      // дальше строка — обычный игрок: повтор после сбоя не заведёт его второй раз
      draft = draft.map((x) => (x === r ? { ...x, player_id: created.id, newPlayer: undefined } : x));
    }

    const byId = new Map(base.rows.map((r) => [r.player_id, r]));
    const records = draft.map((r, i) => record(r, i, base.seasonId));
    const changed = records.filter((r) => !sameRecord(byId.get(r.player_id), r));
    if (changed.length > 0) {
      await w.upsert('squad_member', changed as unknown as Record<string, unknown>[], 'season_id,player_id');
      const next = new Map(byId);
      for (const r of changed) next.set(r.player_id, r);
      base = { ...base, rows: [...next.values()] };
    }

    const kept = new Set(records.map((r) => r.player_id));
    const removed = base.rows.filter((r) => !kept.has(r.player_id)).map((r) => r.player_id);
    if (removed.length > 0) {
      await w.remove('squad_member', { season_id: base.seasonId }, ['player_id', removed]);
      base = { ...base, rows: base.rows.filter((r) => kept.has(r.player_id)) };
    }

    for (const r of draft) {
      const p = base.players.get(r.player_id);
      if (p && p.academy !== r.academy) {
        await w.update('player', { academy: r.academy }, { id: r.player_id });
        base.players.set(r.player_id, { ...p, academy: r.academy });
      }
    }
    return { base, draft, error: null };
  } catch (error) {
    return { base, draft, error };
  }
}
