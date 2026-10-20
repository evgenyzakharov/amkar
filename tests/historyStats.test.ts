import { describe, expect, it } from 'vitest';
import type { GoalMinute, PlayerSeasonAge } from '../src/db/types';
import { ageRecords, bucketColumns, bucketOf, minuteColumns, seasonAges } from '../src/historyStats';

const g = (side: 'amkar' | 'opponent', minute: number, added = false, goals = 1): GoalMinute => ({ side, minute, added, competition_kind: 'league', goals });

describe('голы по минутам', () => {
  it('15-минутки: 45 — конец тайма, 45+ и 90+ — добавленное время, после 90 — дополнительное', () => {
    expect(bucketOf(1, false)).toBe('1–15');
    expect(bucketOf(15, false)).toBe('1–15');
    expect(bucketOf(45, false)).toBe('31–45');
    expect(bucketOf(45, true)).toBe('45+');
    expect(bucketOf(46, false)).toBe('46–60');
    expect(bucketOf(90, false)).toBe('76–90');
    expect(bucketOf(90, true)).toBe('90+');
    expect(bucketOf(105, true)).toBe('Доп. время');
    expect(bucketOf(118, false)).toBe('Доп. время');
  });

  it('забитые и пропущенные; пустое добавленное время не показывается', () => {
    const cols = bucketColumns([g('amkar', 10, false, 3), g('opponent', 12), g('amkar', 90, true, 2)]);
    expect(cols.map((c) => c.label)).toEqual(['1–15', '16–30', '31–45', '46–60', '61–75', '76–90', '90+']);
    expect(cols[0]).toEqual({ label: '1–15', scored: 3, conceded: 1 });
    expect(cols.at(-1)).toEqual({ label: '90+', scored: 2, conceded: 0 });
  });

  it('по минутам: 1…90 и добавленное время после своего тайма', () => {
    const cols = minuteColumns([g('amkar', 45, true), g('opponent', 7)]);
    expect(cols).toHaveLength(91);
    expect(cols[6]).toEqual({ label: '7', scored: 0, conceded: 1 });
    expect(cols[45]).toEqual({ label: '45+', scored: 1, conceded: 0 });
    expect(cols[46].label).toBe('46');
  });
});

const age = (season_id: number, player_id: number, name: string, minutes: number, first: number | null, last: number | null): PlayerSeasonAge => ({
  season_id,
  player_id,
  display_name: name,
  academy: false,
  birth_date: first == null ? null : '1990-01-01',
  games: 1,
  minutes,
  age_minutes: first == null ? null : minutes * ((first + last!) / 2),
  age_first: first,
  age_last: last,
});

describe('возраст состава', () => {
  it('средний — по минутам; без даты рождения — в список не учтённых', () => {
    const s = seasonAges([age(1, 1, 'Старый', 90, 34, 34), age(1, 2, 'Молодой', 270, 18, 18), age(1, 3, 'Без даты', 45, null, null)]).get(1)!;
    expect(s.avg).toBeCloseTo((90 * 34 + 270 * 18) / 360);
    expect(s.youngest?.name).toBe('Молодой');
    expect(s.oldest?.name).toBe('Старый');
    expect(s.missing).toEqual([{ name: 'Без даты', minutes: 45 }]);
  });

  it('рекорды: самый молодой дебют и первый гол, самый возрастной', () => {
    const ages = [age(1, 1, 'Ветеран', 90, 39.5, 40.1), age(1, 2, 'Юниор', 30, 16.5, 16.9)];
    ages[1].birth_date = '1992-01-01';
    const r = ageRecords(
      ages,
      [
        { player_id: 2, display_name: 'Юниор', academy: true, match_id: 5, match_date: '2008-07-01', coach_id: 1, season_label: '2008', start_year: 2008, opponent: 'Химки', birth_date: '1992-01-01' },
      ],
      [{ player_id: 2, match_id: 7, match_date: '2008-09-01', season_label: '2008', opponent: 'ЦСКА', minute: 30 }],
    );
    expect(r.youngestDebut?.name).toBe('Юниор');
    expect(r.youngestDebut?.age).toBeCloseTo(16.5, 1);
    expect(r.youngestScorer?.opponent).toBe('ЦСКА');
    expect(r.oldest).toMatchObject({ name: 'Ветеран', age: 40.1 });
  });
});
