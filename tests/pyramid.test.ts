import { describe, expect, it } from 'vitest';
import { TIER_NAMES, byTier, seasonSpan, tierBounds, tierName } from '../src/pyramid';

describe('пирамида', () => {
  it('ярусы сверху вниз: имя по номеру, вне пирамиды — пусто', () => {
    expect(TIER_NAMES).toEqual(['Пантеон', 'Легенды', 'Топ', 'Основа', 'Свои']);
    expect([tierName(1), tierName(5), tierName(null), tierName(6)]).toEqual(['Пантеон', 'Свои', null, null]);
  });

  it('границы яруса: у верхнего «от», у остальных — до порога яруса выше', () => {
    const t = [1000, 650, 500, 350, 250];
    // тысячи — с пробелом, как все числа сайта
    const k = (1000).toLocaleString('ru-RU');
    expect([1, 2, 5].map((tier) => tierBounds(tier, t))).toEqual([`от ${k}`, `650–${k}`, '250–350']);
    expect(tierBounds(2, [1000, 650.5, 500, 350, 250])).toBe(`650,5–${k}`);
  });

  it('годы в клубе: один сезон — одной подписью', () => {
    expect([seasonSpan('2007', '2015/16'), seasonSpan('2008', '2008'), seasonSpan(null, null), seasonSpan('2025', null)]).toEqual([
      '2007 — 2015/16',
      '2008',
      '',
      '2025',
    ]);
  });

  it('по ярусам: пустые ярусы остаются, вне пирамиды — не попадают', () => {
    const groups = byTier([
      { id: 1, tier: 1 },
      { id: 2, tier: 3 },
      { id: 3, tier: 3 },
      { id: 4, tier: null },
    ]);
    expect(groups.map((g) => [g.tier, g.rows.map((r) => r.id)])).toEqual([
      [1, [1]],
      [2, []],
      [3, [2, 3]],
      [4, []],
      [5, []],
    ]);
  });
});
