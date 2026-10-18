// Запись в базу. Карточки пишут через этот интерфейс: в приложении — supabase-js,
// в тестах — PGlite с теми же миграциями и правами (tests/db.ts).
import { supabase } from '../db/supabase';
import { DbError } from './dbErrors';

export type Row = Record<string, unknown>;
export type Filter = Record<string, string | number | boolean>;

export interface Writer {
  /** Вставка, возвращает вставленные строки (с id) в том же порядке. */
  insert<T = Row>(table: string, rows: Row[]): Promise<T[]>;
  /** Изменение строк по фильтру; если ничего не изменилось — ошибка (нет строки или нет прав). */
  update(table: string, values: Row, match: Filter): Promise<void>;
  /** Вставка или изменение по ключу onConflict («match_id,player_id»). Все строки — с одинаковым набором полей. */
  upsert(table: string, rows: Row[], onConflict: string): Promise<void>;
  /** Удаление по фильтру и, если задан, списку значений столбца. */
  remove(table: string, match: Filter, inList?: [string, (string | number)[]]): Promise<void>;
}

type Response = { data: unknown; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null };

async function run<T>(query: PromiseLike<Response>): Promise<T> {
  let res: Response;
  try {
    res = await query;
  } catch (e) {
    throw new DbError({ message: e instanceof Error ? e.message : String(e) });
  }
  if (res.error) throw new DbError(res.error);
  return res.data as T;
}

function db() {
  if (!supabase) throw new DbError({ code: 'app', message: 'Supabase не настроен: заполните .env' });
  return supabase;
}

export const supabaseWriter: Writer = {
  async insert<T>(table: string, rows: Row[]) {
    if (rows.length === 0) return [];
    return run<T[]>(db().from(table).insert(rows).select());
  },
  async update(table, values, match) {
    // Без прав RLS не даёт ошибки, а просто ничего не меняет — поэтому просим строки назад и считаем
    const changed = await run<unknown[]>(db().from(table).update(values).match(match).select());
    if (changed.length === 0) {
      throw new DbError({
        code: 'app',
        message: 'Запись не изменилась: её нет в базе или нет прав на запись. Обновите страницу и войдите заново.',
      });
    }
  },
  async upsert(table, rows, onConflict) {
    if (rows.length === 0) return;
    await run(db().from(table).upsert(rows, { onConflict }));
  },
  async remove(table, match, inList) {
    let q = db().from(table).delete().match(match);
    if (inList) {
      if (inList[1].length === 0) return;
      q = q.in(inList[0], inList[1]);
    }
    await run(q);
  },
};
