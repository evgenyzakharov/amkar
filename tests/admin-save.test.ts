import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbErrorMessage } from '../src/admin/dbErrors';
import {
  cardDraft,
  newGoalKey,
  validateCard,
  updateRow,
  type AbsenceRecord,
  type AppearanceRecord,
  type CardBase,
  type CardDraft,
  type Competition,
  type GoalDraft,
  type GoalRecord,
  type MatchRecord,
  type VideoRecord,
  newVideoKey,
} from '../src/admin/match';
import { isDirty, saveMatchCard } from '../src/admin/save';
import type { Writer } from '../src/admin/writer';
import { STRANGER, migratedDb, pgliteWriter } from './db';

let db: PGlite;
let competitions: Competition[];

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into season (id, label, start_year, end_year) values (1, '2011/12', 2011, 2012);
    insert into player (id, display_name, last_name) values
      (1, 'Нарубин', 'Нарубин'), (2, 'Пеев', 'Пеев'), (3, 'Кушев', 'Кушев'), (4, 'Волков', 'Волков'), (5, 'Гол', 'Гол');
    insert into squad_member (season_id, player_id) select 1, id from player;
    insert into match (id, season_id, competition_id, seq, opponent_raw, result) values (1, 1, 1, 1, 'Химки', 'W');
    select setval(pg_get_serial_sequence('match', 'id'), 1);
  `);
  competitions = (await db.query<Competition>('select id, name, kind from competition order by id')).rows;
}, 60_000);

/** Карточка так, как её прочитало бы приложение. */
async function loadBase(matchId: number | null): Promise<CardBase> {
  const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ j: T }>(sql, params)).rows.map((r) => r.j);
  const [match] = matchId ? await q<MatchRecord>('select to_json(m) j from match m where id = $1', [matchId]) : [null];
  const pickMatch = (m: MatchRecord & Record<string, unknown>) => {
    const { created_at, updated_at, ...rest } = m;
    void created_at;
    void updated_at;
    return rest as MatchRecord;
  };
  return {
    season: { id: 1, label: '2011/12', start_year: 2011, end_year: 2012 },
    match: match ? pickMatch(match as MatchRecord & Record<string, unknown>) : null,
    nextSeq: 2,
    goals: matchId ? await q<GoalRecord>('select to_json(g) j from goal g where match_id = $1 order by id', [matchId]) : [],
    appearances: matchId
      ? await q<AppearanceRecord>('select to_json(a) j from appearance a where match_id = $1 order by player_id', [matchId])
      : [],
    absences: matchId ? await q<AbsenceRecord>('select to_json(a) j from absence a where match_id = $1 order by player_id', [matchId]) : [],
    videos: matchId
      ? await q<VideoRecord>("select json_build_object('id', id, 'match_id', match_id, 'kind', kind, 'url', url, 'title', title) j from match_video where match_id = $1 order by id", [matchId])
      : [],
    teams: await q<{ id: number; name: string }>('select json_build_object(\'id\', id, \'name\', name) j from team order by name'),
    coaches: await q<{ id: number; short_name: string; full_name: string }>(
      "select json_build_object('id', id, 'short_name', short_name, 'full_name', full_name) j from coach",
    ),
  };
}

const goal = (patch: Partial<GoalDraft>): GoalDraft => ({
  key: newGoalKey(), id: null, side: 'amkar', minute: '', kind: 'open_play', scorer_id: '', scorer_name: '', assist_id: '', ...patch,
});

/** Новый матч: 2:1 после 1:1 в основное время, состав с заменой и пропуск по травме. */
function newMatchDraft(base: CardBase): CardDraft {
  const draft = cardDraft(base, competitions);
  let lineup = draft.lineup;
  lineup = updateRow(lineup, 1, { status: 'start' });
  lineup = updateRow(lineup, 2, { status: 'start' });
  lineup = updateRow(lineup, 3, { status: 'sub' });
  lineup = updateRow(lineup, 3, { minute_on: '64', replaced: '2' });
  lineup = updateRow(lineup, 4, { status: 'bench' });
  lineup = updateRow(lineup, 5, { status: 'injury' });
  return {
    header: {
      ...draft.header,
      competition_id: '2',
      round: '1/16 финала',
      match_date: '2011-09-21',
      venue: 'away',
      opponent: 'Томь Томск',
      result: 'W',
      goals_for: '2',
      goals_against: '1',
      extra_time: true,
      coach: 'Рахимов',
      formation: '4-4-2',
    },
    goals: [
      goal({ minute: '12', scorer_id: '2', assist_id: '1' }),
      goal({ side: 'opponent', minute: '45+1', scorer_name: 'Клещенко' }),
      goal({ minute: '110', kind: 'penalty', scorer_id: '3' }),
    ],
    lineup,
    videos: [],
  };
}

describe('сохранение карточки матча', () => {
  let matchId: number;

  it('новый матч: соперник и тренер заводятся в справочниках, всё ложится в базу', async () => {
    const base = await loadBase(null);
    const out = await saveMatchCard(pgliteWriter(db), base, newMatchDraft(base));
    expect(out.error).toBeNull();
    matchId = out.base.match!.id;
    expect(matchId).toBe(2);

    const saved = await loadBase(matchId);
    expect(saved.match).toMatchObject({
      seq: 2, competition_id: 2, round: '1/16 финала', match_date: '2011-09-21', venue: 'away', result: 'W',
      goals_for: 2, goals_against: 1, extra_time: true, opponent_raw: null, formation: '4-4-2',
    });
    expect(saved.teams).toEqual([{ id: saved.match!.opponent_id, name: 'Томь Томск' }]);
    expect(saved.coaches).toMatchObject([{ id: saved.match!.coach_id, short_name: 'Рахимов' }]);
    expect(saved.goals.map((g) => [g.side, g.minute, g.added_time, g.kind, g.scorer_id, g.scorer_name, g.assist_id])).toEqual([
      ['amkar', 12, null, 'open_play', 2, null, 1],
      ['opponent', 45, 1, 'open_play', null, 'Клещенко', null],
      ['amkar', 110, null, 'penalty', 3, null, null],
    ]);
    // доп. время: матч до 120-й минуты
    expect(saved.appearances.map((a) => [a.player_id, a.role, a.minutes, a.minute_on, a.minute_off, a.replaced_player_id])).toEqual([
      [1, 'start', 120, null, null, null],
      [2, 'start', 64, null, 64, null],
      [3, 'sub', 56, 64, null, 2],
      [4, 'bench', 0, null, null, null],
    ]);
    expect(saved.absences).toEqual([{ match_id: matchId, player_id: 5, reason: 'injury' }]);
    // в сохранённой карточке нечего сохранять
    expect(isDirty(saved, cardDraft(saved, competitions))).toBe(false);
  });

  it('правка: голы, замены, пропуски — только изменённое, лишнее удаляется', async () => {
    const base = await loadBase(matchId);
    const draft = cardDraft(base, competitions);
    // гол соперника убрали, третий гол поправили, добавили автогол соперника в наши ворота
    let goals = draft.goals.filter((g) => g.side === 'amkar');
    goals = goals.map((g) => (g.minute === '110' ? { ...g, minute: '115' } : g));
    goals.push(goal({ side: 'opponent', minute: '90+2', kind: 'own_goal', scorer_id: '4' }));
    // Кушев больше не выходил: Пеев отыграл весь матч; Гол (травма) теперь в запасе, Волков — дисквалификация
    let lineup = updateRow(draft.lineup, 3, { status: '' });
    lineup = updateRow(lineup, 2, { minute_off: '' });
    lineup = updateRow(lineup, 5, { status: 'bench' });
    lineup = updateRow(lineup, 4, { status: 'suspension' });

    const next = { ...draft, header: { ...draft.header, goals_for: '3', notes: 'Перенесён' }, goals, lineup };
    expect(isDirty(base, next)).toBe(true);
    const out = await saveMatchCard(pgliteWriter(db), base, next);
    expect(out.error).toBeNull();

    const saved = await loadBase(matchId);
    expect(saved.match).toMatchObject({ goals_for: 3, notes: 'Перенесён' });
    expect(saved.goals.map((g) => [g.side, g.minute, g.added_time, g.kind, g.scorer_id])).toEqual([
      ['amkar', 12, null, 'open_play', 2],
      ['amkar', 115, null, 'penalty', 3],
      ['opponent', 90, 2, 'own_goal', 4],
    ]);
    expect(saved.appearances.map((a) => [a.player_id, a.role, a.minutes])).toEqual([
      [1, 'start', 120],
      [2, 'start', 120],
      [5, 'bench', 0],
    ]);
    expect(saved.absences).toEqual([{ match_id: matchId, player_id: 4, reason: 'suspension' }]);
    expect(isDirty(saved, cardDraft(saved, competitions))).toBe(false);
  });

  it('правка одних зрителей — тоже изменение', async () => {
    const base = await loadBase(matchId);
    const draft = cardDraft(base, competitions);
    const next = { ...draft, header: { ...draft.header, attendance: '5000' } };
    expect(isDirty(base, next)).toBe(true);
    const out = await saveMatchCard(pgliteWriter(db), base, next);
    expect(out.error).toBeNull();

    const saved = await loadBase(matchId);
    expect(saved.match).toMatchObject({ attendance: 5000 });
    expect(isDirty(saved, cardDraft(saved, competitions))).toBe(false);
  });

  it('сбой посередине: записанное не дублируется при повторе', async () => {
    const base = await loadBase(matchId);
    const draft = cardDraft(base, competitions);
    const next: CardDraft = {
      ...draft,
      header: { ...draft.header, opponent: 'Томь', round: '1/8 финала' },
      goals: [...draft.goals, goal({ minute: '30', scorer_id: '1' })],
      lineup: updateRow(draft.lineup, 3, { status: 'bench' }),
    };
    // состав падает: связь с базой оборвалась после голов
    const real = pgliteWriter(db);
    const flaky: Writer = {
      ...real,
      upsert: (table, rows, onConflict) =>
        table === 'appearance' ? Promise.reject(new TypeError('Failed to fetch')) : real.upsert(table, rows, onConflict),
    };
    const failed = await saveMatchCard(flaky, base, next);
    expect(dbErrorMessage(failed.error)).toBe('Нет связи с базой. Проверьте интернет и попробуйте ещё раз.');
    expect(failed.draft.goals.every((g) => g.id != null)).toBe(true);

    const retry = await saveMatchCard(real, failed.base, failed.draft);
    expect(retry.error).toBeNull();
    const saved = await loadBase(matchId);
    expect(saved.teams.map((t) => t.name)).toEqual(['Томь', 'Томь Томск']);
    expect(saved.goals).toHaveLength(4);
    expect(saved.appearances.map((a) => a.player_id)).toEqual([1, 2, 3, 5]);
  });

  it('видео: добавить, поправить, удалить; не YouTube и не ВК — ошибка', async () => {
    const base = await loadBase(matchId);
    const draft = cardDraft(base, competitions);
    const video = (url: string, kind: 'full' | 'highlights' = 'highlights') => ({ key: newVideoKey(), id: null, kind, url, title: '' });
    const out = await saveMatchCard(pgliteWriter(db), base, {
      ...draft,
      videos: [video('https://youtu.be/full1', 'full'), { ...video('https://vk.com/video-1_2'), title: 'ТВ' }],
    });
    expect(out.error).toBeNull();
    let saved = await loadBase(matchId);
    expect(saved.videos.map((v) => [v.kind, v.url, v.title])).toEqual([
      ['full', 'https://youtu.be/full1', null],
      ['highlights', 'https://vk.com/video-1_2', 'ТВ'],
    ]);
    expect(isDirty(saved, cardDraft(saved, competitions))).toBe(false);
    // обзор стал полным матчем, первое видео убрали
    const next = cardDraft(saved, competitions);
    const out2 = await saveMatchCard(pgliteWriter(db), saved, { ...next, videos: next.videos.slice(1).map((v) => ({ ...v, kind: 'full' as const })) });
    expect(out2.error).toBeNull();
    saved = await loadBase(matchId);
    expect(saved.videos.map((v) => [v.kind, v.url])).toEqual([['full', 'https://vk.com/video-1_2']]);
    const { errors } = validateCard({ ...next, videos: [video('https://rutube.ru/video/1/'), video('http://youtu.be/x')] }, saved, (id) => String(id));
    expect(errors).toEqual(['Видео №1: только YouTube или ВК.', 'Видео №2: ссылка должна начинаться с https://']);
  });

  it('ошибка базы — понятным текстом: занятый номер матча', async () => {
    const base = await loadBase(matchId);
    const draft = cardDraft(base, competitions);
    const out = await saveMatchCard(pgliteWriter(db), base, { ...draft, header: { ...draft.header, seq: '1' } });
    expect(dbErrorMessage(out.error)).toBe('В сезоне уже есть матч с таким номером.');
  });

  it('посторонний аккаунт ничего не меняет', async () => {
    const base = await loadBase(matchId);
    const draft = cardDraft(base, competitions);
    const out = await saveMatchCard(pgliteWriter(db, STRANGER), base, { ...draft, header: { ...draft.header, notes: 'взлом' } });
    expect(dbErrorMessage(out.error)).toBe('Запись не изменилась: её нет в базе или нет прав на запись.');
    const created = await saveMatchCard(pgliteWriter(db, STRANGER), await loadBase(null), newMatchDraft(await loadBase(null)));
    expect(dbErrorMessage(created.error)).toBe('Нет прав на запись. Войдите заново под аккаунтом админа.');
    expect((await loadBase(matchId)).match!.notes).toBe('Перенесён');
  });
});
