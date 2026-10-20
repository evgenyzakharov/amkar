import { describe, expect, it } from 'vitest';
import { formatHomeScore, formatScore } from '../src/format';

const match = { goals_for: 0, goals_against: 2, extra_time: false, pens_for: null, pens_against: null };

describe('счёт со стороны хозяев', () => {
  it('дома и на нейтральном поле — как у «Амкара», в гостях — наоборот', () => {
    expect(formatHomeScore({ ...match, venue: 'home' })).toBe('0:2');
    expect(formatHomeScore({ ...match, venue: 'neutral' })).toBe('0:2');
    expect(formatHomeScore({ ...match, venue: null })).toBe('0:2');
    expect(formatHomeScore({ ...match, venue: 'away' })).toBe('2:0');
  });

  it('серия пенальти переворачивается вместе со счётом', () => {
    const shootout = { goals_for: 1, goals_against: 1, extra_time: true, pens_for: 4, pens_against: 3 };
    expect(formatScore(shootout)).toBe('1:1 д.в. (пен. 4:3)');
    expect(formatHomeScore({ ...shootout, venue: 'away' })).toBe('1:1 д.в. (пен. 3:4)');
  });

  it('без счёта — пусто и в гостях', () => {
    expect(formatHomeScore({ ...match, goals_for: null, goals_against: null, venue: 'away' })).toBe('');
  });
});
