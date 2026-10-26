import { describe, expect, it } from 'vitest';
import { ageExact, formatAgeExact, formatHomeScore, formatScore } from '../src/format';

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

describe('возраст годами и днями', () => {
  it('полные годы и дни с последнего дня рождения', () => {
    expect(formatAgeExact('1990-05-10', '2005-10-04')).toBe('15 лет 147 дней');
    expect(formatAgeExact('1980-03-01', '2021-03-01')).toBe('41 год 0 дней');
    expect(formatAgeExact('2000-12-31', '2018-01-02')).toBe('17 лет 2 дня');
    expect(formatAgeExact('1999-06-15', '2021-06-14')).toBe('21 год 364 дня');
  });

  it('родившийся 29 февраля в невисокосный год становится старше 1 марта', () => {
    expect(ageExact('2004-02-29', '2021-02-28')).toEqual({ years: 16, days: 365 });
    expect(ageExact('2004-02-29', '2021-03-01')).toEqual({ years: 17, days: 0 });
    expect(ageExact('2004-02-29', '2024-02-29')).toEqual({ years: 20, days: 0 });
  });
});
