import { describe, expect, it } from 'vitest';
import type { CompetitionKind, Result, Season } from '../src/db/types';
import { allOpponents, type OpponentMatch } from '../src/opponents';

const seasons: Season[] = [
  { id: 1, label: '2001', start_year: 2001, end_year: 2001, division: null, tier: 2, final_place: null, teams_count: null },
  { id: 2, label: '2004', start_year: 2004, end_year: 2004, division: null, tier: 1, final_place: null, teams_count: null },
];

let id = 0;
const match = (season_id: number, opponent_id: number, score: string, extra: { kind?: CompetitionKind; venue?: 'home' | 'away'; name?: string } = {}): OpponentMatch => {
  const [gf, ga] = score.split(':').map(Number);
  const result: Result = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  id++;
  return {
    id,
    seq: id,
    season_id,
    opponent_id,
    round: null,
    match_date: null,
    venue: extra.venue ?? 'home',
    opponent_raw: null,
    opponent_name: extra.name ?? 'Урал',
    result,
    goals_for: gf,
    goals_against: ga,
    extra_time: false,
    pens_for: null,
    pens_against: null,
    awarded: false,
    competition: { name: '', kind: extra.kind ?? 'league' },
    team: { name: 'Урал' },
  };
};

describe('соперники', () => {
  const teams = [
    { id: 1, name: 'Урал', city: 'Екатеринбург' },
    { id: 2, name: 'Без матчей', city: null },
    { id: 3, name: 'Только товарищеские', city: null },
  ];
  const matches = [
    // порядок записи не тот: сезон 2004 раньше 2001 — сортировка по сезону
    match(2, 1, '0:3', { venue: 'away' }),
    match(1, 1, '2:0', { name: 'Уралмаш' }),
    match(1, 1, '1:1', { name: 'Уралмаш', venue: 'away' }),
    match(2, 1, '1:0', { kind: 'cup' }),
    match(2, 1, '5:0', { kind: 'friendly' }),
    match(2, 3, '2:2', { kind: 'friendly' }),
  ];
  const [ural, ...rest] = allOpponents(teams, matches, seasons);

  it('только клубы с официальными матчами; товарищеские не в счёт', () => {
    expect(rest).toEqual([]);
    expect(ural.all).toMatchObject({ p: 4, w: 2, d: 1, l: 1, gf: 4, ga: 4 });
    expect(ural.league.p).toBe(3);
    expect(ural.byKind.cup?.w).toBe(1);
    expect(ural.byVenue.away).toMatchObject({ p: 2, d: 1, l: 1 });
  });

  it('по порядку сезонов: первая и последняя встречи, прежние названия', () => {
    expect([ural.first?.goals_for, ural.first?.goals_against]).toEqual([2, 0]);
    expect(ural.last?.competition.kind).toBe('cup');
    expect(ural.names).toEqual(['Уралмаш', 'Урал']);
    expect([ural.bigLoss?.goals_for, ural.bigLoss?.goals_against]).toEqual([0, 3]);
    expect(ural.streaks.unbeaten.n).toBe(2);
  });
});
