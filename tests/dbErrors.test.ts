import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONSTRAINT_MESSAGES, dbErrorMessage } from '../src/admin/dbErrors';
import { migratedDb } from './db';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    insert into season (id, label, start_year, end_year) values (1, '2008', 2008, 2008);
    insert into player (id, display_name, last_name) values (1, 'Пеев', 'Пеев');
    insert into team (id, name) values (1, 'Химки');
    insert into match (id, season_id, competition_id, seq, opponent_id) values (1, 1, 1, 1, 1);
    select setval(pg_get_serial_sequence('team', 'id'), 1);
  `);
}, 60_000);

/** Текст, который увидит админ, если база отвергнет запрос. */
async function messageFor(sql: string) {
  try {
    await db.exec(sql);
  } catch (e) {
    return dbErrorMessage(e);
  }
  throw new Error(`запрос прошёл: ${sql}`);
}

describe('ошибки базы по-русски', () => {
  it('у каждого ограничения схемы есть объяснение', async () => {
    const { rows } = await db.query<{ conname: string }>(`
      select conname from pg_constraint
      where connamespace = 'public'::regnamespace and conrelid <> 'admins'::regclass
        -- not null в новых Postgres тоже ограничения, но их текст ошибки разбирается отдельно
        and contype in ('c', 'f', 'u', 'p')
      order by conname`);
    expect(rows.length).toBeGreaterThan(70);
    expect(rows.map((r) => r.conname).filter((name) => !CONSTRAINT_MESSAGES[name])).toEqual([]);
  });

  it('проверки матча', async () => {
    expect(await messageFor(`update match set result = 'W', goals_for = 0, goals_against = 1 where id = 1`)).toBe(
      'Результат не сходится со счётом.',
    );
    expect(await messageFor(`update match set goals_for = 1 where id = 1`)).toBe(
      'Счёт заполняется целиком: голы обеих команд или ничего.',
    );
    expect(await messageFor(`update match set awarded = true where id = 1`)).toBe(
      'У технического результата должен быть указан результат: победа, ничья или поражение.',
    );
    expect(await messageFor(`update match set opponent_id = null where id = 1`)).toBe('Укажите соперника.');
  });

  it('состав, голы, справочники', async () => {
    expect(await messageFor(`insert into appearance (match_id, player_id, role, minutes) values (1, 1, 'bench', 10)`)).toBe(
      'У игрока в запасе не может быть минут на поле.',
    );
    expect(await messageFor(`insert into goal (match_id, side, minute, added_time) values (1, 'amkar', 70, 2)`)).toBe(
      'Добавленное время бывает только после 45, 90, 105 или 120 минуты.',
    );
    expect(await messageFor(`insert into team (name) values ('Химки')`)).toBe('Соперник с таким названием уже есть в справочнике.');
    expect(await messageFor(`insert into match (season_id, competition_id, seq) values (1, 1, 2)`)).toBe('Укажите соперника.');
    expect(await messageFor(`insert into match (season_id, competition_id, opponent_raw) values (1, 1, 'X')`)).toBe(
      'Не заполнено обязательное поле: номер матча.',
    );
  });

  it('удаление записи, на которую ссылаются', async () => {
    expect(await messageFor(`delete from team where id = 1`)).toBe('Удалить нельзя: на эту запись ссылаются матчи.');
  });

  it('права, сессия, связь', () => {
    expect(dbErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "match"' })).toBe(
      'Нет прав на запись. Войдите заново под аккаунтом админа.',
    );
    expect(dbErrorMessage({ code: 'PGRST301', message: 'JWT expired' })).toBe('Сессия истекла — войдите заново.');
    expect(dbErrorMessage(new TypeError('Failed to fetch'))).toBe('Нет связи с базой. Проверьте интернет и попробуйте ещё раз.');
  });
});
