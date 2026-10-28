import { describe, expect, it } from 'vitest';
import { biggestWins, cupEditions, editionResult, editionStart, shootouts, shortScore, stageOf, type CupMatch } from '../src/cup';
import type { Result } from '../src/db/types';

let id = 0;
const match = (date: string | null, round: string, opponent: string, score: string, extra: { result?: Result | null; pens?: string; season?: number } = {}): CupMatch => {
  const [gf, ga] = score ? score.split(':').map(Number) : [null, null];
  const [pf, pa] = extra.pens ? extra.pens.split(':').map(Number) : [null, null];
  const result: Result | null =
    extra.result !== undefined ? extra.result : gf == null || ga == null ? null : pf != null && pa != null ? (pf > pa ? 'W' : 'L') : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  id++;
  return {
    id,
    seq: id,
    season_id: extra.season ?? 1,
    round,
    match_date: date,
    venue: 'home',
    opponent_raw: null,
    opponent_name: opponent,
    result,
    goals_for: gf,
    goals_against: ga,
    extra_time: false,
    pens_for: pf,
    pens_against: pa,
    awarded: false,
    competition: { name: 'Кубок России', kind: 'cup' },
    team: null,
  };
};

describe('stageOf', () => {
  it('reads the stage from the round name', () => {
    expect(stageOf('1/256 финала')).toBe(0);
    expect(stageOf('1/8 финала, второй матч')).toBe(5);
    expect(stageOf('1/2 финала')).toBe(7);
    expect(stageOf('Финал')).toBe(8);
  });

  it('puts regional-path rounds and unknown rounds before 1/256', () => {
    expect(stageOf('Третий раунд пути регионов')).toBe(-1);
    expect(stageOf(null)).toBe(-1);
  });
});

describe('editionStart', () => {
  it('counts autumn matches and spring early rounds as the start of an edition', () => {
    expect(editionStart({ match_date: '2007-09-12', round: '1/16 финала' }, 2007)).toBe(2007);
    expect(editionStart({ match_date: '1996-04-21', round: '1/256 финала' }, 1996)).toBe(1996);
  });

  it('counts spring matches from 1/8 as the end of last year edition', () => {
    expect(editionStart({ match_date: '2008-05-17', round: 'Финал' }, 2008)).toBe(2007);
    expect(editionStart({ match_date: '2001-04-11', round: '1/4 финала' }, 2001)).toBe(2000);
  });

  it('falls back to the season without a date', () => {
    expect(editionStart({ match_date: null, round: '1/2 финала' }, 2010)).toBe(2010);
  });
});

describe('cupEditions', () => {
  const run = (matches: CupMatch[]) => cupEditions(matches, new Map([[1, 2007]]));

  it('groups an autumn-to-spring run into one edition and marks the final defeat', () => {
    const [e] = run([
      match('2007-06-27', '1/16 финала', 'Ротор', '4:1'),
      match('2007-08-08', '1/8 финала', 'Терек', '3:1'),
      match('2008-04-16', '1/2 финала', 'Урал', '1:0'),
      match('2008-05-17', 'Финал', 'ЦСКА', '2:2', { pens: '1:4' }),
    ]);
    expect(e.label).toBe('2007/08');
    expect(e.best).toBe(8);
    expect(e.won).toBe(false);
    expect(e.exit?.opponent).toBe('ЦСКА');
    expect(e.ties.filter((t) => t.lost)).toHaveLength(1);
    expect(editionResult(e)).toBe('финал');
  });

  it('joins the two legs of a tie', () => {
    const eds = run([
      match('2003-09-24', '1/32 финала', 'Новосибирск', '2:0'),
      match('2003-10-22', '1/16 финала, первый матч', 'ФК Москва', '3:2'),
      match('2003-11-05', '1/16 финала, второй матч', 'ФК Москва', '0:2'),
      match('2004-07-14', '1/16 финала', 'Терек', '1:0'),
      match('2004-09-22', '1/8 финала', 'Черноморец', '2:0'),
    ]);
    expect(eds.map((e) => e.label)).toEqual(['2003/04', '2004/05']);
    expect(eds[0].ties.map((t) => t.matches.length)).toEqual([1, 2]);
    expect(eds[0].exit?.opponent).toBe('ФК Москва');
  });

  it('keeps the latest edition alive after a win or between the legs', () => {
    const won = run([match('2026-08-25', 'Второй раунд пути регионов', 'Победа НН', '2:0')]);
    expect(won[0].alive).toBe(true);
    expect(won[0].exit).toBeNull();
    expect(editionResult(won[0])).toBe('в игре: путь регионов');

    const leg = run([match('2026-09-20', '1/8 финала, первый матч', 'Урал', '0:1')]);
    expect(leg[0].alive).toBe(true);
  });

  it('does not keep an older edition alive', () => {
    const eds = run([match('2005-09-21', '1/16 финала', 'Лада Тольятти', '2:0'), match('2006-08-09', '1/16 финала', 'Ангушт', '0:1')]);
    expect(eds[0].alive).toBe(false);
    expect(eds[0].exit?.opponent).toBe('Лада Тольятти');
    expect(eds[1].alive).toBe(false);
  });

  it('marks a cup win', () => {
    const [e] = run([match('2008-05-17', 'Финал', 'ЦСКА', '1:0')]);
    expect(e.won).toBe(true);
    expect(e.exit).toBeNull();
    expect(editionResult(e)).toBe('обладатель');
  });
});

describe('cup lists', () => {
  it('ranks the biggest wins by margin, then goals scored, then date', () => {
    const list = biggestWins(
      [match('2017-09-21', '1/16 финала', 'Факел', '4:0'), match('1996-04-21', '1/256 финала', 'Динамо Пермь', '6:0'), match('1998-05-27', '1/128 финала', 'Динамо Пермь', '4:0'), match('2001-10-16', '1/8 финала', 'Носта', '5:1'), match('2002-01-01', '1/8 финала', 'Сокол', '1:1')],
      3,
    );
    expect(list.map((m) => shortScore(m) + ' ' + m.match_date)).toEqual(['6:0 1996-04-21', '5:1 2001-10-16', '4:0 1998-05-27']);
  });

  it('lists shootouts newest first and writes the score short', () => {
    const list = shootouts([match('2017-10-25', '1/8 финала', 'Ростов', '1:1', { pens: '10:9' }), match('2018-02-27', '1/4 финала', 'Авангард Курск', '0:0', { pens: '6:7' }), match('2018-03-01', '1/2 финала', 'Урал', '1:0')]);
    expect(list.map(shortScore)).toEqual(['0:0, пен. 6:7', '1:1, пен. 10:9']);
  });
});
