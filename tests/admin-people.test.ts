import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbErrorMessage } from '../src/admin/dbErrors';
import {
  bestXiDraft,
  isBestXiDirty,
  isPlayerDirty,
  playerDraft,
  saveBestXi,
  savePlayer,
  validateBestXi,
  validatePlayer,
  type BestXiRecord,
  type PlayerRecord,
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

describe('сборная сезона', () => {
  it('слоты: заменить, очистить, добавить; дважды один игрок — ошибка', async () => {
    const rows = await loadXi();
    const draft = { ...bestXiDraft(rows), GK: '3', ST1: '', CB1: '4' };
    expect(isBestXiDirty(draft, rows)).toBe(true);
    expect(validateBestXi({ ...draft, LB: '4' }, names)).toEqual(['Игрок 4 стоит в сборной 2 раза.']);
    const after = await saveBestXi(pgliteWriter(db), 1, rows, draft);
    expect((await loadXi()).map((r) => [r.slot, r.player_id])).toEqual([
      ['CB1', 4],
      ['GK', 3],
    ]);
    expect(isBestXiDirty(bestXiDraft(after), await loadXi())).toBe(false);
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
