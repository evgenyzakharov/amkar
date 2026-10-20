// Пирамида игроков: названия ярусов и подписи. Пороги ярусов — в базе (points_settings.tier_*_from),
// ярус игрока считает view player_career_points (миграция 20261020210000).

/** Ярусы сверху вниз: ярус 1 — «Пантеон». */
export const TIER_NAMES = ['Пантеон', 'Легенды', 'Топ', 'Основа', 'Свои'] as const;

export const tierName = (tier: number | null | undefined) => (tier ? (TIER_NAMES[tier - 1] ?? null) : null);

/** Годы в клубе подписью: «2007 — 2015/16», один сезон — «2008». */
export function seasonSpan(first: string | null, last: string | null) {
  if (!first) return last ?? '';
  return !last || first === last ? first : `${first} — ${last}`;
}

/** Границы яруса: «от 1000» у верхнего, «650–1000» у остальных. thresholds — tier_1_from … tier_5_from. */
export function tierBounds(tier: number, thresholds: number[]) {
  const from = thresholds[tier - 1];
  const to = thresholds[tier - 2];
  const n = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return to == null ? `от ${n(from)}` : `${n(from)}–${n(to)}`;
}

/** Игроки по ярусам, сверху вниз; ярусы без игроков тоже есть — пирамида не теряет этажей. */
export function byTier<T extends { tier: number | null }>(rows: T[]): { tier: number; rows: T[] }[] {
  return TIER_NAMES.map((_, i) => ({ tier: i + 1, rows: rows.filter((r) => r.tier === i + 1) }));
}
