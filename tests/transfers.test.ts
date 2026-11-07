import { describe, expect, it } from 'vitest';
import type { Season } from '../src/db/types';
import { placeOf, topWithTies, transferStats, type TransferRow } from '../src/transfers';

const season = (id: number, label: string): Season => ({
  id,
  label,
  start_year: Number(label.slice(0, 4)),
  end_year: label.includes('/') ? Number(label.slice(0, 2) + label.slice(-2)) : Number(label),
  division: null,
  tier: null,
  final_place: null,
  teams_count: null,
  league_group: null,
  best_xi_formation: null,
});
const seasons = [season(1, '2016/17'), season(2, '2017/18'), season(3, '2021/22')];

let id = 0;
const tr = (
  direction: 'in' | 'out',
  team: [number, string, string?] | null,
  extra: {
    kind?: TransferRow['kind'];
    season?: string;
    then?: string;
    player?: string;
  } = {},
): TransferRow => {
  id++;
  const s = seasons.find((x) => x.label === (extra.season ?? '2016/17'))!;
  return {
    id,
    player_id: id,
    direction,
    kind: extra.kind ?? 'permanent',
    other_team_id: team?.[0] ?? null,
    other_team_name: team ? (extra.then ?? team[1]) : null,
    season: { label: s.label, start_year: s.start_year, end_year: s.end_year },
    team: team ? { name: team[1], crest_url: team[2] ?? null } : null,
    player: { display_name: extra.player ?? `И. Игрок${id}` },
  };
};

const RUBIN: [number, string] = [2, 'Рубин'];
const AKHMAT: [number, string] = [10, 'Ахмат'];
const ACADEMY: [number, string] = [200, 'Академия «Амкар»'];

describe('трансферы', () => {
  const rows = [
    tr('in', RUBIN),
    tr('in', RUBIN, { kind: 'loan', season: '2017/18' }),
    tr('out', RUBIN),
    tr('in', RUBIN, { kind: 'loan_end' }),
    tr('out', AKHMAT, { then: 'Терек', player: 'А. Попов' }),
    tr('out', AKHMAT, { season: '2017/18' }),
    tr('in', ACADEMY, { season: '2021/22' }),
    tr('in', ACADEMY, { season: '2021/22' }),
    tr('out', null, { season: '2021/22' }),
  ];
  const s = transferStats(rows, seasons);

  it('итоги: без возвратов из аренды; своя академия — отдельно; без клуба — отдельно', () => {
    expect(s).toMatchObject({
      in: 4,
      out: 4,
      loansIn: 1,
      loansOut: 0,
      clubs: 2,
      own: 2,
      noClub: 1,
      returns: 1,
    });
  });

  it('топ: свои команды не идут; аренды и игроки с названием клуба того года', () => {
    expect(s.top.in.map((c) => [c.name, c.n, c.loans])).toEqual([['Рубин', 2, 1]]);
    expect(s.top.out.map((c) => [c.name, c.n])).toEqual([
      ['Ахмат', 2],
      ['Рубин', 1],
    ]);
    expect(s.top.out[0].moves.map((m) => [m.player, m.then])).toEqual([
      ['А. Попов', 'Терек'],
      [expect.any(String), null],
    ]);
  });

  it('обмен в обе стороны и по сезонам', () => {
    expect(s.partners.map((p) => [p.name, p.in, p.out])).toEqual([['Рубин', 2, 1]]);
    expect(s.bySeason.map((x) => [x.season.label, x.in, x.out])).toEqual([
      ['2016/17', 1, 2],
      ['2017/18', 1, 1],
      ['2021/22', 2, 1],
    ]);
  });
});

describe('топ с делёжкой мест', () => {
  const v = (x: number) => x;
  it('все, кто делит последнее место', () => {
    const list = [9, 7, 7, 6, 5, 5, 4, 4, 4, 4, 4, 4, 3];
    expect(topWithTies(list, v)).toEqual({
      shown: [9, 7, 7, 6, 5, 5, 4, 4, 4, 4, 4, 4],
      cut: 4,
      rest: 0,
    });
    expect(placeOf(list, v, 2)).toBe(2);
    expect(placeOf(list, v, 11)).toBe(7);
  });
  it('делящих слишком много — только те, кто выше, остальные строкой', () => {
    const list = [9, 8, ...Array(20).fill(1)];
    expect(topWithTies(list, v)).toEqual({ shown: [9, 8], cut: 1, rest: 20 });
  });
  it('список короче десяти — весь', () => {
    expect(topWithTies([3, 2, 1], v)).toEqual({
      shown: [3, 2, 1],
      cut: 0,
      rest: 0,
    });
  });
});
