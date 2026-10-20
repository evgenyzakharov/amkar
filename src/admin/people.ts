// Сборная сезона по местам схемы и карточка игрока (ФИО, дата рождения, позиция, воспитанник, ссылки).
import type { LinkSite, Position } from '../db/types';
import { formationOf } from '../format';
import { decimalText, parseDecimal } from './points';
import type { Writer } from './writer';

// ===========================================================================
// Сборная сезона
// ===========================================================================

/** Все места, которые принимает база (season_best_xi_slot_check), — от вратаря к нападению. */
export const BEST_XI_SLOTS = [
  'GK',
  'LWB', 'LB', 'CB1', 'CB2', 'CB3', 'RB', 'RWB',
  'DM1', 'DM2', 'LM', 'CM1', 'CM2', 'CM3', 'RM', 'AM',
  'LW', 'ST1', 'ST2', 'RW',
] as const;
export type Slot = (typeof BEST_XI_SLOTS)[number];

export interface BestXiRecord {
  season_id: number;
  slot: Slot;
  player_id: number;
}

/** Место → player_id строкой, '' — пусто. Места не из схемы тоже здесь: при сохранении они снимаются. */
export type BestXiDraft = Record<Slot, string>;

export function bestXiDraft(rows: BestXiRecord[]): BestXiDraft {
  const draft = Object.fromEntries(BEST_XI_SLOTS.map((s) => [s, ''])) as BestXiDraft;
  for (const r of rows) draft[r.slot] = String(r.player_id);
  return draft;
}

/** Места схемы; '' — без схемы, 13 мест как в Excel. */
export const formationSlots = (formation: string) => formationOf(formation).lines.flat() as Slot[];

/** Заполненные места не из схемы: эти игроки снимутся при сохранении. */
export const slotsOutside = (draft: BestXiDraft, formation: string) =>
  BEST_XI_SLOTS.filter((s) => draft[s] && !formationSlots(formation).includes(s));

export function validateBestXi(draft: BestXiDraft, formation: string, nameOf: (id: number) => string) {
  const errors: string[] = [];
  const count = new Map<string, number>();
  for (const s of formationSlots(formation)) if (draft[s]) count.set(draft[s], (count.get(draft[s]) ?? 0) + 1);
  for (const [id, n] of count) if (n > 1) errors.push(`${nameOf(Number(id))} стоит в сборной ${n} раза.`);
  return errors;
}

/** Сохранится ли что-то: схема или игроки на местах схемы (места вне схемы при сохранении опустеют). */
export function isBestXiDirty(draft: BestXiDraft, formation: string, rows: BestXiRecord[], savedFormation: string) {
  const saved = bestXiDraft(rows);
  const slots = formationSlots(formation);
  return formation !== savedFormation || BEST_XI_SLOTS.some((s) => saved[s] !== (slots.includes(s) ? draft[s] : ''));
}

/** Поставить игрока на место; если он стоял на месте вне схемы — оттуда убрать, чтобы при смене схемы не раздвоился. */
export function placePlayer(draft: BestXiDraft, formation: string, slot: Slot, playerId: string): BestXiDraft {
  const next = { ...draft, [slot]: playerId };
  if (playerId) for (const s of slotsOutside(draft, formation)) if (next[s] === playerId) next[s] = '';
  return next;
}

const SLOT_LINE: Record<Slot, number> = {
  GK: 0,
  LWB: 1, LB: 1, CB1: 1, CB2: 1, CB3: 1, RB: 1, RWB: 1,
  DM1: 2, DM2: 2, LM: 2, CM1: 2, CM2: 2, CM3: 2, RM: 2, AM: 2,
  LW: 3, ST1: 3, ST2: 3, RW: 3,
};
const flank = (s: Slot) => (s.startsWith('L') ? 'L' : s.startsWith('R') ? 'R' : 'C');
const order = (s: Slot) => BEST_XI_SLOTS.indexOf(s);

/**
 * Насколько плохо пересадить игрока с места from на to; null — нельзя.
 * Своя линия и свой фланг — 0, соседняя линия по своему флангу (ЛП → ЛВ) — 1, из центра на фланг и обратно — 2.
 */
function moveCost(from: Slot, to: Slot): number | null {
  const lines = Math.abs(SLOT_LINE[from] - SLOT_LINE[to]);
  if ((SLOT_LINE[from] === 0) !== (SLOT_LINE[to] === 0)) return null;
  if (flank(from) === flank(to)) return lines === 0 || (lines === 1 && flank(from) !== 'C') ? lines : null;
  return lines === 0 && (flank(from) === 'C' || flank(to) === 'C') ? 2 : null;
}

export interface FormationSwitch {
  draft: BestXiDraft;
  /** Кто перешёл на похожее место. */
  moved: { playerId: string; from: Slot; to: Slot }[];
}

/**
 * Сменить схему: игроки на общих местах остаются, остальные пересаживаются на свободные похожие места — сначала
 * самые близкие. Кому места не нашлось, остаётся на прежнем месте вне схемы (снимется при сохранении,
 * вернётся, если схему переключить обратно).
 */
export function switchFormation(draft: BestXiDraft, to: string): FormationSwitch {
  const target = formationSlots(to);
  const next = { ...draft };
  const homeless = BEST_XI_SLOTS.filter((s) => draft[s] && !target.includes(s));
  const options = homeless
    .flatMap((from) => target.filter((t) => !draft[t]).map((t) => ({ from, to: t, cost: moveCost(from, t) })))
    .filter((o): o is { from: Slot; to: Slot; cost: number } => o.cost !== null)
    // при равной цене — от вратаря к нападению, как в BEST_XI_SLOTS: опорник раньше ЦАП займёт место ЦП
    .sort((a, b) => a.cost - b.cost || order(a.from) - order(b.from) || order(a.to) - order(b.to));
  const moved: FormationSwitch['moved'] = [];
  for (const o of options) {
    if (!next[o.from] || next[o.to]) continue;
    moved.push({ playerId: next[o.from], from: o.from, to: o.to });
    next[o.to] = next[o.from];
    next[o.from] = '';
  }
  return { draft: next, moved };
}

/**
 * Записать сборную: схему сезона, места схемы одним upsert, опустевшие места и места вне схемы — удалить.
 * Возвращает строки базы после записи.
 */
export async function saveBestXi(
  w: Writer,
  seasonId: number,
  rows: BestXiRecord[],
  savedFormation: string,
  draft: BestXiDraft,
  formation: string,
) {
  if (formation !== savedFormation) await w.update('season', { best_xi_formation: formation || null }, { id: seasonId });
  const saved = bestXiDraft(rows);
  const slots = formationSlots(formation);
  const wanted = (s: Slot) => (slots.includes(s) ? draft[s] : '');
  const changed = BEST_XI_SLOTS.filter((s) => wanted(s) && wanted(s) !== saved[s]).map((slot) => ({
    season_id: seasonId,
    slot,
    player_id: Number(draft[slot]),
  }));
  const emptied = BEST_XI_SLOTS.filter((s) => !wanted(s) && saved[s]);
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
  /** Путь к фото в бакете player-photos; меняется загрузкой фото, не формой. */
  photo_path: string | null;
  /** Фото по ссылке на внешний сайт — если файла в хранилище нет. */
  photo_url: string | null;
  photo_credit: string | null;
}

export const PLAYER_COLUMNS =
  'id, display_name, last_name, first_name, middle_name, birth_date, academy, position, notes, photo_path, photo_url, photo_credit';

export interface PlayerDraft {
  display_name: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  birth_date: string;
  academy: boolean;
  position: '' | Position;
  notes: string;
  photo_url: string;
  photo_credit: string;
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
    photo_url: p.photo_url ?? '',
    photo_credit: p.photo_credit ?? '',
    links: linksDraft(links),
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
    photo_url: text(d.photo_url),
    photo_credit: text(d.photo_credit),
  };
}

const isHttpsUrl = (url: string) => {
  try {
    return url.startsWith('https://') && !!new URL(url);
  } catch {
    return false;
  }
};

/** Ссылки на сайты: только https://, как проверка в базе. */
export function validateLinks(links: Record<LinkSite, string>, siteLabel: (s: LinkSite) => string) {
  const errors: string[] = [];
  for (const s of LINK_SITE_KEYS) {
    const url = links[s].trim();
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

export function validatePlayer(d: PlayerDraft, siteLabel: (s: LinkSite) => string) {
  const errors: string[] = [];
  if (!d.display_name.trim()) errors.push('«Как показывать» не может быть пустым.');
  if (!d.last_name.trim()) errors.push('Фамилия не может быть пустой.');
  if (d.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(d.birth_date)) errors.push('Дата рождения — в формате ГГГГ-ММ-ДД.');
  if (d.photo_url.trim() && !isHttpsUrl(d.photo_url.trim())) errors.push('Ссылка на фото: адрес должен начинаться с https://');
  return [...errors, ...validateLinks(d.links, siteLabel)];
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
  await saveLinks(w, 'player', p.id, saved.links, d.links);
}

export const linksDraft = (links: { site: LinkSite; url: string }[]) =>
  Object.fromEntries(LINK_SITE_KEYS.map((s) => [s, links.find((l) => l.site === s)?.url ?? ''])) as Record<LinkSite, string>;

/** Ссылки игрока или сезона: заполненные — upsert, стёртые — удалить. */
export async function saveLinks(
  w: Writer,
  owner: 'player' | 'season',
  id: number,
  saved: Record<LinkSite, string>,
  draft: Record<LinkSite, string>,
) {
  const key = owner === 'player' ? 'player_id' : 'season_id';
  const changed = LINK_SITE_KEYS.filter((s) => draft[s].trim() && draft[s].trim() !== saved[s]).map((site) => ({
    [key]: id,
    site,
    url: draft[site].trim(),
  }));
  if (changed.length > 0) await w.upsert(`${owner}_link`, changed, `${key},site`);
  const removed = LINK_SITE_KEYS.filter((s) => !draft[s].trim() && saved[s]);
  if (removed.length > 0) await w.remove(`${owner}_link`, { [key]: id }, ['site', removed]);
}

// ===========================================================================
// Сезон: лига, место, число команд, заметки, ссылки
// ===========================================================================

export interface SeasonRecord {
  id: number;
  label: string;
  start_year: number;
  end_year: number;
  division: string | null;
  tier: number | null;
  final_place: number | null;
  teams_count: number | null;
  notes: string | null;
  /** Голы и передачи за сезон — по карточкам матчей, а не из таблицы автора. */
  goals_from_matches: boolean;
  /** Ожидаемое место для очков сезона; undefined — столбца в базе ещё нет (миграция 20261020200000). */
  expected_place?: number | null;
}

export const SEASON_RECORD_COLUMNS =
  'id, label, start_year, end_year, division, tier, final_place, teams_count, notes, goals_from_matches';

export interface SeasonDraft {
  division: string;
  tier: string;
  final_place: string;
  teams_count: string;
  /** null — поля нет: столбец в базе ещё не создан. */
  expected_place: string | null;
  notes: string;
  goals_from_matches: boolean;
  links: Record<LinkSite, string>;
}

const numText = (n: number | null) => (n == null ? '' : String(n));

export function seasonDraft(s: SeasonRecord, links: { site: LinkSite; url: string }[]): SeasonDraft {
  return {
    division: s.division ?? '',
    tier: numText(s.tier),
    final_place: numText(s.final_place),
    teams_count: numText(s.teams_count),
    expected_place: s.expected_place === undefined ? null : decimalText(s.expected_place),
    notes: s.notes ?? '',
    goals_from_matches: s.goals_from_matches,
    links: linksDraft(links),
  };
}

const intOrNull = (s: string) => {
  const t = s.trim();
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
};

function seasonValues(d: SeasonDraft) {
  const num = (s: string) => {
    const n = intOrNull(s);
    return n == null || Number.isNaN(n) ? null : n;
  };
  const expected = d.expected_place?.trim() ? parseDecimal(d.expected_place) : null;
  return {
    division: d.division.trim() || null,
    tier: num(d.tier),
    final_place: num(d.final_place),
    teams_count: num(d.teams_count),
    // без столбца в базе поле не пишем вовсе
    ...(d.expected_place === null ? {} : { expected_place: expected == null || Number.isNaN(expected) ? null : expected }),
    notes: d.notes.trim() || null,
    goals_from_matches: d.goals_from_matches,
  };
}

export function validateSeason(d: SeasonDraft, siteLabel: (s: LinkSite) => string) {
  const errors: string[] = [];
  const [tier, place, teams] = [intOrNull(d.tier), intOrNull(d.final_place), intOrNull(d.teams_count)];
  if (tier != null && (Number.isNaN(tier) || tier < 1 || tier > 5)) errors.push('Уровень лиги — от 1 до 5 (1 — высший дивизион).');
  if (place != null && (Number.isNaN(place) || place < 1)) errors.push('Место — целое число больше нуля.');
  if (teams != null && (Number.isNaN(teams) || teams < 1)) errors.push('Число команд — целое число больше нуля.');
  if (place != null && teams != null && !Number.isNaN(place) && !Number.isNaN(teams) && place > teams) {
    errors.push('Место не может быть больше числа команд.');
  }
  if (d.expected_place?.trim()) {
    const expected = parseDecimal(d.expected_place);
    if (Number.isNaN(expected) || expected < 1 || !/^\d+([.,]\d)?$/.test(d.expected_place.trim())) {
      errors.push('Ожидаемое место — число от 1, можно с одним знаком после запятой: 2,5 — «между 2-м и 3-м».');
    } else if (teams != null && !Number.isNaN(teams) && expected > teams) {
      errors.push('Ожидаемое место не может быть больше числа команд.');
    }
  }
  return [...errors, ...validateLinks(d.links, siteLabel)];
}

export function isSeasonDirty(d: SeasonDraft, s: SeasonRecord, links: { site: LinkSite; url: string }[]) {
  const saved = seasonDraft(s, links);
  return (
    JSON.stringify(seasonValues(saved)) !== JSON.stringify(seasonValues(d)) ||
    LINK_SITE_KEYS.some((k) => saved.links[k] !== d.links[k].trim())
  );
}

export async function saveSeason(w: Writer, s: SeasonRecord, links: { site: LinkSite; url: string }[], d: SeasonDraft) {
  const saved = seasonDraft(s, links);
  const values = seasonValues(d);
  if (JSON.stringify(seasonValues(saved)) !== JSON.stringify(values)) await w.update('season', values, { id: s.id });
  await saveLinks(w, 'season', s.id, saved.links, d.links);
}
