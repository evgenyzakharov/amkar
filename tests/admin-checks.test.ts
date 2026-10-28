import { describe, expect, it } from 'vitest';
import { runChecks, type CheckData } from '../src/admin/checks';

const league = { kind: 'league' as const };
const friendly = { kind: 'friendly' as const };
const match = (id: number, patch: Partial<CheckData['matches'][number]> = {}): CheckData['matches'][number] => ({
  id,
  season_id: 1,
  seq: id,
  match_date: `2024-05-${String(id).padStart(2, '0')}`,
  goals_for: 1,
  goals_against: 0,
  awarded: false,
  coach_id: 7,
  opponent_name: `Соперник ${id}`,
  competition: league,
  ...patch,
});

const base = (): CheckData => ({
  seasons: [{ id: 1, label: '2024', start_year: 2024, end_year: 2024 }],
  matches: [match(1), match(2), match(3, { competition: friendly, goals_for: 3, goals_against: 1 })],
  appearances: [
    { match_id: 1, player_id: 1, role: 'start', minutes: 90, replaced_player_id: null },
    { match_id: 2, player_id: 1, role: 'start', minutes: 90, replaced_player_id: null },
    { match_id: 2, player_id: 2, role: 'bench', minutes: 0, replaced_player_id: null },
  ],
  absences: [],
  goals: [
    { match_id: 1, side: 'amkar', minute: 10 },
    { match_id: 2, side: 'amkar', minute: 20 },
    { match_id: 3, side: 'amkar', minute: null },
  ],
  squad: [
    { season_id: 1, player_id: 1 },
    { season_id: 1, player_id: 2 },
  ],
  players: [
    { id: 1, display_name: 'Нарубин', birth_date: '1981-12-05' },
    { id: 2, display_name: 'Исмагилов', birth_date: null },
  ],
  tenures: [{ coach_id: 7, from_date: '2024-01-01', to_date: null }],
  conceded: [{ season_id: 1, goals_conceded: 0 }],
  ok: [],
});

const byKey = (d: CheckData) => new Map(runChecks(d).map((r) => [r.key, r]));

describe('проверка данных', () => {
  it('чистые данные — всё в порядке, кроме известного', () => {
    const r = byKey(base());
    expect(r.get('score-official')?.level).toBe('ok');
    expect(r.get('gk-conceded')?.level).toBe('ok');
    expect(r.get('seq-date')?.level).toBe('ok');
    expect(r.get('lineup-absence')?.level).toBe('ok');
    // товарищеский: записан один гол из трёх — стоит посмотреть
    expect(r.get('score-friendly')).toMatchObject({
      level: 'warn',
      items: [{ key: '3', matchId: 3, text: '2024, №3 «Соперник 3» 3:1, записано голов 1:0' }],
    });
    // гол без минуты и игрок без даты рождения — известно, на статистику не влияет
    expect(r.get('goals-no-minute')).toMatchObject({ level: 'info', summary: 'Голов — 1. Все в товарищеских — в статистику не идут.' });
    expect(r.get('players-no-birth')).toMatchObject({ level: 'info', summary: 'Ни один не выходил на поле.' });
  });

  it('находит расхождения: счёт, вратари, порядок, заявка, сроки тренера, состав и пропуск', () => {
    const d = base();
    d.matches[1] = match(2, { goals_for: 2, match_date: '2024-04-30' });
    d.matches.push(match(4, { match_date: '2023-12-01' }));
    d.goals.push({ match_id: 4, side: 'amkar', minute: 5 });
    d.appearances.push({ match_id: 1, player_id: 9, role: 'sub', minutes: 10, replaced_player_id: null });
    d.absences.push({ match_id: 2, player_id: 2, reason: 'injury' });
    d.conceded = [{ season_id: 1, goals_conceded: 1 }];
    const r = byKey(d);
    expect(r.get('score-official')?.items.map((i) => i.key)).toEqual(['2']);
    expect(r.get('gk-conceded')?.items[0].text).toBe('2024: у вратарей 1, соперник забил 0');
    expect(r.get('seq-date')?.items.map((i) => i.key)).toEqual(['2', '4']);
    expect(r.get('appearance-squad')?.items.map((i) => i.key)).toEqual(['1:9']);
    expect(r.get('coach-tenure')?.items.map((i) => i.key)).toEqual(['4']);
    expect(r.get('lineup-absence')?.items).toEqual([{ key: '2:2', matchId: 2, playerId: 2, text: '2024, №2 «Соперник 2»: Исмагилов', accepted: false }]);
    expect(r.get('subs-unpaired')).toMatchObject({ level: 'info', summary: '2024 — 1. На статистику не влияет: видно только на странице матча.' });
  });

  it('«так и есть» снимает замечание, но случай остаётся виден', () => {
    const d = base();
    d.ok = [{ check_key: 'score-friendly', item_key: '3' }];
    const r = byKey(d).get('score-friendly')!;
    expect(r.level).toBe('info');
    expect(r.items).toMatchObject([{ key: '3', accepted: true }]);
  });
});
