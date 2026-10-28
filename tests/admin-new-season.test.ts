import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSeason, squadToCopy, suggestNewSeason, validateNewSeason, type SquadCopyRow } from '../src/admin/newSeason';
import type { Season } from '../src/db/types';
import { migratedDb, pgliteWriter } from './db';

const season = (label: string, start: number, end: number): Season => ({
  id: 1,
  label,
  start_year: start,
  end_year: end,
  division: 'Вторая лига, дивизион «А», группа «Серебро»',
  tier: 4,
  final_place: 2,
  teams_count: 7,
  league_group: null,
  best_xi_formation: null,
});

describe('новый сезон', () => {
  it('подсказка — следующий сезон того же вида, лига и уровень — как были', () => {
    expect(suggestNewSeason(season('2026/27', 2026, 2027))).toMatchObject({
      label: '2027/28',
      start_year: '2027',
      end_year: '2028',
      tier: '4',
      teams_count: '7',
      copySquad: true,
    });
    expect(suggestNewSeason(season('2025', 2025, 2025))).toMatchObject({ label: '2026', start_year: '2026', end_year: '2026' });
  });

  it('проверки: метка по годам, без повторов, уровень 1–5', () => {
    const seasons = [season('2026/27', 2026, 2027)];
    const ok = suggestNewSeason(seasons[0]);
    expect(validateNewSeason(ok, seasons)).toEqual([]);
    expect(validateNewSeason({ ...ok, label: '2026/27', start_year: '2026', end_year: '2027' }, seasons)).toEqual(['Сезон «2026/27» уже есть.']);
    expect(validateNewSeason({ ...ok, label: '2027' }, seasons)).toEqual(['По годам метка — «2027/28».']);
    expect(validateNewSeason({ ...ok, end_year: '2029' }, seasons)).toContain('Год окончания — год начала или следующий.');
    expect(validateNewSeason({ ...ok, tier: '7' }, seasons)).toEqual(['Уровень — от 1 до 4.']);
  });

  it('переносится заявка без ушедших', () => {
    const row = (player_id: number): SquadCopyRow => ({ player_id, shirt_number: player_id, position: 'MF', squad_group: 'main', on_loan: false, sort_order: player_id });
    expect(squadToCopy([row(1), row(2), row(3)], [2]).map((r) => r.player_id)).toEqual([1, 3]);
  });

  describe('запись', () => {
    let db: PGlite;
    beforeAll(async () => {
      db = await migratedDb();
      await db.exec(`
        insert into season (id, label, start_year, end_year) values (1, '2026/27', 2026, 2027);
        insert into player (id, display_name, last_name) values (1, 'Тюкалов', 'Тюкалов'), (2, 'Котик', 'Котик');
        select setval(pg_get_serial_sequence('season', 'id'), 1);
      `);
    }, 60_000);

    it('сезон и заявка ложатся в базу', async () => {
      const draft = suggestNewSeason(season('2026/27', 2026, 2027));
      const squad: SquadCopyRow[] = [{ player_id: 1, shirt_number: 7, position: 'FW', squad_group: 'main', on_loan: true, sort_order: 3 }];
      expect(await createSeason(pgliteWriter(db), draft, squad)).toBe('2027/28');
      const { rows } = await db.query(`select label, tier, teams_count from season where label = '2027/28'`);
      expect(rows).toEqual([{ label: '2027/28', tier: 4, teams_count: 7 }]);
      const sq = await db.query(
        `select player_id, shirt_number, position, on_loan, sort_order from squad_member sm join season s on s.id = sm.season_id where s.label = '2027/28'`,
      );
      expect(sq.rows).toEqual([{ player_id: 1, shirt_number: 7, position: 'FW', on_loan: true, sort_order: 3 }]);
    });
  });
});
