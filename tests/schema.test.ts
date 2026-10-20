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

describe('голы за сезон по матчам (season.goals_from_matches)', () => {
  let gm: PGlite;
  beforeAll(async () => {
    gm = await migratedDb(SUPABASE_STRICT);
    await gm.exec(`
      insert into season (id, label, start_year, end_year) values (1, '2026/27', 2026, 2027);
      insert into player (id, display_name, last_name, position) values
        (1, 'Усов', 'Усов', 'FW'), (2, 'Игнатенко', 'Игнатенко', 'MF'), (3, 'Долженко', 'Долженко', null), (4, 'Запасной вратарь', 'Вратарь', 'GK');
      insert into squad_member (season_id, player_id, position) values (1, 1, null), (1, 2, null), (1, 3, 'GK'), (1, 4, null);
      insert into player_season_totals (season_id, player_id, competition_id, goals, assists, goals_conceded) values
        (1, 1, 1, 10, 1, null), (1, 3, 1, null, null, 7);
      insert into match (id, season_id, competition_id, seq, opponent_raw) values
        (1, 1, 1, 1, 'Иртыш'), (2, 1, (select id from competition where kind = 'friendly'), 2, 'Звезда');
      insert into appearance (match_id, player_id, role, minutes, minute_on, minute_off, replaced_player_id) values
        (1, 1, 'start', 90, null, null, null), (1, 2, 'start', 90, null, null, null),
        (1, 3, 'start', 60, null, 60, null), (1, 4, 'sub', 30, 61, null, 3),
        (2, 1, 'start', 90, null, null, null);
      insert into goal (match_id, side, minute, added_time, kind, scorer_id, scorer_name, assist_id) values
        (1, 'amkar', 5, null, 'open_play', 1, null, 2),
        (1, 'amkar', 90, 1, 'penalty', 1, null, null),
        (1, 'amkar', 50, null, 'own_goal', null, 'Защитник Иртыша', null),
        (1, 'opponent', 30, null, 'open_play', null, 'Петров', null),
        (1, 'opponent', 70, null, 'own_goal', 2, null, null),
        (1, 'opponent', null, null, 'open_play', null, 'Сидоров', null),
        (2, 'amkar', 10, null, 'open_play', 1, null, 2);
    `);
  }, 60_000);

  const stats = async () =>
    (await asUserIn(gm, null, 'select player_id, goals, assists, goals_conceded, goals_source from player_season_stats order by player_id')).rows;

  it('переключатель выключен — итоги из таблицы автора, как раньше', async () => {
    expect(await stats()).toEqual([
      { player_id: 1, goals: 10, assists: 1, goals_conceded: null, goals_source: 'excel' },
      { player_id: 2, goals: null, assists: null, goals_conceded: null, goals_source: 'excel' },
      { player_id: 3, goals: null, assists: null, goals_conceded: 7, goals_source: 'excel' },
      { player_id: 4, goals: null, assists: null, goals_conceded: null, goals_source: 'excel' },
    ]);
  });

  it('включён — по матчам: без автоголов и товарищеских, пропущенные у вратаря — пока был на поле', async () => {
    await gm.exec('update season set goals_from_matches = true where id = 1');
    expect(await stats()).toEqual([
      { player_id: 1, goals: 2, assists: 0, goals_conceded: null, goals_source: 'matches' },
      // автогол в наши ворота автору не засчитан, передача — засчитана
      { player_id: 2, goals: 0, assists: 1, goals_conceded: null, goals_source: 'matches' },
      // гол на 30-й и гол без минуты — на начавшего матч; гол на 70-й — уже на вышедшего на замену
      { player_id: 3, goals: 0, assists: 0, goals_conceded: 2, goals_source: 'matches' },
      { player_id: 4, goals: 0, assists: 0, goals_conceded: 1, goals_source: 'matches' },
    ]);
  });
});

describe('итоги за карьеру (player_career_stats)', () => {
  let cs: PGlite;
  beforeAll(async () => {
    cs = await migratedDb(SUPABASE_EXPOSED);
    await cs.exec(`
      -- 2011/12 — голы из таблицы автора, 2012/13 — по матчам
      insert into season (id, label, start_year, end_year, goals_from_matches) values
        (1, '2011/12', 2011, 2012, false), (2, '2012/13', 2012, 2013, true);
      insert into player (id, display_name, last_name) values (1, 'Пеев', 'Пеев'), (2, 'Кушев', 'Кушев'), (3, 'Новичок', 'Новичок');
      insert into squad_member (season_id, player_id) values (1, 1), (1, 2), (1, 3), (2, 1), (2, 2);
      insert into match (id, season_id, competition_id, seq, opponent_raw) values
        (1, 1, (select id from competition where kind = 'league'), 1, 'Зенит'),
        (2, 1, (select id from competition where kind = 'cup'), 2, 'Енисей'),
        (3, 1, (select id from competition where kind = 'friendly'), 3, 'Звезда'),
        (4, 1, (select id from competition where kind = 'playoff'), 4, 'Луч'),
        (5, 2, (select id from competition where kind = 'league'), 1, 'Рубин'),
        (6, 2, (select id from competition where kind = 'cup'), 2, 'Урал');
      insert into appearance (match_id, player_id, role, minutes, minute_on) values
        (1, 1, 'start', 90, null), (2, 1, 'start', 90, null), (3, 1, 'start', 90, null), (4, 1, 'sub', 20, 71),
        (1, 2, 'bench', 0, null), (2, 2, null, 45, null),
        (5, 1, 'start', 90, null), (6, 1, 'start', 90, null), (5, 2, 'sub', 10, 81);
      insert into player_season_totals (season_id, player_id, competition_id, goals, assists, goals_conceded) values
        (1, 1, (select id from competition where kind = 'league'), 5, null, null),
        (1, 1, (select id from competition where kind = 'cup'), 2, null, null),
        (1, 2, (select id from competition where kind = 'league'), null, null, null),
        (1, 2, (select id from competition where kind = 'cup'), 1, null, null),
        -- сезон по матчам: итоги из таблицы автора не считаются
        (2, 1, (select id from competition where kind = 'league'), 99, null, null);
      insert into goal (match_id, side, minute, kind, scorer_id, scorer_name) values
        (5, 'amkar', 10, 'open_play', 1, null), (5, 'amkar', 80, 'penalty', 1, null),
        (5, 'amkar', 85, 'own_goal', null, 'Защитник Рубина'),
        (6, 'amkar', 30, 'open_play', 2, null),
        (6, 'opponent', 40, 'own_goal', 1, null);
    `);
  }, 60_000);

  it('игры и голы во всех турнирах и в чемпионате, без товарищеских, годы в клубе', async () => {
    const { rows } = await asUserIn(
      cs,
      null,
      `select player_id, seasons, first_season, last_season, first_year, last_year, games, games_league, goals, goals_league
       from player_career_stats order by player_id`,
    );
    expect(rows).toEqual([
      // 2011/12: чемпионат, кубок и стыки (товарищеский не в счёт); голы 5 + 2 из таблицы автора.
      // 2012/13: голы по матчам — два своих, автогол соперника и автогол в свои ворота не в счёт
      { player_id: 1, seasons: 2, first_season: '2011/12', last_season: '2012/13', first_year: 2011, last_year: 2013, games: 5, games_league: 2, goals: 9, goals_league: 7 },
      // в чемпионате 2011/12 голы неизвестны, в 2012/13 — ноль по матчам
      { player_id: 2, seasons: 2, first_season: '2011/12', last_season: '2012/13', first_year: 2011, last_year: 2013, games: 2, games_league: 1, goals: 2, goals_league: 0 },
      { player_id: 3, seasons: 1, first_season: '2011/12', last_season: '2011/12', first_year: 2011, last_year: 2012, games: 0, games_league: 0, goals: null, goals_league: null },
    ]);
  });

  it('итог за карьеру — сумма сезонов из player_season_stats, голы не задваиваются', async () => {
    const { rows } = await cs.query(`
      select c.player_id from player_career_stats c
      join (select player_id, sum(games)::int games, sum(goals)::int goals from player_season_stats group by player_id) s
        on s.player_id = c.player_id
      where c.games <> s.games or c.goals is distinct from s.goals`);
    expect(rows).toEqual([]);
  });

  it('ролям API — только чтение, RLS таблиц действует и через view', async () => {
    const privileges = await cs.query(`
      select r.role, string_agg(p.privilege, ',' order by p.privilege) granted
      from unnest(array['anon', 'authenticated']) r(role)
      cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(privilege)
      where has_table_privilege(r.role, 'player_career_stats', p.privilege)
      group by r.role order by r.role`);
    expect(privileges.rows).toEqual([
      { role: 'anon', granted: 'select' },
      { role: 'authenticated', granted: 'select' },
    ]);
    await cs.exec(`begin; create policy "скрыть" on squad_member as restrictive for select to anon using (season_id <> 1)`);
    try {
      const { rows } = await asUserIn(cs, null, `select player_id, seasons from player_career_stats order by player_id`);
      expect(rows).toEqual([
        { player_id: 1, seasons: 1 },
        { player_id: 2, seasons: 1 },
      ]);
    } finally {
      await cs.exec('rollback');
    }
  });
});

describe('дашборды: season_summary, team_streaks, player_milestones', () => {
  let dash: PGlite;
  beforeAll(async () => {
    dash = await migratedDb(SUPABASE_EXPOSED);
    await dash.exec(`
      insert into season (id, label, start_year, end_year, goals_from_matches) values
        (1, '2016/17', 2016, 2017, false), (2, '2017/18', 2017, 2018, false),
        (3, '2021/22', 2021, 2022, false), (4, '2026/27', 2026, 2027, true);
      insert into player (id, display_name, last_name, academy) values (1, 'Воспитанник', 'Воспитанник', true), (2, 'Приезжий', 'Приезжий', false);
      insert into squad_member (season_id, player_id) values (1, 1), (1, 2), (4, 1);
      -- 2016/17: чемпионат В В ? В Н В, кубок В, товарищеский В
      insert into match (id, season_id, competition_id, seq, opponent_raw, result, awarded) values
        (1, 1, 1, 1, 'А', 'W', false), (2, 1, 1, 2, 'Б', 'W', false), (3, 1, 1, 3, 'В', null, false),
        (4, 1, 1, 4, 'Г', 'W', false), (5, 1, 1, 5, 'Д', 'D', false), (6, 1, 1, 6, 'Е', 'W', false),
        (7, 1, (select id from competition where kind = 'cup'), 7, 'Ж', 'W', false),
        (8, 1, (select id from competition where kind = 'friendly'), 8, 'З', 'W', false),
        -- 2017/18: техническая победа и ещё две
        (9, 2, 1, 1, 'И', 'W', true), (10, 2, 1, 2, 'К', 'W', false), (11, 2, 1, 3, 'Л', 'W', false),
        -- 2021/22: новый клуб — победа сразу после перерыва серию не продолжает
        (12, 3, 1, 1, 'М', 'W', false), (13, 3, 1, 2, 'Н', 'L', false);
      insert into match (id, season_id, competition_id, seq, opponent_raw, result)
        select 100 + g, 4, 1, g, 'Соперник ' || g, 'D' from generate_series(1, 110) g;
      insert into appearance (match_id, player_id, role, minutes) values
        (1, 1, 'start', 90), (7, 1, 'start', 90), (8, 1, 'start', 90), (1, 2, 'start', 90);
      insert into appearance (match_id, player_id, role, minutes) select 100 + g, 1, 'start', 90 from generate_series(1, 110) g;
      insert into player_season_totals (season_id, player_id, competition_id, goals) values
        (1, 1, 1, 40), (1, 1, (select id from competition where kind = 'cup'), 5), (1, 2, 1, 60);
      insert into goal (match_id, side, minute, kind, scorer_id) select 100 + g, 'amkar', 10, 'open_play', 1 from generate_series(1, 6) g;
    `);
  }, 60_000);

  it('season_summary: очки в чемпионате с техническими победами, без товарищеских, минуты воспитанников', async () => {
    const { rows } = await asUserIn(
      dash,
      null,
      `select label, league_played, league_wins, league_draws, league_losses, league_unknown, league_points,
              played, wins, minutes, academy_minutes from season_summary order by season_id`,
    );
    expect(rows.slice(0, 2)).toEqual([
      { label: '2016/17', league_played: 5, league_wins: 4, league_draws: 1, league_losses: 0, league_unknown: 1, league_points: 13, played: 6, wins: 5, minutes: 270, academy_minutes: 180 },
      { label: '2017/18', league_played: 3, league_wins: 3, league_draws: 0, league_losses: 0, league_unknown: 0, league_points: 9, played: 3, wins: 3, minutes: 0, academy_minutes: 0 },
    ]);
  });

  const streaks = async (where: string) =>
    (
      await asUserIn(
        dash,
        null,
        `select length, first_season_label || ' №' || first_seq as from_, last_season_label || ' №' || last_seq as to_
         from team_streaks where ${where} order by length desc, first_match_id`,
      )
    ).rows;

  it('team_streaks: серия идёт через сезоны, рвётся на неизвестном результате и на перерыве 2018–2021', async () => {
    expect(await streaks(`span = 'history' and scope = 'league' and kind = 'win'`)).toEqual([
      { length: 4, from_: '2016/17 №6', to_: '2017/18 №3' },
      { length: 2, from_: '2016/17 №1', to_: '2016/17 №2' },
      { length: 1, from_: '2016/17 №4', to_: '2016/17 №4' },
      { length: 1, from_: '2021/22 №1', to_: '2021/22 №1' },
    ]);
    // во всех турнирах кубковая победа продлевает серию, товарищеский матч не в счёт
    expect((await streaks(`span = 'history' and scope = 'all' and kind = 'win'`))[0]).toEqual({ length: 5, from_: '2016/17 №6', to_: '2017/18 №3' });
    expect((await streaks(`span = 'history' and scope = 'league' and kind = 'winless'`))[0]).toEqual({ length: 111, from_: '2021/22 №2', to_: '2026/27 №110' });
  });

  it('team_streaks: лучшая серия каждого сезона — в пределах сезона', async () => {
    expect(await streaks(`span = 'season' and scope = 'league' and kind = 'win'`)).toEqual([
      { length: 3, from_: '2017/18 №1', to_: '2017/18 №3' },
      { length: 2, from_: '2016/17 №1', to_: '2016/17 №2' },
      { length: 1, from_: '2021/22 №1', to_: '2021/22 №1' },
    ]);
  });

  it('player_milestones: сотый матч — с учётом прошлых сезонов и без товарищеских; голы — матч или только сезон', async () => {
    const { rows } = await asUserIn(
      dash,
      null,
      `select player_id, stat, milestone, precision, season_label, seq, opponent from player_milestones order by player_id, stat, milestone`,
    );
    expect(rows).toEqual([
      // два официальных матча в 2016/17, сотый — 98-й в 2026/27
      { player_id: 1, stat: 'games', milestone: 100, precision: 'match', season_label: '2026/27', seq: 98, opponent: 'Соперник 98' },
      // 45 голов итогом 2016/17, пятидесятый — пятый гол по матчам 2026/27
      { player_id: 1, stat: 'goals', milestone: 50, precision: 'match', season_label: '2026/27', seq: 5, opponent: 'Соперник 5' },
      { player_id: 2, stat: 'goals', milestone: 50, precision: 'season', season_label: '2016/17', seq: null, opponent: null },
    ]);
  });

  it('ролям API — только чтение', async () => {
    const { rows } = await dash.query(`
      select v.name, string_agg(p.privilege, ',' order by p.privilege) granted
      from unnest(array['season_summary', 'team_streaks', 'player_milestones']) v(name)
      cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p(privilege)
      where has_table_privilege('anon', v.name, p.privilege)
      group by v.name order by v.name`);
    expect(rows).toEqual([
      { name: 'player_milestones', granted: 'select' },
      { name: 'season_summary', granted: 'select' },
      { name: 'team_streaks', granted: 'select' },
    ]);
  });
});

describe('фото игрока по ссылке (player.photo_url)', () => {
  let ph: PGlite;
  beforeAll(async () => {
    ph = await migratedDb(SUPABASE_STRICT);
    await ph.exec(`insert into player (id, display_name, last_name) values (1, 'Галлямов', 'Галлямов')`);
  }, 60_000);

  it('только https://, меняет админ, читают все', async () => {
    await asUserIn(ph, ADMIN, `update player set photo_url = 'https://img.example.com/1.jpg' where id = 1`);
    await expect(asUserIn(ph, ADMIN, `update player set photo_url = 'http://img.example.com/1.jpg' where id = 1`)).rejects.toThrow(
      /player_photo_url_check/,
    );
    const { rows } = await asUserIn(ph, STRANGER, `update player set photo_url = null where id = 1 returning id`);
    expect(rows).toEqual([]);
    expect((await asUserIn(ph, null, 'select photo_url from player where id = 1')).rows).toEqual([{ photo_url: 'https://img.example.com/1.jpg' }]);
  });
});

describe('видео матча (match_video)', () => {
  let mv: PGlite;
  beforeAll(async () => {
    mv = await migratedDb(SUPABASE_STRICT);
    await mv.exec(`
      insert into season (id, label, start_year, end_year) values (1, '2026/27', 2026, 2027);
      insert into match (id, season_id, competition_id, seq, opponent_raw) values (1, 1, 1, 1, 'Иртыш');
    `);
  }, 60_000);

  const add = (url: string, kind = 'highlights') =>
    asUserIn(mv, ADMIN, `insert into match_video (match_id, kind, url) values (1, '${kind}', '${url}') returning site`);

  it('сайт — по адресу: YouTube и ВК, другие не принимаем', async () => {
    expect((await add('https://www.youtube.com/watch?v=abc', 'full')).rows).toEqual([{ site: 'youtube' }]);
    expect((await add('https://youtu.be/abc')).rows).toEqual([{ site: 'youtube' }]);
    expect((await add('https://vk.com/video-123_456')).rows).toEqual([{ site: 'vk' }]);
    expect((await add('https://vkvideo.ru/video-123_789')).rows).toEqual([{ site: 'vk' }]);
    await expect(add('https://rutube.ru/video/1/')).rejects.toThrow(/match_video_youtube_or_vk/);
    await expect(add('https://notyoutube.com/x')).rejects.toThrow(/match_video_youtube_or_vk/);
    await expect(add('http://youtu.be/abc')).rejects.toThrow(/match_video_url_check/);
    await expect(add('https://youtu.be/abc')).rejects.toThrow(/match_video_match_id_url_key/);
  });

  it('читают все, пишет админ; удалили матч — удалились и видео', async () => {
    await expect(
      asUserIn(mv, STRANGER, `insert into match_video (match_id, kind, url) values (1, 'full', 'https://youtu.be/x')`),
    ).rejects.toThrow(/row-level security/);
    const { rows } = await asUserIn(mv, null, 'select count(*)::int n from match_video');
    expect(rows).toEqual([{ n: 4 }]);
    await mv.exec('delete from match where id = 1');
    expect((await mv.query('select count(*)::int n from match_video')).rows).toEqual([{ n: 0 }]);
  });
});

describe('схема сборной сезона (season.best_xi_formation)', () => {
  it('схема — цифры через дефис, места — из общего набора, пишет админ, читают все', async () => {
    await asUser(ADMIN, `update season set best_xi_formation = '4-1-2-1-2' where id = 1`);
    await expect(asUser(ADMIN, `update season set best_xi_formation = 'ромб' where id = 1`)).rejects.toThrow(
      /season_best_xi_formation_check/,
    );
    await expect(asUser(ADMIN, `update season set best_xi_formation = '4-4' where id = 1`)).rejects.toThrow(
      /season_best_xi_formation_check/,
    );
    const { rows } = await asUser(STRANGER, `update season set best_xi_formation = null where id = 1 returning id`);
    expect(rows).toEqual([]);
    expect((await asUser(null, 'select best_xi_formation from season where id = 1')).rows).toEqual([{ best_xi_formation: '4-1-2-1-2' }]);

    await asUser(ADMIN, `insert into season_best_xi (season_id, slot, player_id) values (1, 'DM1', 1), (1, 'AM', 2), (1, 'LWB', 3)`);
    await expect(asUser(ADMIN, `insert into season_best_xi (season_id, slot, player_id) values (1, 'SW', 1)`)).rejects.toThrow(
      /season_best_xi_slot_check/,
    );
  });
});

describe('тренеры: сроки (coach_tenure), дебюты (player_debut), игроки при тренере (coach_player_stats)', () => {
  let tc: PGlite;
  beforeAll(async () => {
    tc = await migratedDb(SUPABASE_STRICT);
    await tc.exec(`
      insert into season (id, label, start_year, end_year) values (1, '1996', 1996, 1996), (2, '1997', 1997, 1997);
      insert into coach (id, full_name, short_name) values (1, 'Сергей Оборин', 'Оборин'), (2, 'Рашид Рахимов', 'Рахимов');
      insert into player (id, display_name, last_name, academy) values
        (1, 'Пеев', 'Пеев', false), (2, 'Зырянов', 'Зырянов', true), (3, 'Запасной', 'Запасной', false);
      insert into match (id, season_id, competition_id, seq, opponent_raw, coach_id, match_date) values
        (1, 1, (select id from competition where kind = 'friendly'), 1, 'Звезда', 1, '1996-03-01'),
        (2, 1, (select id from competition where kind = 'league'), 2, 'Уралмаш', 1, '1996-04-10'),
        (3, 1, (select id from competition where kind = 'cup'), 3, 'Газовик', 1, '1996-05-02'),
        (4, 2, (select id from competition where kind = 'league'), 1, 'Звезда', 2, '1997-04-12');
      insert into appearance (match_id, player_id, role, minutes) values
        (1, 2, 'start', 90),
        (2, 1, 'start', 90), (2, 3, 'bench', 0),
        (3, 1, 'start', 90), (3, 2, 'sub', 20),
        (4, 1, 'start', 90), (4, 3, 'start', 45);
      insert into goal (match_id, side, kind, minute, scorer_id) values
        (1, 'amkar', 'open_play', 10, 2),
        (2, 'amkar', 'penalty', 30, 1),
        (3, 'amkar', 'own_goal', 50, null),
        (4, 'amkar', 'open_play', 70, 1);
    `);
  }, 60_000);

  it('дебют — первый официальный матч, без товарищеских и запаса', async () => {
    const { rows } = await asUserIn(tc, null, 'select player_id, match_id, coach_id, season_label, academy from player_debut order by player_id');
    expect(rows).toEqual([
      { player_id: 1, match_id: 2, coach_id: 1, season_label: '1996', academy: false },
      // товарищеский матч 1 — не дебют, дебют Зырянова — в кубке
      { player_id: 2, match_id: 3, coach_id: 1, season_label: '1996', academy: true },
      // в матче 2 сидел в запасе — дебют позже, при другом тренере
      { player_id: 3, match_id: 4, coach_id: 2, season_label: '1997', academy: false },
    ]);
  });

  it('игроки при тренере: матчи, минуты, голы — без товарищеских и автоголов', async () => {
    const { rows } = await asUserIn(tc, null, 'select coach_id, player_id, games, minutes, goals from coach_player_stats order by coach_id, player_id');
    expect(rows).toEqual([
      { coach_id: 1, player_id: 1, games: 2, minutes: 180, goals: 1 },
      { coach_id: 1, player_id: 2, games: 1, minutes: 20, goals: 0 },
      { coach_id: 2, player_id: 1, games: 1, minutes: 90, goals: 1 },
      { coach_id: 2, player_id: 3, games: 1, minutes: 45, goals: 0 },
    ]);
  });

  it('сроки: увольнение не раньше назначения, пишет админ, читают все; view — только чтение', async () => {
    await asUserIn(tc, ADMIN, `insert into coach_tenure (coach_id, from_date, to_date) values (1, '1995-01-01', '2006-08-26'), (2, '2006-09-07', null)`);
    await expect(asUserIn(tc, ADMIN, `insert into coach_tenure (coach_id, from_date, to_date) values (2, '2009-09-02', '2009-01-01')`)).rejects.toThrow(
      /coach_tenure_check/,
    );
    await expect(asUserIn(tc, STRANGER, `insert into coach_tenure (coach_id, from_date) values (1, '2010-01-01')`)).rejects.toThrow(
      /row-level security/,
    );
    expect((await asUserIn(tc, null, 'select count(*)::int n from coach_tenure')).rows).toEqual([{ n: 2 }]);
    const { rows } = await tc.query<{ v: string; w: boolean }>(`
      select v, has_table_privilege('anon', v, 'insert') or has_table_privilege('authenticated', v, 'insert') w
      from unnest(array['player_debut', 'coach_player_stats']) v`);
    expect(rows.every((r) => !r.w)).toBe(true);
    // удалили тренера без матчей — удалились и его сроки
    await tc.exec(`insert into coach (id, full_name, short_name) values (3, 'Трубачёв', 'Трубачёв');
      insert into coach_tenure (coach_id, from_date) values (3, '2012-07-19');
      delete from coach where id = 3;`);
    expect((await tc.query('select count(*)::int n from coach_tenure')).rows).toEqual([{ n: 2 }]);
  });
});

describe('дашборды: голы по минутам, возраст, первый гол, соперник дебюта', () => {
  let dd: PGlite;
  beforeAll(async () => {
    dd = await migratedDb(SUPABASE_STRICT);
    await dd.exec(`
      insert into season (id, label, start_year, end_year) values (1, '2008', 2008, 2008);
      insert into team (id, name) values (1, 'Химки'), (2, 'ЦСКА');
      insert into player (id, display_name, last_name, academy, birth_date) values
        (1, 'Кушев', 'Кушев', false, '1980-04-11'), (2, 'Зырянов', 'Зырянов', true, '1990-01-01'), (3, 'Без даты', 'Без даты', false, null);
      insert into match (id, season_id, competition_id, seq, opponent_id, match_date) values
        (1, 1, (select id from competition where kind = 'friendly'), 1, 2, '2008-02-01'),
        (2, 1, (select id from competition where kind = 'league'), 2, 1, '2008-03-15'),
        (3, 1, (select id from competition where kind = 'cup'), 3, 2, '2008-05-17');
      insert into appearance (match_id, player_id, role, minutes) values
        (1, 2, 'start', 90),
        (2, 1, 'start', 90), (2, 2, 'sub', 30), (2, 3, 'start', 60),
        (3, 1, 'start', 90), (3, 2, 'bench', 0);
      insert into goal (match_id, side, kind, minute, added_time, scorer_id, scorer_name) values
        (1, 'amkar', 'open_play', 10, null, 2, null),
        (2, 'amkar', 'open_play', 45, 2, 1, null),
        (2, 'opponent', 'penalty', 90, 3, null, 'Гонсалес'),
        (3, 'amkar', 'open_play', 12, null, 2, null),
        (3, 'amkar', 'open_play', 12, null, 1, null),
        (3, 'opponent', 'open_play', null, null, null, 'Вагнер');
    `);
  }, 60_000);

  it('голы по минутам: без товарищеских и без голов без минуты; добавленное время — отдельно', async () => {
    const { rows } = await asUserIn(dd, null, 'select side, minute, added, competition_kind, goals from goal_minutes order by side, minute, competition_kind');
    expect(rows).toEqual([
      { side: 'amkar', minute: 12, added: false, competition_kind: 'cup', goals: 2 },
      { side: 'amkar', minute: 45, added: true, competition_kind: 'league', goals: 1 },
      { side: 'opponent', minute: 90, added: true, competition_kind: 'league', goals: 1 },
    ]);
  });

  it('возраст в сезоне: по матчам, без запаса и товарищеских; без даты рождения — пусто', async () => {
    const { rows } = await asUserIn(
      dd,
      null,
      'select player_id, games, minutes, age_first::float8 af, age_last::float8 al, age_minutes::float8 am from player_season_age order by player_id',
    );
    expect(rows).toEqual([
      // 15.03.2008 − 11.04.1980 = 10 200 дней ≈ 27,93 года; 17.05.2008 — 10 263 дня ≈ 28,10
      { player_id: 1, games: 2, minutes: 180, af: 27.93, al: 28.1, am: 5042.22 },
      { player_id: 2, games: 1, minutes: 30, af: 18.2, al: 18.2, am: 546.04 },
      { player_id: 3, games: 1, minutes: 60, af: null, al: null, am: null },
    ]);
  });

  it('первый гол и дебют: официальные матчи, с соперником', async () => {
    const goals = await asUserIn(dd, null, 'select player_id, match_id, opponent, minute from player_first_goal order by player_id');
    expect(goals.rows).toEqual([
      { player_id: 1, match_id: 2, opponent: 'Химки', minute: 45 },
      // гол в товарищеском матче 1 не первый — первый в кубке
      { player_id: 2, match_id: 3, opponent: 'ЦСКА', minute: 12 },
    ]);
    const debut = await asUserIn(dd, null, 'select player_id, match_id, opponent, birth_date::text from player_debut order by player_id');
    expect(debut.rows).toEqual([
      { player_id: 1, match_id: 2, opponent: 'Химки', birth_date: '1980-04-11' },
      { player_id: 2, match_id: 2, opponent: 'Химки', birth_date: '1990-01-01' },
      { player_id: 3, match_id: 2, opponent: 'Химки', birth_date: null },
    ]);
  });
});

describe('очки сезона: настройки (points_settings), ожидания, ручные поправки, player_season_points', () => {
  let pt: PGlite;
  const q = (sql: string) => asUserIn(pt, null, sql);
  /** Строка view: игрок в сезоне. */
  const row = async (seasonId: number, playerId: number) =>
    (await q(`select * from player_season_points where season_id = ${seasonId} and player_id = ${playerId}`)).rows[0];
  const settings = (set: string) => pt.exec(`update points_settings set ${set}`);

  beforeAll(async () => {
    pt = await migratedDb(SUPABASE_STRICT);
    await pt.exec(`
      insert into season (id, label, start_year, end_year, tier, final_place, teams_count, expected_place, goals_from_matches) values
        (1, '2008', 2008, 2008, 1, 1, 11, 6, true),
        (2, '2009', 2009, 2009, 2, 1, 11, null, true);
      insert into player (id, display_name, last_name, position) values
        (1, 'Вратарь', 'Вратарь', 'GK'), (2, 'Защитник', 'Защитник', 'DF'), (3, 'Нападающий', 'Нападающий', 'FW'), (4, 'Запасной', 'Запасной', null);
      insert into squad_member (season_id, player_id) values (1, 1), (1, 2), (1, 3), (1, 4), (2, 3);
      insert into match (id, season_id, competition_id, seq, opponent_raw, result, goals_for, goals_against) values
        (1, 1, (select id from competition where kind = 'league'), 1, 'Химки', 'W', 1, 0),
        (2, 1, (select id from competition where kind = 'cup'), 2, 'Газовик', 'D', 0, 0),
        (3, 1, (select id from competition where kind = 'friendly'), 3, 'Звезда', 'W', 5, 0),
        (4, 2, (select id from competition where kind = 'league'), 1, 'Химки', 'L', 0, 2);
      insert into appearance (match_id, player_id, role, minutes, minute_on) values
        (1, 1, 'start', 90, null), (1, 2, 'start', 90, null), (1, 3, 'sub', 30, 61),
        (2, 1, 'start', 90, null), (2, 2, 'start', 45, null),
        (3, 3, 'start', 90, null),
        (4, 3, 'start', 90, null);
      insert into goal (match_id, side, kind, minute, scorer_id, assist_id) values (1, 'amkar', 'open_play', 10, 2, 1);
    `);
  }, 60_000);

  it('настройки по умолчанию — версия 1 формулы, одна строка', async () => {
    const { rows } = await q(
      'select per_90, per_start, goal_mf, per_draw, absolute_share, tier_rate_1, tier_rate_5, place_last, place_first, expect_range, peak_seasons from points_settings',
    );
    expect(rows).toEqual([
      { per_90: '1.00', per_start: '0.20', goal_mf: '4.00', per_draw: '0.33', absolute_share: '0.700', tier_rate_1: '1.000',
        tier_rate_5: '0.800', place_last: '1.000', place_first: '1.000', expect_range: '0.250', peak_seasons: 3 },
    ]);
    await expect(pt.exec('insert into points_settings (id) values (2)')).rejects.toThrow(/points_settings_single_row/);
  });

  it('составляющие: все официальные матчи, «сухие» и результат — когда сыграл 45+, позиция — основная', async () => {
    const pick = ({ position, minutes, starts, goals, assists, clean_sheets, wins, draws }: Record<string, unknown>) => ({
      position, minutes, starts, goals, assists, clean_sheets, wins, draws,
    });
    expect(pick(await row(1, 1))).toEqual({ position: 'GK', minutes: 180, starts: 2, goals: 0, assists: 1, clean_sheets: 2, wins: 1, draws: 1 });
    expect(pick(await row(1, 2))).toEqual({ position: 'DF', minutes: 135, starts: 2, goals: 1, assists: 0, clean_sheets: 2, wins: 1, draws: 1 });
    // товарищеский не в счёт, 30 минут — без «сухого» и результата
    expect(pick(await row(1, 3))).toEqual({ position: 'FW', minutes: 30, starts: 0, goals: 0, assists: 0, clean_sheets: 0, wins: 0, draws: 0 });
    // без позиции — полузащитник
    expect(pick(await row(1, 4))).toEqual({ position: 'MF', minutes: 0, starts: 0, goals: 0, assists: 0, clean_sheets: 0, wins: 0, draws: 0 });
  });

  it('сырые очки по весам версии 1', async () => {
    // вратарь: 2 матча + 2 старта × 0,2 + передача 2 + 2 «сухих» × 2 + победа 1 + ничья 0,33
    expect((await row(1, 1)).raw_points).toBeCloseTo(2 + 0.4 + 2 + 4 + 1 + 0.33);
    // защитник: 1,5 матча + 0,4 + гол защитника 5 + 2 «сухих» × 1 + 1 + 0,33
    expect((await row(1, 2)).raw_points).toBeCloseTo(1.5 + 0.4 + 5 + 2 + 1 + 0.33);
  });

  it('«лучший в сезоне = 100», ручная поправка прибавляется к итогу', async () => {
    await settings('absolute_share = 0, expect_range = 0');
    expect((await row(1, 2)).points).toBeCloseTo(100);
    expect((await row(1, 1)).points).toBeCloseTo((9.73 / 10.23) * 100);
    expect((await row(1, 4)).points).toBe(0);
    expect((await row(1, 2)).season_rank).toBe(1);
    await asUserIn(pt, ADMIN, `insert into player_season_adjustment (season_id, player_id, points, comment) values (1, 1, 5, 'вытащил матч с Химками')`);
    const keeper = await row(1, 1);
    expect(keeper.points).toBeCloseTo((9.73 / 10.23) * 100 + 5);
    expect([keeper.adjustment, keeper.adjustment_comment, keeper.season_rank]).toEqual([5, 'вытащил матч с Химками', 1]);
    await pt.exec('delete from player_season_adjustment');
  });

  it('абсолютные очки: курс уровня лиги, средний лидер = 100; множитель — место и ожидания', async () => {
    await settings('absolute_share = 1, expect_range = 0, short_season_power = 0, long_season_full = false, tier_rate_2 = 0.5');
    // лидеры сезонов: 10,23 (уровень 1) и нападающий во втором — 1 + 0,2 = 1,2 (уровень 2, курс 0,5); средний — (10,23 + 0,6) / 2
    const leader = (10.23 + 0.6) / 2;
    expect((await row(1, 2)).points).toBeCloseTo((10.23 / leader) * 100);
    expect((await row(2, 3)).points).toBeCloseTo(((1.2 * 0.5) / leader) * 100);
    // первое место из 11 — ×1,2; ждали 6-е — 1 + 0,25 × 5 / 10
    await settings('place_last = 0.8, place_first = 1.2, expect_range = 0.25');
    const def = await row(1, 2);
    expect(def.team_factor).toBeCloseTo(1.2 * 1.125);
    expect(def.points).toBeCloseTo((10.23 / leader) * 100 * 1.35);
    // ожидание не задано — только место
    expect((await row(2, 3)).team_factor).toBeCloseTo(1.2);
  });

  it('карьера: сумма сезонов + лучшие сезоны ещё раз', async () => {
    await settings('peak_seasons = 1, peak_weight = 2');
    const seasons = (await q('select points from player_season_points where player_id = 3 order by points desc')).rows.map((r) => r.points as number);
    const { rows } = await q('select seasons, first_year, last_year, total, peak, value from player_career_points where player_id = 3');
    expect(rows[0]).toMatchObject({ seasons: 2, first_year: 2008, last_year: 2009 });
    expect(rows[0].total).toBeCloseTo(seasons[0] + seasons[1], 1);
    expect(rows[0].peak).toBeCloseTo(seasons[0], 1);
    expect(rows[0].value).toBeCloseTo(seasons[0] + seasons[1] + 2 * seasons[0], 1);
  });

  it('ярус пирамиды — по порогам ценности; первый и последний сезон — подписью', async () => {
    await settings('tier_1_from = 1000, tier_2_from = 650, tier_3_from = 500, tier_4_from = 350, tier_5_from = 250');
    const value = (await q('select value from player_career_points where player_id = 3')).rows[0].value as number;
    // порог «Свои» — ровно ценность нападающего: ярус 5; чуть выше — вне пирамиды
    await settings(`tier_5_from = ${value}, tier_4_from = ${value + 1}`);
    expect((await q('select first_season, last_season, tier from player_career_points where player_id = 3')).rows).toEqual([
      { first_season: '2008', last_season: '2009', tier: 5 },
    ]);
    await settings(`tier_5_from = ${value + 0.1}, tier_4_from = ${value + 1}`);
    expect((await q('select tier from player_career_points where player_id = 3')).rows).toEqual([{ tier: null }]);
    // без игр — без сезонов в подписи
    expect((await q('select seasons, first_season, last_season from player_career_points where player_id = 4')).rows).toEqual([
      { seasons: 0, first_season: null, last_season: null },
    ]);
    // «Легенды» выше «Пантеона» — нельзя
    await expect(settings('tier_2_from = 1500')).rejects.toThrow(/points_settings_tiers/);
  });

  it('ожидаемое место: от 1, не больше числа команд, можно «2,5»', async () => {
    await pt.exec('update season set expected_place = 2.5 where id = 2');
    await expect(pt.exec('update season set expected_place = 0 where id = 2')).rejects.toThrow(/season_expected_place_check/);
    await expect(pt.exec('update season set expected_place = 12 where id = 2')).rejects.toThrow(/season_expected_place_teams/);
  });

  it('поправка: от −5 до +5 и не ноль, с комментарием, только игроку из заявки; убрать из заявки с поправкой нельзя', async () => {
    const add = (season: number, player: number, points: number, comment: string) =>
      pt.exec(`insert into player_season_adjustment (season_id, player_id, points, comment) values (${season}, ${player}, ${points}, '${comment}')`);
    await expect(add(1, 1, 6, 'много')).rejects.toThrow(/player_season_adjustment_points_check/);
    await expect(add(1, 1, 0, 'ноль')).rejects.toThrow(/player_season_adjustment_points_check/);
    await expect(add(1, 1, -5, '  ')).rejects.toThrow(/player_season_adjustment_comment_check/);
    await expect(add(2, 1, -5, 'не в заявке')).rejects.toThrow(/player_season_adjustment_season_id_player_id_fkey/);
    await add(1, 4, -5, 'неудачное приобретение');
    await expect(pt.exec('delete from squad_member where season_id = 1 and player_id = 4')).rejects.toThrow(
      /player_season_adjustment_season_id_player_id_fkey/,
    );
  });

  it('права: читают все, настройки и поправки меняет только админ, view — только чтение', async () => {
    expect((await q('select count(*)::int n from player_season_adjustment')).rows).toEqual([{ n: 1 }]);
    expect((await asUserIn(pt, STRANGER, 'update points_settings set per_90 = 2 returning id')).rows).toEqual([]);
    expect((await asUserIn(pt, ADMIN, 'update points_settings set per_90 = 1.5 returning per_90')).rows).toEqual([{ per_90: '1.50' }]);
    await expect(asUserIn(pt, ADMIN, 'update points_settings set per_90 = -1')).rejects.toThrow(/points_settings_weights/);
    await expect(asUserIn(pt, ADMIN, 'update points_settings set place_first = 0.9, place_last = 1')).rejects.toThrow(/points_settings_place/);
    await expect(asUserIn(pt, ADMIN, 'delete from points_settings')).rejects.toThrow(/permission denied/);
    await expect(
      asUserIn(pt, STRANGER, `insert into player_season_adjustment (season_id, player_id, points, comment) values (1, 2, 1, 'взлом')`),
    ).rejects.toThrow(/row-level security/);
    await asUserIn(pt, ADMIN, 'update player_season_adjustment set points = -4 where player_id = 4');
    expect((await q('select points from player_season_adjustment')).rows).toEqual([{ points: '-4.0' }]);
    const { rows } = await pt.query<{ v: string; w: boolean }>(`
      select v, has_table_privilege('anon', v, 'insert') or has_table_privilege('authenticated', v, 'insert') w
      from unnest(array['player_season_points', 'player_career_points']) v`);
    expect(rows.every((r) => !r.w)).toBe(true);
  });
});
