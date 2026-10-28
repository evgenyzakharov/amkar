import { describe, expect, it } from 'vitest';
import { clubBreak, coachStats, longestRun, totals, type CoachMatch, type CoachesData } from '../src/coaches';
import type { CompetitionKind, Result, Season } from '../src/db/types';

const season = (id: number, label: string, tier: number, final_place: number | null = null, division = 'Лига'): Season => ({
  id,
  label,
  start_year: Number(label.slice(0, 4)),
  end_year: Number(label.slice(0, 4)),
  division,
  tier,
  final_place,
  teams_count: 18,
  league_group: null,
  best_xi_formation: null,
});

let id = 0;
/** Матч: «2:0» со стороны «Амкара», результат — по счёту. */
const match = (season_id: number, coach_id: number, score: string, extra: { kind?: CompetitionKind; round?: string; date?: string; venue?: 'home' | 'away' } = {}): CoachMatch => {
  const [gf, ga] = score.split(':').map(Number);
  const result: Result = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  id++;
  return {
    id,
    seq: id,
    season_id,
    coach_id,
    round: extra.round ?? null,
    // даты растут вместе с id: порядок матчей в сезоне — порядок создания
    match_date: extra.date ?? new Date(Date.UTC(1990 + season_id, 0, 1) + id * 86_400_000).toISOString().slice(0, 10),
    venue: extra.venue ?? 'home',
    opponent_raw: `Соперник ${id}`,
    result,
    goals_for: gf,
    goals_against: ga,
    extra_time: false,
    pens_for: null,
    pens_against: null,
    awarded: false,
    competition: { name: extra.kind ?? 'Чемпионат', kind: extra.kind ?? 'league' },
    team: null,
  };
};

const coaches = [
  { id: 1, full_name: 'Сергей Оборин', short_name: 'Оборин', birth_date: null },
  { id: 2, full_name: 'Рашид Рахимов', short_name: 'Рахимов', birth_date: null },
  { id: 3, full_name: 'Без матчей', short_name: 'Без матчей', birth_date: null },
];

describe('итоги и серии', () => {
  it('очки: 3 за победу, 1 за ничью; «сухие» — по счёту', () => {
    const t = totals([match(1, 1, '2:0'), match(1, 1, '1:1'), match(1, 1, '0:3')]);
    expect(t).toMatchObject({ p: 3, w: 1, d: 1, l: 1, gf: 3, ga: 4, cleanSheets: 1, points: 4, winPct: 33 });
    expect(t.ppm).toBeCloseTo(4 / 3);
  });

  it('самая длинная серия — подряд идущие матчи', () => {
    const ms = ['1:0', '2:0', '0:1', '3:1', '1:0', '2:1', '0:0'].map((s) => match(1, 1, s));
    const run = longestRun(ms, (m) => m.result === 'W');
    expect(run.n).toBe(3);
    expect(run.from?.id).toBe(ms[3].id);
    expect(run.to?.id).toBe(ms[5].id);
  });

  it('неизвестный результат: матч в счёт, но очки за матч и процент побед — по известным', () => {
    const t = totals([match(1, 1, '2:0'), match(1, 1, '1:0'), { ...match(1, 1, '0:0'), result: null, goals_for: null, goals_against: null }]);
    expect(t).toMatchObject({ p: 3, w: 2, points: 6, ppm: 3, winPct: 100 });
  });

  it('серия не тянется через перерыв 2018–2021: с 2021/22 — новый клуб', () => {
    const seasons = [season(1, '2017', 1), season(2, '2021', 3)];
    const ms = [match(1, 1, '1:0'), match(1, 1, '2:0'), match(2, 1, '3:0'), match(2, 1, '1:0'), match(2, 1, '2:1')];
    expect(longestRun(ms, (m) => m.result === 'W').n).toBe(5);
    const run = longestRun(ms, (m) => m.result === 'W', clubBreak(seasons));
    expect(run.n).toBe(3);
    expect(run.from?.id).toBe(ms[2].id);
  });
});

describe('тренеры', () => {
  // 1996 — третий уровень, Оборин первый и выходит выше; 1997 — второй уровень; 2008 — высшая лига, Рахимов 4-й
  const seasons = [season(1, '1996', 3, 1, 'Вторая лига'), season(2, '1997', 2, 5), season(3, '2008', 1, 4, 'Премьер-лига')];
  const data: CoachesData = {
    coaches,
    tenures: [
      { coach_id: 2, from_date: '2007-12-01', to_date: '2009-01-01' },
      { coach_id: 2, from_date: '2010-01-01', to_date: null },
    ],
    seasons,
    matches: [
      ...['1:0', '2:0', '3:0', '1:0', '2:1', '8:1'].map((s) => match(1, 1, s)),
      match(1, 1, '0:0', { kind: 'friendly' }),
      match(1, 1, '1:0', { kind: 'cup', round: '1/2 финала, первый матч', date: '1996-09-01' }),
      match(2, 1, '0:1'),
      match(3, 2, '2:0'),
      match(3, 2, '1:1'),
      match(3, 2, '0:4', { venue: 'away' }),
      match(3, 1, '1:0'),
      match(3, 2, '0:1', { kind: 'cup', round: 'Финал', date: '2008-05-17' }),
    ],
    debuts: [
      { player_id: 1, display_name: 'Зырянов', academy: true, match_id: 1, match_date: '1995-05-10', coach_id: 1, season_label: '1995', start_year: 1995 },
      ...[2, 3, 4].map((n) => ({ player_id: n, display_name: `Воспитанник ${n}`, academy: true, match_id: 1, match_date: '2008-04-01', coach_id: 2, season_label: '2008', start_year: 2008 })),
    ],
  };
  const stats = coachStats(data);
  const of = (name: string) => stats.find((c) => c.coach.short_name === name)!;

  it('официальные матчи, без товарищеских; тренер без матчей и сроков не показывается', () => {
    expect(stats.map((c) => c.coach.short_name)).toEqual(['Оборин', 'Рахимов']);
    expect(of('Оборин').all.p).toBe(9);
    expect(of('Оборин').byKind.cup?.p).toBe(1);
    expect(of('Рахимов').byVenue.away?.l).toBe(1);
    expect(of('Оборин').byTier[3].p).toBe(6);
  });

  it('сроки: из таблицы, а без них — по первому и последнему матчу; действующему — без последнего матча', () => {
    expect(of('Рахимов').periods).toEqual([
      { from: '2007-12-01', to: '2009-01-01' },
      { from: '2010-01-01', to: null },
    ]);
    expect(of('Рахимов').current).toBe(true);
    expect(of('Рахимов').last).toBeNull();
    expect(of('Оборин').periods).toHaveLength(1);
    expect(of('Оборин').periods[0].from).toBe(of('Оборин').first?.match_date);
    expect(of('Оборин').last?.season_id).toBe(3);
  });

  it('место в таблице — у того, кто вёл бо́льшую часть сезона', () => {
    expect(of('Рахимов').seasons.find((s) => s.season.label === '2008')?.led).toBe(true);
    expect(of('Оборин').seasons.find((s) => s.season.label === '2008')?.led).toBe(false);
  });

  it('крупнейшие победа и поражение', () => {
    expect([of('Оборин').bigWin?.goals_for, of('Оборин').bigWin?.goals_against]).toEqual([8, 1]);
    expect([of('Рахимов').bigLoss?.goals_for, of('Рахимов').bigLoss?.goals_against]).toEqual([0, 4]);
  });

  it('ачивки: победа в лиге и повышение, кубок с годом, место в Премьер-лиге, серии, воспитанники с 1995', () => {
    const titles = (name: string) => of(name).achievements.map((a) => a.title);
    expect(titles('Оборин')).toEqual(
      expect.arrayContaining(['Победитель: Вторая лига, 1996', 'Повышение в классе: 1996', 'Полуфинал Кубка России 1996', '7 побед подряд']),
    );
    expect(titles('Рахимов')).toEqual(expect.arrayContaining(['4-е место в Премьер-лиге (2008)', 'Финал Кубка России 2008', 'Дебют у 3 воспитанников']));
    // дебюты считаются с первого сезона
    expect(of('Оборин').debutants.map((d) => d.display_name)).toEqual(['Зырянов']);
  });

  it('рекорды — по уровню лиги, среди тех, кто на нём работал', () => {
    const records = (name: string) => of(name).achievements.filter((a) => a.kind === 'record').map((a) => a.title);
    // На третьем уровне работал один Оборин — рекордов там нет; в высшей лиге — оба, у Оборина там 1 матч
    expect(records('Оборин')).toEqual([]);
    expect(records('Рахимов')).toEqual([]);
  });
});

describe('повышение в классе', () => {
  const titles = (seasons: Season[]) =>
    coachStats({ coaches, tenures: [], seasons, matches: seasons.map((s) => match(s.id, 1, '1:0')), debuts: [] })
      .find((c) => c.coach.id === 1)!
      .achievements.filter((a) => a.kind === 'promotion')
      .map((a) => a.title);
  const group = (s: Season, g: Season['league_group']): Season => ({ ...s, league_group: g });

  it('из второй лиги «Б» в «А» и из «Серебра» в «Золото»; из «Золота» в «Серебро» — нет', () => {
    expect(titles([season(1, '2025', 4), group(season(2, '2026', 3), 'silver')])).toEqual(['Повышение в классе: 2025']);
    expect(titles([group(season(1, '2025', 3), 'silver'), group(season(2, '2026', 3), 'gold')])).toEqual(['Повышение в классе: 2025']);
    expect(titles([group(season(1, '2025', 3), 'gold'), group(season(2, '2026', 3), 'silver')])).toEqual([]);
    expect(titles([group(season(1, '2025', 3), 'silver'), group(season(2, '2026', 3), 'silver')])).toEqual([]);
  });
});

describe('рекорды клуба по уровню лиги', () => {
  it('рекорд — у лучшего на уровне; крупная победа — от трёх мячей разницы', () => {
    const stats = coachStats({
      coaches,
      tenures: [],
      seasons: [season(1, '2002', 2), season(2, '2003', 2)],
      matches: [
        ...['1:0', '2:0', '3:0', '1:0', '0:1'].map((s) => match(1, 1, s)),
        ...['5:0', '1:0', '0:0', '0:2'].map((s) => match(2, 2, s)),
      ],
      debuts: [],
    });
    const records = (cid: number) => stats.find((c) => c.coach.id === cid)!.achievements.filter((a) => a.kind === 'record').map((a) => a.title);
    // без поражений — 4 у первого, но рекорд серии без поражений — от пяти матчей
    expect(records(1)).toEqual(['Рекорд клуба в первой лиге: 4 «сухих» матча подряд', 'Рекорд клуба в первой лиге: 4 победы подряд']);
    expect(records(2)).toEqual(['Самая крупная победа в первой лиге: 5:0']);
  });
});
