// Запись в базу. Карточки пишут через этот интерфейс: в приложении — supabase-js,
// в тестах — PGlite с теми же миграциями и правами (tests/db.ts).
import { clearCache } from '../db/queries';
import { supabase } from '../db/supabase';
import { DbError } from './dbErrors';

export type Row = Record<string, unknown>;
/** Равенство по столбцам; null — «поле пустое» (is null). */
export type Filter = Record<string, string | number | boolean | null>;

export interface Writer {
  /**
   * Вставка, возвращает вставленные строки (с id) в том же порядке.
   * keys — постоянные ключи строк формы: с ними повтор после потерянного ответа не заводит строку второй раз
   * (upsert по client_key, миграция 20261028160000), а возвращает уже записанную.
   */
  insert<T = Row>(table: string, rows: Row[], keys?: string[]): Promise<T[]>;
  /** Изменение строк по фильтру; если ничего не изменилось — ошибка (нет строки или нет прав). */
  update(table: string, values: Row, match: Filter): Promise<void>;
  /** Вставка или изменение по ключу onConflict («match_id,player_id»). Все строки — с одинаковым набором полей. */
  upsert(table: string, rows: Row[], onConflict: string): Promise<void>;
  /** Удаление по фильтру и, если задан, списку значений столбца; если строки остались (нет прав) — ошибка. */
  remove(table: string, match: Filter, inList?: [string, (string | number)[]]): Promise<void>;
}

// Ключ повтора: вкладка браузера + таблица + строка формы. Строки формы нумеруются заново в каждой вкладке —
// без метки вкладки ключи разных вкладок совпали бы
const TAB = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
export const clientKey = (table: string, key: string) => `${TAB}:${table}:${key}`;

/** Ключ строки по названию (новый клуб или тренер из поля ввода): то же название — та же строка. */
export const nameKey = (name: string) => `name:${name.trim().replace(/\s+/g, ' ').toLowerCase()}`;

/** Строки — в порядке ключей: upsert возвращает их в своём порядке. */
export function inKeyOrder<T>(rows: T[], keyed: Row[]): T[] {
  const byKey = new Map(rows.map((r) => [(r as Row).client_key, r]));
  return keyed.map((k) => byKey.get(k.client_key)!);
}

/** Столбца client_key ещё нет: миграция 20261028160000 не выполнена — вставляем как раньше. */
export const noClientKey = (e: unknown) =>
  e instanceof DbError && (e.code === 'PGRST204' || e.code === '42703' || e.code === '42P10') && /client_key|ON CONFLICT/i.test(e.message);

const REMOVE_DENIED = 'Запись не удалилась: нет прав на запись. Обновите страницу и войдите заново.';

type Response = { data: unknown; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null };

async function run<T>(query: PromiseLike<Response>): Promise<T> {
  let res: Response;
  try {
    res = await query;
  } catch (e) {
    throw new DbError({ message: e instanceof Error ? e.message : String(e) });
  } finally {
    // запись могла пройти, даже если ответ не дошёл: сайт перечитает общие данные (сезоны, матчи)
    clearCache();
  }
  if (res.error) throw new DbError(res.error);
  return res.data as T;
}

function db() {
  if (!supabase) throw new DbError({ code: 'app', message: 'Supabase не настроен: заполните .env' });
  return supabase;
}

/** Фильтр по столбцам: значения — через eq, null — через is null. */
function withFilter<Q extends { eq(column: string, value: unknown): Q; is(column: string, value: null): Q }>(q: Q, match: Filter): Q {
  for (const [column, value] of Object.entries(match)) q = value === null ? q.is(column, null) : q.eq(column, value);
  return q;
}

export const supabaseWriter: Writer = {
  async insert<T>(table: string, rows: Row[], keys?: string[]) {
    if (rows.length === 0) return [];
    if (!keys) return run<T[]>(db().from(table).insert(rows).select());
    const keyed = rows.map((r, i) => ({ ...r, client_key: clientKey(table, keys[i]) }));
    try {
      return inKeyOrder(await run<T[]>(db().from(table).upsert(keyed, { onConflict: 'client_key' }).select()), keyed);
    } catch (e) {
      if (noClientKey(e)) return run<T[]>(db().from(table).insert(rows).select());
      throw e;
    }
  },
  async update(table, values, match) {
    // Без прав RLS не даёт ошибки, а просто ничего не меняет — поэтому просим строки назад и считаем
    const changed = await run<unknown[]>(withFilter(db().from(table).update(values), match).select());
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
    if (inList && inList[1].length === 0) return;
    let q = withFilter(db().from(table).delete(), match);
    if (inList) q = q.in(inList[0], inList[1]);
    await run(q);
    // Без прав RLS удаление не отвергает, а просто ничего не удаляет. Повтор после потерянного ответа удаляет 0 строк —
    // это нормально: строк уже нет. Поэтому проверяем не «сколько удалено», а «осталось ли»
    let left = withFilter(db().from(table).select('*').limit(1), match);
    if (inList) left = left.in(inList[0], inList[1]);
    if ((await run<unknown[]>(left)).length > 0) throw new DbError({ code: 'app', message: REMOVE_DENIED });
  },
};
