// Чтение для админки. Запись — в save.ts через Writer.
import { NotFoundError } from '../load';
import { db, loadSeasons, MATCH_COLUMNS, rows } from '../db/queries';
import type { MatchRow, Season } from '../db/types';

/** Матч в списке админки: сколько уже записано по нему. */
export interface AdminMatchRow extends MatchRow {
  appearance: { count: number }[];
  goal: { count: number }[];
}

export interface AdminSeasonData {
  season: Season;
  matches: AdminMatchRow[];
}

export async function loadAdminSeason(label: string): Promise<AdminSeasonData> {
  const season = (await loadSeasons()).find((s) => s.label === label);
  if (!season) throw new NotFoundError(`Сезона «${label}» в базе нет.`);
  const matches = await rows<AdminMatchRow[]>(
    db()
      .from('match')
      .select(`${MATCH_COLUMNS}, appearance(count), goal(count)`)
      .eq('season_id', season.id)
      .order('seq'),
  );
  return { season, matches };
}

/** Число из встроенного count() PostgREST: [{ count: 5 }]. */
export const embeddedCount = (list: { count: number }[]) => list[0]?.count ?? 0;
