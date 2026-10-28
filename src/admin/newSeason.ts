// Новый сезон из админки: метка и годы — по прошлому сезону, заявка — перенос прошлой без ушедших.
import type { Season } from '../db/types';
import type { Writer } from './writer';

export interface NewSeasonDraft {
  label: string;
  start_year: string;
  end_year: string;
  division: string;
  tier: string;
  teams_count: string;
  /** Перенести заявку прошлого сезона. */
  copySquad: boolean;
}

/** Строка заявки прошлого сезона, которую переносим как есть. */
export interface SquadCopyRow {
  player_id: number;
  shirt_number: number | null;
  position: string | null;
  squad_group: string;
  on_loan: boolean;
  sort_order: number | null;
}

/** Заявка для переноса: все, кроме тех, у кого в прошлом сезоне трансфер «ушёл». */
export const squadToCopy = (squad: SquadCopyRow[], left: number[]) => squad.filter((r) => !new Set(left).has(r.player_id));

/** «2026/27» → «2027/28», «2025» → «2026»: следующий сезон того же вида. Лига и уровень — как были. */
export function suggestNewSeason(last: Season | undefined): NewSeasonDraft {
  if (!last) return { label: '', start_year: '', end_year: '', division: '', tier: '', teams_count: '', copySquad: false };
  const start = last.start_year + 1;
  const end = last.end_year + 1;
  return {
    label: start === end ? String(start) : `${start}/${String(end).slice(2)}`,
    start_year: String(start),
    end_year: String(end),
    division: last.division ?? '',
    tier: last.tier == null ? '' : String(last.tier),
    teams_count: last.teams_count == null ? '' : String(last.teams_count),
    copySquad: true,
  };
}

const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

export function validateNewSeason(d: NewSeasonDraft, seasons: Season[]): string[] {
  const errors: string[] = [];
  const [start, end] = [int(d.start_year), int(d.end_year)];
  const label = d.label.trim();
  if (!/^\d{4}(\/\d{2})?$/.test(label)) errors.push('Метка — «2027» или «2027/28».');
  if (seasons.some((s) => s.label === label)) errors.push(`Сезон «${label}» уже есть.`);
  if (start == null || start < 1990 || start > 2100) errors.push('Год начала — четыре цифры.');
  if (end == null || start == null || end < start || end > start + 1) errors.push('Год окончания — год начала или следующий.');
  if (start != null && end != null && /^\d{4}(\/\d{2})?$/.test(label)) {
    const expected = start === end ? String(start) : `${start}/${String(end).slice(2)}`;
    if (label !== expected) errors.push(`По годам метка — «${expected}».`);
  }
  if (d.tier.trim() && (int(d.tier) == null || int(d.tier)! < 1 || int(d.tier)! > 4)) errors.push('Уровень — от 1 до 4.');
  if (d.teams_count.trim() && (int(d.teams_count) == null || int(d.teams_count)! < 1)) errors.push('Команд — целое число больше нуля.');
  return errors;
}

/** Заводит сезон и, если надо, переносит заявку. Возвращает метку нового сезона. */
export async function createSeason(w: Writer, d: NewSeasonDraft, squad: SquadCopyRow[]): Promise<string> {
  const [season] = await w.insert<{ id: number; label: string }>('season', [
    {
      label: d.label.trim(),
      start_year: int(d.start_year),
      end_year: int(d.end_year),
      division: d.division.trim() || null,
      tier: int(d.tier),
      teams_count: int(d.teams_count),
    },
  ]);
  if (d.copySquad && squad.length > 0) await w.insert('squad_member', squad.map((r) => ({ ...r, season_id: season.id })));
  return season.label;
}
