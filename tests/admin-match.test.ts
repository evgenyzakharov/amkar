import { describe, expect, it } from 'vitest';
import {
  EMPTY_ROW,
  cardDraft,
  computeMinutes,
  fixResult,
  goalValues,
  headerValues,
  lineupDraft,
  lineupRecords,
  parseGoalMinute,
  updateRow,
  validateCard,
  validateHeader,
  type CardBase,
  type Competition,
  type HeaderDraft,
  type Lineup,
} from '../src/admin/match';

const competitions: Competition[] = [
  { id: 1, name: 'Чемпионат', kind: 'league' },
  { id: 2, name: 'Кубок России', kind: 'cup' },
];

const base = (patch: Partial<CardBase> = {}): CardBase => ({
  season: { id: 1, label: '2011/12', start_year: 2011, end_year: 2012 },
  match: {
    id: 10, season_id: 1, competition_id: 1, seq: 3, round: null, match_date: null, venue: null, opponent_id: null,
    opponent_raw: 'Томь', result: 'W', goals_for: null, goals_against: null, extra_time: false, pens_for: null,
    pens_against: null, awarded: false, coach_id: null, formation: null, notes: null,
  },
  nextSeq: 20,
  goals: [],
  appearances: [],
  absences: [],
  videos: [],
  teams: [{ id: 5, name: 'Томь' }],
  coaches: [],
  ...patch,
});

const header = (patch: Partial<HeaderDraft> = {}): HeaderDraft => ({ ...cardDraft(base(), competitions).header, ...patch });
const names = (id: number) => `Игрок ${id}`;

describe('минуты по заменам', () => {
  const row = (status: string, on = '', off = '') => ({ status: status as 'start', minute_on: on, minute_off: off });

  it('как в таблице автора: заменённый на 64-й сыграл 64, вышедший на 64-й — 26', () => {
    expect(computeMinutes(row('start', '', '64'), 90)).toBe(64);
    expect(computeMinutes(row('sub', '64'), 90)).toBe(26);
    expect(computeMinutes(row('start'), 90)).toBe(90);
    expect(computeMinutes(row('bench'), 90)).toBe(0);
  });

  it('дополнительное время — до 120-й, вышедший и заменённый — разница, вышедший в конце — хотя бы минута', () => {
    expect(computeMinutes(row('start'), 120)).toBe(120);
    expect(computeMinutes(row('sub', '46', '80'), 90)).toBe(34);
    expect(computeMinutes(row('sub', '90'), 90)).toBe(1);
    expect(computeMinutes(row('sub'), 90)).toBeNull();
  });

  it('старые минуты без минут замен не теряются при открытии карточки', () => {
    const lineup = lineupDraft(
      base({
        appearances: [
          { match_id: 10, player_id: 1, role: 'start', minutes: 64, minute_on: null, minute_off: null, replaced_player_id: null, injured: false, sent_off: false },
          { match_id: 10, player_id: 2, role: 'start', minutes: 90, minute_on: null, minute_off: null, replaced_player_id: null, injured: false, sent_off: false },
          { match_id: 10, player_id: 3, role: null, minutes: 45, minute_on: null, minute_off: null, replaced_player_id: null, injured: false, sent_off: false },
          { match_id: 10, player_id: 4, role: 'sub', minutes: 26, minute_on: 64, minute_off: null, replaced_player_id: 1, injured: false, sent_off: false },
        ],
      }),
    );
    expect(lineup[1].minutes).toBe('64'); // вручную: по заменам вышло бы 90
    expect(lineup[2].minutes).toBeNull(); // совпадает с подсчётом
    expect(lineup[3]).toMatchObject({ status: 'unknown', minutes: '45' });
    expect(lineup[4].minutes).toBeNull();
    const { appearances } = lineupRecords(lineup, 10, 90);
    expect(appearances.map((a) => [a.player_id, a.role, a.minutes])).toEqual([
      [1, 'start', 64],
      [2, 'start', 90],
      [3, null, 45],
      [4, 'sub', 26],
    ]);
  });
});

describe('правка состава', () => {
  const start: Lineup = {
    1: { ...EMPTY_ROW, status: 'start' },
    2: { ...EMPTY_ROW, status: 'bench' },
  };

  it('замена: минута выхода становится минутой ухода заменённого', () => {
    let l = updateRow(start, 2, { status: 'sub' });
    l = updateRow(l, 2, { minute_on: '64' });
    l = updateRow(l, 2, { replaced: '1' });
    expect(l[1].minute_off).toBe('64');
    // поправили минуту выхода — поправилась и минута ухода
    l = updateRow(l, 2, { minute_on: '70' });
    expect(l[1].minute_off).toBe('70');
    const { appearances } = lineupRecords(l, 10, 90);
    expect(appearances).toEqual([
      { match_id: 10, player_id: 1, role: 'start', minutes: 70, minute_on: null, minute_off: 70, replaced_player_id: null, injured: false, sent_off: false },
      { match_id: 10, player_id: 2, role: 'sub', minutes: 20, minute_on: 70, minute_off: null, replaced_player_id: 1, injured: false, sent_off: false },
    ]);
  });

  it('и наоборот: у заменённого уже есть минута ухода — она становится минутой выхода', () => {
    let l = updateRow(start, 1, { minute_off: '55' });
    l = updateRow(l, 2, { status: 'sub' });
    l = updateRow(l, 2, { replaced: '1' });
    expect(l[2].minute_on).toBe('55');
  });

  it('смена роли чистит лишнее, ручные минуты сбрасываются на подсчёт', () => {
    let l = updateRow(start, 2, { status: 'sub', minute_on: '60', replaced: '1' });
    l = updateRow(l, 2, { status: 'bench' });
    expect(l[2]).toMatchObject({ minute_on: '', replaced: '', minutes: null });
    l = updateRow(l, 1, { minutes: '77' });
    expect(l[1].minutes).toBe('77');
    l = updateRow(l, 1, { minute_off: '80' });
    expect(l[1].minutes).toBeNull();
    l = updateRow(l, 1, { status: 'injury', injured: true });
    expect(l[1]).toEqual({ ...EMPTY_ROW, status: 'injury' });
    const records = lineupRecords(l, 10, 90);
    expect(records.absences).toEqual([{ match_id: 10, player_id: 1, reason: 'injury' }]);
    expect(records.appearances.map((a) => a.player_id)).toEqual([2]);
  });

  it('заменил того, кого нет в составе, — ошибка; не 11 в старте — предупреждение', () => {
    let l = updateRow(start, 2, { status: 'sub', minute_on: '60', replaced: '1' });
    l = updateRow(l, 1, { status: '' });
    const { errors, warnings } = validateCard({ header: header(), goals: [], lineup: l, videos: [] }, base(), names);
    expect(errors).toEqual(['Игрок 2 заменил игрока (Игрок 1), которого нет в составе на матч.']);
    expect(warnings).toEqual([]);
    const ok = validateCard({ header: header(), goals: [], lineup: start, videos: [] }, base(), names);
    expect(ok.warnings).toEqual(['В старте 1 игроков, а не 11.']);
  });
});

describe('шапка матча', () => {
  it('результат подстраивается под счёт, результат из Excel при серии пенальти не трогаем', () => {
    expect(fixResult(header({ result: '', goals_for: '2', goals_against: '1' })).result).toBe('W');
    expect(fixResult(header({ result: 'W', goals_for: '0', goals_against: '1' })).result).toBe('L');
    expect(fixResult(header({ result: 'W', goals_for: '1', goals_against: '1', pens_for: '4', pens_against: '3' })).result).toBe('W');
    expect(fixResult(header({ result: 'L', goals_for: '1', goals_against: '1', pens_for: '4', pens_against: '3' })).result).toBe('W');
    expect(fixResult(header({ result: 'D', goals_for: '1', goals_against: '1', pens_for: '2', pens_against: '4' })).result).toBe('D');
  });

  it('ошибки — по-русски и понятно', () => {
    const errors = (h: Partial<HeaderDraft>) => validateHeader(header(h), base()).errors;
    expect(errors({ goals_for: '2' })).toEqual(['Счёт: заполните обе команды или оставьте оба поля пустыми.']);
    expect(errors({ result: 'W', goals_for: '0', goals_against: '1' })).toEqual(['Результат не сходится со счётом.']);
    expect(errors({ goals_for: '2', goals_against: '1', result: 'W', pens_for: '4', pens_against: '3' })).toEqual([
      'Серия пенальти бывает только после ничьей — проверьте счёт.',
    ]);
    expect(errors({ awarded: true, result: '' })).toEqual(['У технического результата выберите победу, ничью или поражение.']);
    expect(errors({ seq: '0' })).toEqual(['Номер матча в сезоне — целое число больше нуля.']);
    expect(validateHeader(header({ match_date: '2013-03-10' }), base()).warnings).toEqual(['Дата 10.03.2013 — вне сезона 2011/12.']);
  });

  it('соперник: из справочника — id, новый — заводится при сохранении, пусто — остаётся текст из Excel', () => {
    expect(headerValues(header({ opponent: 'томь ' }), base())).toMatchObject({ values: { opponent_id: 5, opponent_raw: 'Томь' }, newTeam: null });
    expect(headerValues(header({ opponent: 'Томь Томск' }), base())).toMatchObject({ values: { opponent_id: null }, newTeam: 'Томь Томск' });
    expect(headerValues(header({ opponent: '' }), base())).toMatchObject({ values: { opponent_id: null, opponent_raw: 'Томь' }, newTeam: null });
    expect(validateHeader(header({ opponent: '' }), base({ match: null })).errors).toContain('Укажите соперника.');
  });
});

describe('голы', () => {
  it('минута с добавленным временем', () => {
    expect(parseGoalMinute('90+3')).toEqual({ minute: 90, added: 3 });
    expect(parseGoalMinute(' 23 ')).toEqual({ minute: 23, added: null });
    expect(parseGoalMinute('')).toBeNull();
    expect(parseGoalMinute('90+')).toBe('invalid');
  });

  it('автор — игрок «Амкара» или текст, в зависимости от того, чей гол и автогол ли это', () => {
    const g = { key: 'k', id: null, minute: '90+3', scorer_id: '7', scorer_name: 'Иванов', assist_id: '8' };
    expect(goalValues({ ...g, side: 'amkar', kind: 'open_play' }, 10)).toEqual({
      match_id: 10, side: 'amkar', minute: 90, added_time: 3, kind: 'open_play', scorer_id: 7, scorer_name: null, assist_id: 8,
    });
    expect(goalValues({ ...g, side: 'amkar', kind: 'own_goal' }, 10)).toMatchObject({ scorer_id: null, scorer_name: 'Иванов', assist_id: null });
    expect(goalValues({ ...g, side: 'opponent', kind: 'penalty' }, 10)).toMatchObject({ scorer_id: null, scorer_name: 'Иванов', assist_id: null });
    expect(goalValues({ ...g, side: 'opponent', kind: 'own_goal' }, 10)).toMatchObject({ scorer_id: 7, scorer_name: null, assist_id: null });
  });

  it('добавленное время только после 45/90/105/120, число голов сверяется со счётом', () => {
    const goal = { key: 'k', id: null, side: 'amkar' as const, kind: 'open_play' as const, scorer_id: '', scorer_name: '', assist_id: '' };
    const { errors, warnings } = validateCard(
      { header: header({ goals_for: '2', goals_against: '0', result: 'W' }), goals: [{ ...goal, minute: '70+2' }], lineup: {}, videos: [] },
      base(),
      names,
    );
    expect(errors).toEqual(['Гол №1: добавленное время бывает только после 45, 90, 105 или 120 минуты.']);
    expect(warnings).toEqual(['Голов «Амкара» в списке 1, а в счёте 2.']);
  });
});
