import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, STRANGER, SUPABASE_EXPOSED, SUPABASE_STRICT, asUser as asUserIn, migratedDb } from './db';

let db: PGlite;

/** Выполняет запрос так, как его выполнил бы клиент Supabase с анонимным ключом или от имени пользователя. */
const asUser = (userId: string | null, sql: string, conn = db) => asUserIn(conn, userId, sql);

beforeAll(async () => {
  db = await migratedDb(SUPABASE_EXPOSED);
  await db.exec(`

    insert into season (id, label, start_year, end_year) values (1, '2008', 2008, 2008);
    insert into player (id, display_name, last_name) values (1, 'Пеев', 'Пеев'), (2, 'Кушев', 'Кушев'), (3, 'Волков', 'Волков');
    insert into squad_member (season_id, player_id) values (1, 1), (1, 2), (1, 3);
    insert into match (id, season_id, competition_id, seq, opponent_raw, result)
      values (1, 1, (select id from competition where kind = 'league'), 1, 'Химки', 'W');
    insert into appearance (match_id, player_id, role, minutes) values (1, 1, 'start', 90), (1, 2, 'start', 60);

    -- явные id не двигают identity: без setval следующая вставка получит уже занятый id
    select setval(pg_get_serial_sequence('season', 'id'), (select max(id) from season));
    select setval(pg_get_serial_sequence('player', 'id'), (select max(id) from player));
    select setval(pg_get_serial_sequence('match', 'id'), (select max(id) from match));
  `);
}, 60_000);

describe('права доступа', () => {
  it('аноним читает данные', async () => {
    const { rows } = await asUser(null, 'select label from season');
    expect(rows).toEqual([{ label: '2008' }]);
  });

  it('аноним не может ничего менять', async () => {
    await expect(
      asUser(null, `insert into season (label, start_year, end_year) values ('2009', 2009, 2009)`),
    ).rejects.toThrow(/row-level security/);
  });

  it('вошедший пользователь не из admins не может ничего менять', async () => {
    await expect(
      asUser(STRANGER, `insert into season (label, start_year, end_year) values ('2009', 2009, 2009)`),
    ).rejects.toThrow(/row-level security/);
    const { rows } = await asUser(STRANGER, `update player set notes = 'взлом' where id = 1 returning id`);
    expect(rows).toEqual([]);
  });

  it('админ меняет данные', async () => {
    await asUser(ADMIN, `insert into season (label, start_year, end_year) values ('2010', 2010, 2010)`);
    const { rows } = await asUser(ADMIN, `update player set notes = 'ок' where id = 1 returning id`);
    expect(rows).toEqual([{ id: 1 }]);
  });

  it('таблица admins через API недоступна даже админу', async () => {
    await expect(asUser(ADMIN, 'select * from admins')).rejects.toThrow(/permission denied/);
  });
});

describe('права при выключенном «Automatically expose new tables»', () => {
  let strict: PGlite;
  beforeAll(async () => {
    strict = await migratedDb(SUPABASE_STRICT);
  }, 60_000);

  it('аноним читает, но не пишет', async () => {
    const { rows } = await asUser(null, `select count(*)::int n from competition`, strict);
    expect(rows).toEqual([{ n: 5 }]);
    await expect(
      asUser(null, `insert into season (label, start_year, end_year) values ('2009', 2009, 2009)`, strict),
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it('админ пишет, посторонний — нет', async () => {
    await asUser(ADMIN, `insert into season (label, start_year, end_year) values ('2009', 2009, 2009)`, strict);
    await expect(
      asUser(STRANGER, `insert into season (label, start_year, end_year) values ('2010', 2010, 2010)`, strict),
    ).rejects.toThrow(/row-level security/);
  });

  it('аноним читает статистику игроков', async () => {
    const { rows } = await asUser(null, `select count(*)::int n from player_season_stats`, strict);
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe('статистика игрока за сезон (player_season_stats)', () => {
  let stats: PGlite;
  beforeAll(async () => {
    stats = await migratedDb(SUPABASE_EXPOSED);
    await stats.exec(`
      insert into season (id, label, start_year, end_year) values (1, '2011/12', 2011, 2012), (2, '2012/13', 2012, 2013);
      insert into player (id, display_name, last_name, academy) values
        (1, 'Нарубин', 'Нарубин', false), (2, 'Пеев', 'Пеев', false), (3, 'Кушев', 'Кушев', true),
        (4, 'Запасной', 'Запасной', false), (5, 'Новичок', 'Новичок', false);
      insert into squad_member (season_id, player_id, shirt_number, position, on_loan) values
        (1, 1, 1, 'GK', false), (1, 2, 7, 'MF', false), (1, 3, 29, 'FW', true), (1, 4, 30, 'DF', false),
        (1, 5, 31, 'DF', false), (2, 2, 7, 'MF', false);
      insert into match (id, season_id, competition_id, seq, opponent_raw, result, extra_time) values
        (1, 1, (select id from competition where kind = 'league'), 1, 'Зенит', 'W', false),
        (2, 1, (select id from competition where kind = 'cup'), 2, 'Енисей', 'L', true),
        (3, 1, (select id from competition where kind = 'friendly'), 3, 'Звезда', 'D', false),
        (4, 2, (select id from competition where kind = 'league'), 1, 'Рубин', 'D', false);
      insert into appearance (match_id, player_id, role, minutes, minute_on, minute_off, replaced_player_id) values
        (1, 1, 'start', 90, null, null, null),
        (1, 3, 'start', 60, null, 60, null),
        (1, 2, 'sub', 30, 61, null, 3),
        (1, 4, 'bench', 0, null, null, null),
        (2, 1, 'start', 120, null, null, null),
        (2, 2, 'bench', 0, null, null, null),
        (2, 3, null, 45, null, null, null),   -- старый матч: роль неизвестна, есть только минуты
        (2, 4, null, null, null, null, null), -- в заявке, минуты неизвестны
        (3, 1, 'start', 90, null, null, null),
        (3, 5, 'start', 90, null, null, null),
        (4, 2, 'start', 90, null, null, null);
      insert into player_season_totals (season_id, player_id, competition_id, goals, assists, goals_conceded) values
        (1, 1, (select id from competition where kind = 'league'), null, null, 1),
        (1, 1, (select id from competition where kind = 'cup'), null, null, 2),
        (1, 2, (select id from competition where kind = 'league'), 1, 0, null),
        (1, 2, (select id from competition where kind = 'cup'), 2, null, null),
        (1, 3, (select id from competition where kind = 'league'), null, 1, null);
    `);
  }, 60_000);

  const season = async (seasonId: number) =>
    (
      await stats.query(
        `select player_id, games, minutes, goals, assists, goals_conceded from player_season_stats
         where season_id = $1 order by player_id`,
        [seasonId],
      )
    ).rows;

  it('игры и минуты по матчам, голы и передачи из итогов, без товарищеских', async () => {
    expect(await season(1)).toEqual([
      { player_id: 1, games: 2, minutes: 210, goals: null, assists: null, goals_conceded: 3 },
      { player_id: 2, games: 1, minutes: 30, goals: 3, assists: 0, goals_conceded: null },
      { player_id: 3, games: 2, minutes: 105, goals: null, assists: 1, goals_conceded: null },
      // запас и «минуты неизвестны» — не игры
      { player_id: 4, games: 0, minutes: 0, goals: null, assists: null, goals_conceded: null },
      // в заявке, но играл только в товарищеском
      { player_id: 5, games: 0, minutes: 0, goals: null, assists: null, goals_conceded: null },
    ]);
  });

  it('сезоны игрока не смешиваются, рядом — заявка и сезон', async () => {
    const { rows } = await stats.query(
      `select season_label, shirt_number, position, on_loan, academy, games, minutes
       from player_season_stats where player_id in (2, 3) order by player_id, start_year`,
    );
    expect(rows).toEqual([
      { season_label: '2011/12', shirt_number: 7, position: 'MF', on_loan: false, academy: false, games: 1, minutes: 30 },
      { season_label: '2012/13', shirt_number: 7, position: 'MF', on_loan: false, academy: false, games: 1, minutes: 90 },
      { season_label: '2011/12', shirt_number: 29, position: 'FW', on_loan: true, academy: true, games: 2, minutes: 105 },
    ]);
  });

  it('ролям API — только чтение, хотя Supabase по умолчанию выдал бы всё', async () => {
    const { rows } = await asUser(null, `select count(*)::int n from player_season_stats`, stats);
    expect(rows).toEqual([{ n: 6 }]);
    const privileges = await stats.query(`
      select r.role, string_agg(p.privilege, ',' order by p.privilege) granted
      from unnest(array['anon', 'authenticated']) r(role)
      cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(privilege)
      where has_table_privilege(r.role, 'player_season_stats', p.privilege)
      group by r.role order by r.role`);
    expect(privileges.rows).toEqual([
      { role: 'anon', granted: 'select' },
      { role: 'authenticated', granted: 'select' },
    ]);
  });

  it('читает с правами спрашивающего: RLS таблиц действует и через view', async () => {
    await stats.exec(`begin; create policy "скрыть" on squad_member as restrictive for select to anon using (season_id <> 1)`);
    try {
      const { rows } = await asUser(null, `select season_label from player_season_stats`, stats);
      expect(rows).toEqual([{ season_label: '2012/13' }]);
    } finally {
      await stats.exec('rollback');
    }
  });
});

describe('карточки: позиция, ссылки, фото', () => {
  it('основная позиция переносится из заявок: самая частая, при равенстве — из последнего сезона', async () => {
    const moved = await migratedDb(SUPABASE_EXPOSED, {
      migration: '20261018150000',
      sql: `
        insert into season (id, label, start_year, end_year) values (1, '2010', 2010, 2010), (2, '2011/12', 2011, 2012), (3, '2012/13', 2012, 2013);
        insert into player (id, display_name, last_name) values (1, 'Пеев', 'Пеев'), (2, 'Сираков', 'Сираков'), (3, 'Безпозиции', 'Безпозиции');
        insert into squad_member (season_id, player_id, position) values
          (1, 1, 'MF'), (2, 1, 'MF'), (3, 1, 'FW'),
          (1, 2, 'MF'), (2, 2, 'DF'),
          (1, 3, null);
      `,
    });
    const { rows } = await moved.query(`select id, position from player order by id`);
    expect(rows).toEqual([
      { id: 1, position: 'MF' },
      { id: 2, position: 'DF' },
      { id: 3, position: null },
    ]);
  });

  it('ссылки читают все, меняет только админ, адрес — https и сайт из списка', async () => {
    await asUser(ADMIN, `insert into player_link (player_id, site, url) values (1, 'transfermarkt', 'https://www.transfermarkt.com/x')`);
    await asUser(ADMIN, `insert into season_link (season_id, site, url) values (1, 'championat', 'https://www.championat.com/x')`);
    const { rows } = await asUser(null, `select site from player_link union all select site from season_link order by 1`);
    expect(rows).toEqual([{ site: 'championat' }, { site: 'transfermarkt' }]);
    await expect(
      asUser(STRANGER, `insert into player_link (player_id, site, url) values (2, 'wikipedia', 'https://ru.wikipedia.org/x')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(ADMIN, `insert into player_link (player_id, site, url) values (2, 'wikipedia', 'http://ru.wikipedia.org/x')`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(ADMIN, `insert into player_link (player_id, site, url) values (2, 'sports', 'https://www.sports.ru/x')`),
    ).rejects.toThrow(/check constraint/);
  });

  it('фото: публичный бакет только для картинок, загружает только админ', async () => {
    const { rows } = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'player-photos'`);
    expect(rows).toEqual([{ public: true, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }]);
    await asUser(ADMIN, `insert into storage.objects (bucket_id, name) values ('player-photos', '1.jpg')`);
    await expect(
      asUser(STRANGER, `insert into storage.objects (bucket_id, name) values ('player-photos', '2.jpg')`),
    ).rejects.toThrow(/row-level security/);
    const { rows: listed } = await asUser(STRANGER, `select name from storage.objects`);
    expect(listed).toEqual([]);
  });
});

describe('ограничения матча', () => {
  const insertMatch = (seq: number, values: string) =>
    db.query(`
      insert into match (season_id, competition_id, seq, opponent_raw, result, goals_for, goals_against, pens_for, pens_against)
      values (1, (select id from competition where kind = 'cup'), ${seq}, 'Соперник', ${values})
    `);

  it('результат должен сходиться со счётом', async () => {
    await expect(insertMatch(10, `'W', 0, 1, null, null`)).rejects.toThrow(/check constraint/);
    await insertMatch(11, `'L', 0, 1, null, null`);
  });

  it('при серии пенальти допустимы ничья и итог серии, но не обратный итог', async () => {
    await insertMatch(12, `'D', 1, 1, 4, 3`);
    await insertMatch(13, `'W', 1, 1, 4, 3`);
    await expect(insertMatch(14, `'L', 1, 1, 4, 3`)).rejects.toThrow(/check constraint/);
    await expect(insertMatch(15, `'W', 2, 1, 4, 3`)).rejects.toThrow(/check constraint/);
  });

  it('старый матч может быть без счёта, но с результатом', async () => {
    await insertMatch(16, `'D', null, null, null, null`);
  });

  it('техническая победа — без счёта, но обязательно с результатом', async () => {
    await db.query(
      `insert into match (season_id, competition_id, seq, opponent_raw, result, awarded) values (1, 1, 17, 'Москва', 'W', true)`,
    );
    await expect(
      db.query(`insert into match (season_id, competition_id, seq, opponent_raw, awarded) values (1, 1, 18, 'Москва', true)`),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('пропуски матчей', () => {
  it('причина — травма, дисквалификация или сборная', async () => {
    await db.query(`insert into absence (match_id, player_id, reason) values (1, 3, 'national_team')`);
    await expect(
      db.query(`insert into absence (match_id, player_id, reason) values (1, 2, 'rest')`),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('ограничения состава на матч', () => {
  it('вышедший на замену заменяет игрока из того же матча', async () => {
    await db.query(
      `insert into appearance (match_id, player_id, role, minutes, minute_on, replaced_player_id) values (1, 3, 'sub', 30, 60, 2)`,
    );
    await db.query('delete from appearance where match_id = 1 and player_id = 3');
    // во втором матче Кушева в заявке нет — заменить его нельзя
    const { rows } = await db.query<{ id: number }>(
      `insert into match (season_id, competition_id, seq, opponent_raw) values (1, 1, 2, 'Томь') returning id`,
    );
    await expect(
      db.query(
        `insert into appearance (match_id, player_id, role, minutes, minute_on, replaced_player_id) values (${rows[0].id}, 3, 'sub', 30, 60, 2)`,
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('в запасе без минут, минута выхода только у вышедших на замену', async () => {
    await expect(
      db.query(`insert into appearance (match_id, player_id, role, minutes) values (1, 3, 'bench', 15)`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`insert into appearance (match_id, player_id, role, minutes, minute_on) values (1, 3, null, 15, 75)`),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('ограничения голов', () => {
  it('игрок «Амкара» в пропущенном голе — только автор автогола', async () => {
    await db.query(`insert into goal (match_id, side, minute, kind, scorer_id) values (1, 'opponent', 30, 'own_goal', 1)`);
    await expect(
      db.query(`insert into goal (match_id, side, minute, scorer_id) values (1, 'opponent', 30, 1)`),
    ).rejects.toThrow(/check constraint/);
  });

  it('компенсированное время только после 45, 90, 105 или 120 минуты', async () => {
    await db.query(`insert into goal (match_id, side, minute, added_time, scorer_id, assist_id) values (1, 'amkar', 90, 3, 2, 1)`);
    await expect(
      db.query(`insert into goal (match_id, side, minute, added_time, scorer_id) values (1, 'amkar', 70, 3, 2)`),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('названия клуба по годам', () => {
  let names: PGlite;
  beforeAll(async () => {
    names = await migratedDb(SUPABASE_STRICT);
    await names.exec(`
      insert into season (id, label, start_year, end_year) values
        (1, '1996', 1996, 1996), (2, '2002', 2002, 2002), (3, '2011/12', 2011, 2012), (4, '2003', 2003, 2003);
      insert into team (id, name) values (1, 'Урал'), (2, 'Рубин Казань');
      insert into team_name (team_id, name, from_year, to_year) values (1, 'Уралмаш', null, 2002), (1, 'Урал-Сверд', 2003, 2003);
      insert into match (id, season_id, competition_id, seq, opponent_id, opponent_raw) values
        (1, 1, 1, 1, 1, 'Уралмаш'), (2, 2, 1, 1, 1, null), (3, 4, 1, 1, 1, 'Урал'), (4, 3, 1, 1, 1, 'Урал'),
        (5, 3, 1, 2, 2, 'Рубин'), (6, 3, 1, 3, null, 'Шинник');
      insert into player (id, display_name, last_name) values (1, 'Пеев', 'Пеев');
      insert into transfer (player_id, season_id, direction, other_team_id, other_team_raw) values
        (1, 1, 'in', 1, null), (1, 3, 'out', null, 'Спартак');
    `);
  }, 60_000);

  it('соперник — как назывался в сезон матча, иначе текущее название, иначе текст из Excel', async () => {
    const { rows } = await asUserIn(names, null, 'select m.id, opponent_name(m) as name from match m order by id');
    expect(rows).toEqual([
      { id: 1, name: 'Уралмаш' },
      { id: 2, name: 'Уралмаш' },
      { id: 3, name: 'Урал-Сверд' },
      { id: 4, name: 'Урал' },
      { id: 5, name: 'Рубин Казань' },
      { id: 6, name: 'Шинник' },
    ]);
  });

  it('клуб трансфера — так же, по сезону трансфера', async () => {
    const { rows } = await asUserIn(names, null, 'select other_team_name(t) as name from transfer t order by id');
    expect(rows).toEqual([{ name: 'Уралмаш' }, { name: 'Спартак' }]);
  });

  it('читают все, меняет только админ; годы — по порядку', async () => {
    await expect(asUserIn(names, STRANGER, `insert into team_name (team_id, name) values (2, 'Рубин')`)).rejects.toThrow(/row-level security/);
    await asUserIn(names, ADMIN, `insert into team_name (team_id, name, from_year, to_year) values (2, 'Рубин', 1958, 1990)`);
    await expect(
      asUserIn(names, ADMIN, `insert into team_name (team_id, name, from_year, to_year) values (2, 'Искра', 1991, 1960)`),
    ).rejects.toThrow(/check constraint/);
    // удалили клуб — удалились и его названия
    await names.exec('delete from match where opponent_id = 2; delete from team where id = 2');
    const { rows } = await names.query(`select count(*)::int n from team_name where team_id = 2`);
    expect(rows).toEqual([{ n: 0 }]);
  });
});
