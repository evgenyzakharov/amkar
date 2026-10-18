// Сборная сезона по слотам и карточка игрока (ФИО, дата рождения, позиция, воспитанник, ссылки).
import type { LinkSite, Position } from '../db/types';
import type { Writer } from './writer';

// ===========================================================================
// Сборная сезона
// ===========================================================================

export const BEST_XI_SLOTS = ['GK', 'RB', 'CB1', 'CB2', 'CB3', 'LB', 'RM', 'CM1', 'CM2', 'CM3', 'LM', 'ST1', 'ST2'] as const;
export type Slot = (typeof BEST_XI_SLOTS)[number];

export interface BestXiRecord {
  season_id: number;
  slot: Slot;
  player_id: number;
}

/** Слот → player_id строкой, '' — пусто. */
export type BestXiDraft = Record<Slot, string>;

export function bestXiDraft(rows: BestXiRecord[]): BestXiDraft {
  const draft = Object.fromEntries(BEST_XI_SLOTS.map((s) => [s, ''])) as BestXiDraft;
  for (const r of rows) draft[r.slot] = String(r.player_id);
  return draft;
}

export function validateBestXi(draft: BestXiDraft, nameOf: (id: number) => string) {
  const errors: string[] = [];
  const count = new Map<string, number>();
  for (const s of BEST_XI_SLOTS) if (draft[s]) count.set(draft[s], (count.get(draft[s]) ?? 0) + 1);
  for (const [id, n] of count) if (n > 1) errors.push(`${nameOf(Number(id))} стоит в сборной ${n} раза.`);
  return errors;
}

export function isBestXiDirty(draft: BestXiDraft, rows: BestXiRecord[]) {
  const saved = bestXiDraft(rows);
  return BEST_XI_SLOTS.some((s) => saved[s] !== draft[s]);
}

/** Заполненные слоты — одним upsert, опустевшие — удалить. Возвращает строки базы после записи. */
export async function saveBestXi(w: Writer, seasonId: number, rows: BestXiRecord[], draft: BestXiDraft) {
  const saved = bestXiDraft(rows);
  const changed = BEST_XI_SLOTS.filter((s) => draft[s] && draft[s] !== saved[s]).map((slot) => ({
    season_id: seasonId,
    slot,
    player_id: Number(draft[slot]),
  }));
  const emptied = BEST_XI_SLOTS.filter((s) => !draft[s] && saved[s]);
  let result = rows;
  if (changed.length > 0) {
    await w.upsert('season_best_xi', changed, 'season_id,slot');
    result = [...result.filter((r) => !changed.some((c) => c.slot === r.slot)), ...changed];
  }
  if (emptied.length > 0) {
    await w.remove('season_best_xi', { season_id: seasonId }, ['slot', emptied]);
    result = result.filter((r) => !emptied.includes(r.slot));
  }
  return result;
}

// ===========================================================================
// Карточка игрока
// ===========================================================================

export const LINK_SITE_KEYS: LinkSite[] = ['transfermarkt', 'championat', 'wikipedia'];

export interface PlayerRecord {
  id: number;
  display_name: string;
  last_name: string;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string | null;
  academy: boolean;
  position: Position | null;
  notes: string | null;
}

export const PLAYER_COLUMNS = 'id, display_name, last_name, first_name, middle_name, birth_date, academy, position, notes';

export interface PlayerDraft {
  display_name: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  birth_date: string;
  academy: boolean;
  position: '' | Position;
  notes: string;
  links: Record<LinkSite, string>;
}

export function playerDraft(p: PlayerRecord, links: { site: LinkSite; url: string }[]): PlayerDraft {
  return {
    display_name: p.display_name,
    last_name: p.last_name,
    first_name: p.first_name ?? '',
    middle_name: p.middle_name ?? '',
    birth_date: p.birth_date ?? '',
    academy: p.academy,
    position: p.position ?? '',
    notes: p.notes ?? '',
    links: Object.fromEntries(LINK_SITE_KEYS.map((s) => [s, links.find((l) => l.site === s)?.url ?? ''])) as Record<LinkSite, string>,
  };
}

function playerValues(d: PlayerDraft) {
  const text = (s: string) => s.trim() || null;
  return {
    display_name: d.display_name.trim(),
    last_name: d.last_name.trim(),
    first_name: text(d.first_name),
    middle_name: text(d.middle_name),
    birth_date: text(d.birth_date),
    academy: d.academy,
    position: d.position || null,
    notes: text(d.notes),
  };
}

export function validatePlayer(d: PlayerDraft, siteLabel: (s: LinkSite) => string) {
  const errors: string[] = [];
  if (!d.display_name.trim()) errors.push('«Как показывать» не может быть пустым.');
  if (!d.last_name.trim()) errors.push('Фамилия не может быть пустой.');
  if (d.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(d.birth_date)) errors.push('Дата рождения — в формате ГГГГ-ММ-ДД.');
  for (const s of LINK_SITE_KEYS) {
    const url = d.links[s].trim();
    if (!url) continue;
    let ok = url.startsWith('https://');
    try {
      new URL(url);
    } catch {
      ok = false;
    }
    if (!ok) errors.push(`${siteLabel(s)}: адрес должен начинаться с https://`);
  }
  return errors;
}

export function isPlayerDirty(d: PlayerDraft, p: PlayerRecord, links: { site: LinkSite; url: string }[]) {
  return JSON.stringify(playerDraft(p, links)) !== JSON.stringify({ ...d, ...trimLinks(d) });
}

const trimLinks = (d: PlayerDraft) => ({
  links: Object.fromEntries(LINK_SITE_KEYS.map((s) => [s, d.links[s].trim()])) as Record<LinkSite, string>,
});

/** Игрок — одним update, ссылки: заполненные — upsert, стёртые — удалить. */
export async function savePlayer(w: Writer, p: PlayerRecord, links: { site: LinkSite; url: string }[], d: PlayerDraft) {
  const values = playerValues(d);
  const saved = playerDraft(p, links);
  if (JSON.stringify(playerValues(saved)) !== JSON.stringify(values)) await w.update('player', values, { id: p.id });
  const changed = LINK_SITE_KEYS.filter((s) => d.links[s].trim() && d.links[s].trim() !== saved.links[s]).map((site) => ({
    player_id: p.id,
    site,
    url: d.links[site].trim(),
  }));
  if (changed.length > 0) await w.upsert('player_link', changed, 'player_id,site');
  const removed = LINK_SITE_KEYS.filter((s) => !d.links[s].trim() && saved.links[s]);
  if (removed.length > 0) await w.remove('player_link', { player_id: p.id }, ['site', removed]);
}
