import { describe, expect, it } from 'vitest';
import { search, type SearchIndex } from '../src/search';

const index: SearchIndex = {
  players: [
    { id: 27, name: 'А. Попов', last: 'Попов', first: 'Алексей', years: '1996–2014', games: 462 },
    { id: 384, name: 'К. Попов', last: 'Попов', first: 'Кирилл', years: '2025–2027', games: 26 },
    { id: 5, name: 'Липопов', last: 'Липопов', first: null, years: null, games: 0 },
    { id: 9, name: 'Ёлкин', last: 'Ёлкин', first: null, years: '2001', games: 1 },
  ],
  teams: [
    { id: 19, name: 'Урал', city: 'Екатеринбург', names: ['Уралмаш', 'Урал'] },
    { id: 3, name: 'Рубин', city: 'Казань', names: [] },
  ],
  coaches: [{ id: 5, name: 'Рустем Хузин', short: 'Хузин', years: '2012–2023' }],
  seasons: [
    { label: '2008', division: 'Премьер-лига' },
    { label: '2011/12', division: 'Премьер-лига' },
  ],
};

describe('поиск в шапке', () => {
  it('игроки — по началу фамилии или имени, сыгравшие больше — выше; середина слова не в счёт', () => {
    const hits = search(index, 'поп');
    // в результатах — имя и фамилия
    expect(hits.map((h) => h.title)).toEqual(['Алексей Попов', 'Кирилл Попов']);
    expect(hits[0]).toMatchObject({ group: 'Игроки', href: '#/player/27', detail: '1996–2014 · 462 матча' });
    expect(search(index, 'алексей попов').map((h) => h.title)).toEqual(['Алексей Попов']);
  });

  it('ё и е не различаются; меньше двух букв — пусто', () => {
    expect(search(index, 'елк').map((h) => h.title)).toEqual(['Ёлкин']);
    expect(search(index, 'п')).toEqual([]);
  });

  it('клуб — и по прежнему названию, и по городу', () => {
    expect(search(index, 'уралмаш')).toEqual([{ group: 'Соперники', href: '#/opponent/19', title: 'Урал', detail: 'Екатеринбург · был «Уралмаш»' }]);
    expect(search(index, 'казань').map((h) => h.title)).toEqual(['Рубин']);
  });

  it('тренер — по фамилии, сезон — по началу метки', () => {
    expect(search(index, 'хуз')).toMatchObject([{ group: 'Тренеры', href: '#/coach/5', detail: '2012–2023' }]);
    expect(search(index, '2011')).toMatchObject([{ group: 'Сезоны', href: '#/season/2011-12', title: 'Сезон 2011/12' }]);
    expect(search(index, '08').map((h) => h.title)).toEqual(['Сезон 2008']);
  });
});
