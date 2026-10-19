import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbErrorMessage } from '../src/admin/dbErrors';
import { ALL_SLOT_LINES, bestXiLines, FORMATIONS, SLOT_LABEL, SLOT_TITLE } from '../src/format';
import {
  BEST_XI_SLOTS,
  bestXiDraft,
  isBestXiDirty,
  SEASON_RECORD_COLUMNS,
  isPlayerDirty,
  isSeasonDirty,
  playerDraft,
  saveSeason,
  seasonDraft,
  validateSeason,
  type SeasonRecord,
  saveBestXi,
  savePlayer,
  validateBestXi,
  validatePlayer,
  placePlayer,
  slotsOutside,
  switchFormation,
  type BestXiDraft,
  type BestXiRecord,
  type PlayerRecord,
  type Slot,
} from '../src/admin/people';
import type { LinkSite } from '../src/db/types';
import { STRANGER, migratedDb, pgliteWriter } from './db';

let db: PGlite;
const names = (id: number) => `Игрок ${id}`;
const label = (s: LinkSite) => s;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into season (id, label, start_year, end_year) values (1, '2008', 2008, 2008);
    insert into player (id, display_name, last_name) select g, 'И' || g, 'И' || g from generate_series(1, 4) g;
    insert into season_best_xi (season_id, slot, player_id) values (1, 'GK', 1), (1, 'ST1', 2);
    insert into player_link (player_id, site, url) values (1, 'wikipedia', 'https://ru.wikipedia.org/wiki/1');
  `);
}, 60_000);

const loadXi = async () => (await db.query<BestXiRecord>('select season_id, slot, player_id from season_best_xi order by slot')).rows;

const loadFormation = async () =>
  (await db.query<{ f: string | null }>('select best_xi_formation f from season where id = 1')).rows[0].f;

/** Сборная по схеме: место → номер игрока. */
const xi = (slots: Partial<Record<Slot, number>>) => {
  const draft = bestXiDraft([]);
  for (const [slot, id] of Object.entries(slots)) draft[slot as Slot] = String(id);
  return draft;
};
const filled = (draft: BestXiDraft) => Object.fromEntries(Object.entries(draft).filter(([, id]) => id));

describe('сборная сезона', () => {
  it('слоты: заменить, очистить, добавить; дважды один игрок — ошибка', async () => {
    const rows = await loadXi();
    const draft = { ...bestXiDraft(rows), GK: '3', ST1: '', CB1: '4' };
    expect(isBestXiDirty(draft, '', rows, '')).toBe(true);
    expect(validateBestXi({ ...draft, LB: '4' }, '', names)).toEqual(['Игрок 4 стоит в сборной 2 раза.']);
    const after = await saveBestXi(pgliteWriter(db), 1, rows, '', draft, '');
    expect((await loadXi()).map((r) => [r.slot, r.player_id])).toEqual([
      ['CB1', 4],
      ['GK', 3],
    ]);
    expect(isBestXiDirty(bestXiDraft(after), '', await loadXi(), '')).toBe(false);
  });

  it('схема: записывается у сезона, места вне схемы снимаются, «без схемы» — снова пусто', async () => {
    const rows = await loadXi();
    // CB1 в 5-3-2 есть, а ЦАП — новое место; GK остаётся
    const draft = { ...bestXiDraft(rows), AM: '1', LWB: '2' };
    expect(slotsOutside(draft, '5-3-2')).toEqual(['AM']);
    expect(isBestXiDirty(bestXiDraft(rows), '5-3-2', rows, '')).toBe(true);
    const after = await saveBestXi(pgliteWriter(db), 1, rows, '', draft, '5-3-2');
    expect(await loadFormation()).toBe('5-3-2');
    expect((await loadXi()).map((r) => [r.slot, r.player_id])).toEqual([
      ['CB1', 4],
      ['GK', 3],
      ['LWB', 2],
    ]);
    expect(isBestXiDirty(bestXiDraft(after), '5-3-2', after, '5-3-2')).toBe(false);

    // Обратно без схемы: ЛФЗ среди 13 мест Excel нет — снимается
    await saveBestXi(pgliteWriter(db), 1, after, '5-3-2', bestXiDraft(after), '');
    expect(await loadFormation()).toBeNull();
    expect((await loadXi()).map((r) => r.slot)).toEqual(['CB1', 'GK']);
  });

  it('проверка на двойника — только по местам схемы', () => {
    const draft = xi({ GK: 1, AM: 2, CM3: 2 });
    expect(validateBestXi(draft, '5-3-2', names)).toEqual([]);
    expect(validateBestXi(draft, '4-3-1-2', names)).toEqual(['Игрок 2 стоит в сборной 2 раза.']);
  });

  it('игрок с места вне схемы, поставленный на поле, оттуда убирается', () => {
    const draft = placePlayer(xi({ GK: 1, AM: 2 }), '5-3-2', 'CM3', '2');
    expect(filled(draft)).toEqual({ GK: '1', CM3: '2' });
  });

  describe('смена схемы', () => {
    const diamond = xi({ GK: 1, LB: 2, CB1: 3, CB2: 4, RB: 5, DM1: 6, CM1: 7, CM2: 8, AM: 9, ST1: 10, ST2: 11 });

    it('ромб → 5-3-2: крайние защитники — во фланговые, опорник — в ЦП, ЦАП — вне схемы', () => {
      const { draft, moved } = switchFormation(diamond, '5-3-2');
      expect(moved).toEqual([
        { playerId: '2', from: 'LB', to: 'LWB' },
        { playerId: '5', from: 'RB', to: 'RWB' },
        { playerId: '6', from: 'DM1', to: 'CM3' },
      ]);
      expect(slotsOutside(draft, '5-3-2')).toEqual(['AM']);
      expect(draft.CB3).toBe('');

      // и обратно: все снова на местах ромба
      const back = switchFormation(draft, '4-1-2-1-2');
      expect(filled(back.draft)).toEqual(filled(diamond));
    });

    it('4-4-2 → 4-3-3: крайние полузащитники — в вингеры, второй нападающий — вне схемы', () => {
      const flat = xi({ GK: 1, LB: 2, CB1: 3, CB2: 4, RB: 5, LM: 6, CM1: 7, CM2: 8, RM: 9, ST1: 10, ST2: 11 });
      const { draft, moved } = switchFormation(flat, '4-3-3');
      expect(moved).toEqual([
        { playerId: '6', from: 'LM', to: 'LW' },
        { playerId: '9', from: 'RM', to: 'RW' },
      ]);
      expect(slotsOutside(draft, '4-3-3')).toEqual(['ST2']);
      expect(draft.CM3).toBe('');
    });

    it('центральный защитник может уйти на фланг своей линии, но не в полузащиту', () => {
      const three = xi({ GK: 1, CB1: 2, CB2: 3, CB3: 4, LM: 5, CM1: 6, CM2: 7, CM3: 8, RM: 9, ST1: 10, ST2: 11 });
      const { draft, moved } = switchFormation(three, '4-4-2');
      expect(moved).toEqual([{ playerId: '4', from: 'CB3', to: 'LB' }]);
      expect(slotsOutside(draft, '4-4-2')).toEqual(['CM3']);
    });
  });
});

describe('схемы сборной', () => {
  it('у каждой схемы 11 разных мест из тех, что принимает база, и линии сходятся с названием', () => {
    for (const f of FORMATIONS) {
      const slots = f.lines.flat();
      expect(new Set(slots).size, f.name).toBe(slots.length);
      expect(slots.filter((s) => !(BEST_XI_SLOTS as readonly string[]).includes(s)), f.name).toEqual([]);
      if (f.key === '') continue;
      expect(slots.length, f.name).toBe(11);
      // линии от нападения к вратарю, название — от защиты к нападению
      expect(
        f.lines
          .slice(0, -1)
          .reverse()
          .map((l) => l.length)
          .join('-'),
      ).toBe(f.key);
    }
  });

  it('все места есть в подписях и в общей расстановке', () => {
    expect(Object.keys(SLOT_LABEL).sort()).toEqual([...BEST_XI_SLOTS].sort());
    expect(ALL_SLOT_LINES.flat().sort()).toEqual([...BEST_XI_SLOTS].sort());
    for (const label of Object.values(SLOT_LABEL)) expect(SLOT_TITLE[label], label).toBeTruthy();
  });

  it('показ: по схеме, а если в базе места не из неё — все места', () => {
    expect(bestXiLines('5-3-2', ['GK', 'LWB', 'CB2', 'ST1'])).toEqual([['ST1'], ['LWB', 'CB2'], ['GK']]);
    expect(bestXiLines('', ['GK', 'AM'])).toEqual([['AM'], ['GK']]);
    // незнакомая схема — как без схемы
    expect(bestXiLines('3-4-1-2', ['GK', 'CB3'])).toEqual([['CB3'], ['GK']]);
  });
});

describe('карточка игрока', () => {
  const load = async () => {
    const p = (await db.query<PlayerRecord>('select id, display_name, last_name, first_name, middle_name, birth_date::text, academy, position, notes from player where id = 1')).rows[0];
    const links = (await db.query<{ site: LinkSite; url: string }>('select site, url from player_link where player_id = 1')).rows;
    return { p, links };
  };

  it('ФИО, дата рождения, позиция, ссылки: добавить, поменять, стереть', async () => {
    const { p, links } = await load();
    const d = playerDraft(p, links);
    expect(isPlayerDirty(d, p, links)).toBe(false);
    const next = {
      ...d,
      display_name: 'Ю. Волков',
      last_name: 'Волков',
      first_name: 'Юрий',
      birth_date: '1985-05-21',
      position: 'DF' as const,
      academy: true,
      links: { transfermarkt: ' https://www.transfermarkt.com/x/profil/spieler/1 ', championat: '', wikipedia: '' },
    };
    expect(validatePlayer({ ...next, links: { ...next.links, championat: 'championat.com/x' } }, label)).toEqual([
      'championat: адрес должен начинаться с https://',
    ]);
    expect(validatePlayer({ ...next, photo_url: 'http://img.example.com/1.jpg' }, label)).toEqual([
      'Ссылка на фото: адрес должен начинаться с https://',
    ]);
    expect(isPlayerDirty(next, p, links)).toBe(true);
    await savePlayer(pgliteWriter(db), p, links, next);
    const after = await load();
    expect(after.p).toMatchObject({ display_name: 'Ю. Волков', first_name: 'Юрий', birth_date: '1985-05-21', position: 'DF', academy: true });
    expect(after.links).toEqual([{ site: 'transfermarkt', url: 'https://www.transfermarkt.com/x/profil/spieler/1' }]);
    expect(isPlayerDirty(playerDraft(after.p, after.links), after.p, after.links)).toBe(false);
  });

  it('посторонний не меняет — понятной ошибкой', async () => {
    const { p, links } = await load();
    await expect(savePlayer(pgliteWriter(db, STRANGER), p, links, { ...playerDraft(p, links), notes: 'взлом' })).rejects.toSatisfy(
      (e) => dbErrorMessage(e) === 'Запись не изменилась: её нет в базе или нет прав на запись.',
    );
  });
});

describe('сезон: сведения и ссылки', () => {
  const load = async () => {
    const s = (await db.query<SeasonRecord>(`select ${SEASON_RECORD_COLUMNS} from season where id = 1`)).rows[0];
    const links = (await db.query<{ site: LinkSite; url: string }>('select site, url from season_link where season_id = 1')).rows;
    return { s, links };
  };

  it('лига, уровень, место, число команд, ссылки; место больше числа команд — ошибка', async () => {
    const { s, links } = await load();
    const d = seasonDraft(s, links);
    expect(isSeasonDirty(d, s, links)).toBe(false);
    const next = {
      ...d,
      division: 'Премьер-лига',
      tier: '1',
      final_place: '8',
      teams_count: '16',
      links: { transfermarkt: '', championat: 'https://www.championat.com/football/_russiapl/tournament/1/', wikipedia: 'https://ru.wikipedia.org/wiki/2008' },
    };
    expect(validateSeason({ ...next, final_place: '17', tier: '6' }, label)).toEqual([
      'Уровень лиги — от 1 до 5 (1 — высший дивизион).',
      'Место не может быть больше числа команд.',
    ]);
    await saveSeason(pgliteWriter(db), s, links, next);
    const after = await load();
    expect(after.s).toMatchObject({ division: 'Премьер-лига', tier: 1, final_place: 8, teams_count: 16 });
    expect(after.links.map((l) => l.site).sort()).toEqual(['championat', 'wikipedia']);
    expect(isSeasonDirty(seasonDraft(after.s, after.links), after.s, after.links)).toBe(false);
    // стёрли ссылку — удалилась
    await saveSeason(pgliteWriter(db), after.s, after.links, { ...seasonDraft(after.s, after.links), links: { transfermarkt: '', championat: '', wikipedia: 'https://ru.wikipedia.org/wiki/2008' } });
    expect((await load()).links.map((l) => l.site)).toEqual(['wikipedia']);
  });
});
