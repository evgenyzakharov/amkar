import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

// Минимум того, что Supabase создаёт сам: роли API, схема auth и auth.uid() из JWT
const SUPABASE_BASE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

// «Automatically expose new tables» включено: ролям API все права на новые объекты, защищает только RLS
const SUPABASE_EXPOSED = `${SUPABASE_BASE}
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

// «Automatically expose new tables» выключено, худший случай: права никто не выдаёт, даже на вызов функций.
// Отзыв глобальный: «in schema public» не отменил бы общего права PUBLIC на функции.
const SUPABASE_STRICT = `${SUPABASE_BASE}
  alter default privileges revoke execute on functions from public;
`;

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const STRANGER = '00000000-0000-0000-0000-00000000000b';

let db: PGlite;

async function migratedDb(stub: string) {
  const conn = new PGlite();
  await conn.exec(stub);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await conn.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  await conn.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${STRANGER}', 'x@example.com');
    insert into admins (user_id) values ('${ADMIN}');
  `);
  return conn;
}

/** Выполняет запрос так, как его выполнил бы клиент Supabase с анонимным ключом или от имени пользователя. */
async function asUser(userId: string | null, sql: string, conn = db) {
  await conn.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await conn.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  try {
    return await conn.query(sql);
  } finally {
    await conn.exec('reset role');
  }
}

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
