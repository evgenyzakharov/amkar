// База для тестов: PGlite с миграциями из supabase/migrations и тем минимумом Supabase, на который они опираются.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { DbError } from '../src/admin/dbErrors';
import type { Filter, Row, Writer } from '../src/admin/writer';

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

  -- Хранилище: таблицы, на которые опираются бакет и политики фото игроков
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`;

// «Automatically expose new tables» включено: ролям API все права на новые объекты, защищает только RLS
export const SUPABASE_EXPOSED = `${SUPABASE_BASE}
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

// «Automatically expose new tables» выключено, худший случай: права никто не выдаёт, даже на вызов функций.
// Отзыв глобальный: «in schema public» не отменил бы общего права PUBLIC на функции.
export const SUPABASE_STRICT = `${SUPABASE_BASE}
  alter default privileges revoke execute on functions from public;
`;

export const ADMIN = '00000000-0000-0000-0000-00000000000a';
export const STRANGER = '00000000-0000-0000-0000-00000000000b';

/**
 * База со всеми миграциями. `seedBefore` вставляет данные перед миграцией, имя файла которой начинается
 * с `migration`, — чтобы проверить, как миграция переносит уже существующие данные.
 */
export async function migratedDb(stub = SUPABASE_EXPOSED, seedBefore?: { migration: string; sql: string }) {
  const conn = new PGlite();
  await conn.exec(stub);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (seedBefore && file.startsWith(seedBefore.migration)) await conn.exec(seedBefore.sql);
    await conn.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  await conn.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${STRANGER}', 'x@example.com');
    insert into admins (user_id) values ('${ADMIN}');
  `);
  return conn;
}

/** Выполняет запрос так, как его выполнил бы клиент Supabase с анонимным ключом или от имени пользователя. */
export async function asUser(conn: PGlite, userId: string | null, sql: string, params: unknown[] = []) {
  await conn.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await conn.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  try {
    return await conn.query<Record<string, unknown>>(sql, params);
  } finally {
    await conn.exec('reset role');
  }
}

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`недопустимое имя: ${s}`);
  return s;
};

/**
 * Writer поверх PGlite: каждый вызов — отдельная транзакция от имени пользователя, как запрос к PostgREST.
 * Строки возвращаются через to_json — даты строками, как их отдаёт API.
 */
export function pgliteWriter(conn: PGlite, userId: string | null = ADMIN): Writer {
  const where = (match: Filter, first: number) => {
    const keys = Object.keys(match).map(ident);
    return { sql: keys.map((k, i) => `${k}::text = $${first + i}`).join(' and '), params: keys.map((k) => String(match[k])) };
  };
  const call = async (sql: string, params: unknown[]) => {
    try {
      return await asUser(conn, userId, sql, params);
    } catch (e) {
      const err = e as { message: string; code?: string; detail?: string };
      throw new DbError({ message: err.message, code: err.code, details: err.detail });
    }
  };
  return {
    async insert<T>(table: string, rows: Row[]) {
      if (rows.length === 0) return [];
      const cols = Object.keys(rows[0]).map(ident).join(', ');
      const res = await call(
        `insert into ${ident(table)} as t (${cols}) select ${cols} from json_populate_recordset(null::${table}, $1::json)
         returning to_json(t) as j`,
        [JSON.stringify(rows)],
      );
      return res.rows.map((r) => r.j as T);
    },
    async update(table, values, match) {
      const cols = Object.keys(values).map(ident);
      const w = where(match, 2);
      const res = await call(
        `update ${ident(table)} set (${cols.join(', ')}) = (select ${cols.join(', ')} from json_populate_record(null::${table}, $1::json))
         where ${w.sql}`,
        [JSON.stringify(values), ...w.params],
      );
      if (!res.affectedRows) throw new DbError({ code: 'app', message: 'Запись не изменилась: её нет в базе или нет прав на запись.' });
    },
    async upsert(table, rows, onConflict) {
      if (rows.length === 0) return;
      const cols = Object.keys(rows[0]).map(ident);
      const key = onConflict.split(',').map((c) => ident(c.trim()));
      const set = cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`);
      await call(
        `insert into ${ident(table)} (${cols.join(', ')}) select ${cols.join(', ')} from json_populate_recordset(null::${table}, $1::json)
         on conflict (${key.join(', ')}) do ${set.length ? `update set ${set.join(', ')}` : 'nothing'}`,
        [JSON.stringify(rows)],
      );
    },
    async remove(table, match, inList) {
      const w = where(match, 1);
      let sql = `delete from ${ident(table)} where ${w.sql}`;
      const params: unknown[] = w.params;
      if (inList) {
        if (inList[1].length === 0) return;
        params.push(inList[1].map(String));
        sql += ` and ${ident(inList[0])}::text = any($${params.length}::text[])`;
      }
      await call(sql, params);
    },
  };
}
