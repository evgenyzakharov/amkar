import { describe, expect, it } from 'vitest';
import { checkGoals, type CheckGoal, type CheckMatch } from '../src/admin/goalsCheck';

const names: Record<number, string> = { 1: 'Усов', 2: 'Игнатенко', 3: 'Толкачёв' };

describe('сверка голов сезона', () => {
  const matches: CheckMatch[] = [
    { id: 1, seq: 1, opponent: 'Динамо Киров', goals_for: 3, goals_against: 0, friendly: true },
    { id: 2, seq: 3, opponent: 'Иртыш', goals_for: 2, goals_against: 1, friendly: false },
    { id: 3, seq: 4, opponent: 'Тюмень', goals_for: 1, goals_against: 0, friendly: false },
    { id: 4, seq: 5, opponent: 'Динамо-2', goals_for: null, goals_against: null, friendly: false },
  ];
  const goals: CheckGoal[] = [
    { match_id: 1, side: 'amkar', kind: 'open_play', scorer_id: 1, assist_id: 2 }, // товарищеский — не в счёт
    { match_id: 2, side: 'amkar', kind: 'open_play', scorer_id: 1, assist_id: 2 },
    { match_id: 2, side: 'amkar', kind: 'own_goal', scorer_id: null, assist_id: null },
    { match_id: 2, side: 'opponent', kind: 'open_play', scorer_id: null, assist_id: null },
  ];
  const totals = [
    { player_id: 1, goals: 2, assists: null, friendly: false },
    { player_id: 2, goals: null, assists: 1, friendly: false },
    { player_id: 3, goals: 1, assists: 0, friendly: true },
  ];

  it('по игрокам: сколько в Excel и сколько по матчам, без товарищеских и автоголов', () => {
    const { players } = checkGoals(matches, goals, totals, (id) => names[id]);
    expect(players).toEqual([
      { player_id: 1, name: 'Усов', excelGoals: 2, matchGoals: 1, excelAssists: null, matchAssists: 0, differs: true },
      { player_id: 2, name: 'Игнатенко', excelGoals: null, matchGoals: 0, excelAssists: 1, matchAssists: 1, differs: false },
    ]);
  });

  it('матчи, где внесено не столько голов, сколько в счёте, и матчи без счёта', () => {
    const { gaps, noScore } = checkGoals(matches, goals, totals, (id) => names[id]);
    expect(gaps).toEqual([{ id: 3, seq: 4, opponent: 'Тюмень', scoredFor: 1, enteredFor: 0, scoredAgainst: 0, enteredAgainst: 0 }]);
    expect(noScore).toEqual([{ id: 4, seq: 5, opponent: 'Динамо-2' }]);
  });
});
