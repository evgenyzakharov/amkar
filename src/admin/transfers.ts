// Трансферы сезона: приходы и уходы, окно, дата, вид, клуб.
// Клуб — из справочника team или текстом: незнакомое название в справочник само не попадает,
// а текст из таблицы автора при выборе клуба из справочника остаётся как след.
import type { Writer } from './writer';
import { findTeam, type Team } from './match';

export type Direction = 'in' | 'out';
export type TransferWindow = 'winter' | 'summer';
export type TransferKind = 'permanent' | 'loan' | 'loan_end';

export interface TransferRecord {
  id: number;
  player_id: number;
  season_id: number;
  direction: Direction;
  transfer_window: TransferWindow | null;
  transfer_date: string | null;
  kind: TransferKind | null;
  other_team_id: number | null;
  other_team_raw: string | null;
  notes: string | null;
}

export const TRANSFER_COLUMNS =
  'id, player_id, season_id, direction, transfer_window, transfer_date, kind, other_team_id, other_team_raw, notes';

export interface TransferBase {
  season: { id: number; label: string; start_year: number; end_year: number };
  transfers: TransferRecord[];
  teams: Team[];
}

export interface TransferDraft {
  key: string;
  id: number | null;
  player_id: string;
  direction: Direction;
  transfer_window: '' | TransferWindow;
  transfer_date: string;
  kind: '' | TransferKind;
  /** Клуб: название из справочника или текст. */
  club: string;
  notes: string;
}

let key = 0;
export const newTransferKey = () => `new-${++key}`;

/** Порядок окон в сезоне: в сезоне «весна — осень» зимнее окно раньше летнего, в «осень — весна» — наоборот. */
function windowRank(w: TransferWindow | '' | null, season: TransferBase['season']) {
  const winterFirst = season.start_year === season.end_year;
  if (w === 'winter') return winterFirst ? 0 : 1;
  if (w === 'summer') return winterFirst ? 1 : 0;
  return 2;
}

export function transfersDraft(base: TransferBase): TransferDraft[] {
  return [...base.transfers]
    .sort(
      (a, b) =>
        windowRank(a.transfer_window, base.season) - windowRank(b.transfer_window, base.season) ||
        (a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1) ||
        (a.transfer_date ?? '').localeCompare(b.transfer_date ?? '') ||
        a.id - b.id,
    )
    .map((t) => ({
      key: `id-${t.id}`,
      id: t.id,
      player_id: String(t.player_id),
      direction: t.direction,
      transfer_window: t.transfer_window ?? '',
      transfer_date: t.transfer_date ?? '',
      kind: t.kind ?? '',
      club: base.teams.find((x) => x.id === t.other_team_id)?.name ?? t.other_team_raw ?? '',
      notes: t.notes ?? '',
    }));
}

/** Окно по дате: декабрь — март зимнее, июнь — сентябрь летнее; в межсезонье не угадываем. */
export function windowByDate(date: string): TransferWindow | null {
  const month = Number(date.slice(5, 7));
  if ([12, 1, 2, 3].includes(month)) return 'winter';
  if ([6, 7, 8, 9].includes(month)) return 'summer';
  return null;
}

export function transferValues(d: TransferDraft, base: TransferBase): Omit<TransferRecord, 'id'> & { id?: number } {
  const club = d.club.trim();
  const old = d.id != null ? base.transfers.find((t) => t.id === d.id) : undefined;
  // клуб не трогали — оставляем как в базе: текст, совпавший с новым клубом справочника, сам не перепривязываем
  const oldClub = old ? (base.teams.find((x) => x.id === old.other_team_id)?.name ?? old.other_team_raw ?? '') : null;
  const keep = !!old && oldClub != null && club === oldClub.trim();
  const team = keep ? base.teams.find((x) => x.id === old.other_team_id) : club ? findTeam(base.teams, club) : undefined;
  return {
    ...(d.id != null ? { id: d.id } : {}),
    player_id: Number(d.player_id),
    season_id: base.season.id,
    direction: d.direction,
    transfer_window: d.transfer_window || null,
    transfer_date: d.transfer_date || null,
    kind: d.kind || null,
    other_team_id: keep ? old.other_team_id : (team?.id ?? null),
    // выбран клуб из справочника — прежний текст остаётся как был, иначе клуб хранится текстом
    other_team_raw: keep ? old.other_team_raw : team ? (old?.other_team_raw ?? null) : club || null,
    notes: d.notes.trim() || null,
  };
}

export function validateTransfers(draft: TransferDraft[], base: TransferBase, nameOf: (id: number) => string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  draft.forEach((d, i) => {
    const label = d.player_id ? nameOf(Number(d.player_id)) : `Строка ${i + 1}`;
    if (!d.player_id) errors.push(`Строка ${i + 1}: выберите игрока.`);
    if (d.transfer_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.transfer_date)) errors.push(`${label}: дата — в формате ГГГГ-ММ-ДД.`);
      else {
        const year = Number(d.transfer_date.slice(0, 4));
        // переход к сезону оформляют и накануне: допускаем год до начала сезона
        if (year < base.season.start_year - 1 || year > base.season.end_year) {
          warnings.push(`${label}: дата ${d.transfer_date.split('-').reverse().join('.')} — далеко от сезона ${base.season.label}.`);
        }
      }
    }
  });
  const seen = new Map<string, number>();
  for (const d of draft) {
    if (!d.player_id) continue;
    const k = `${d.player_id}:${d.direction}:${d.transfer_window}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) {
    if (n > 1) {
      const [pid, dir] = k.split(':');
      warnings.push(`${nameOf(Number(pid))}: ${dir === 'in' ? 'приход' : 'уход'} в одном окне записан ${n} раза.`);
    }
  }
  return { errors, warnings };
}

const FIELDS = ['player_id', 'direction', 'transfer_window', 'transfer_date', 'kind', 'other_team_id', 'other_team_raw', 'notes'] as const;
const same = (a: TransferRecord | undefined, b: Omit<TransferRecord, 'id'>) => !!a && FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));

export function isTransfersDirty(draft: TransferDraft[], base: TransferBase) {
  if (draft.length !== base.transfers.length) return true;
  const byId = new Map(base.transfers.map((t) => [t.id, t]));
  return draft.some((d) => d.id == null || !same(byId.get(d.id), transferValues(d, base)));
}

export interface TransfersSaveOutcome {
  base: TransferBase;
  draft: TransferDraft[];
  error: unknown;
}

/** Удалить убранные → изменить правленые → вставить новые (им — id в черновик, чтобы повтор не задвоил). */
export async function saveTransfers(w: Writer, base0: TransferBase, draft0: TransferDraft[]): Promise<TransfersSaveOutcome> {
  let base = base0;
  let draft = draft0;
  try {
    const values = draft.map((d) => transferValues(d, base));
    const kept = new Set(values.flatMap((v) => (v.id != null ? [v.id] : [])));
    const removed = base.transfers.filter((t) => !kept.has(t.id)).map((t) => t.id);
    if (removed.length > 0) {
      await w.remove('transfer', { season_id: base.season.id }, ['id', removed]);
      base = { ...base, transfers: base.transfers.filter((t) => kept.has(t.id)) };
    }
    const byId = new Map(base.transfers.map((t) => [t.id, t]));
    const changed = values.filter((v): v is TransferRecord => v.id != null && !same(byId.get(v.id), v));
    if (changed.length > 0) {
      await w.upsert('transfer', changed as unknown as Record<string, unknown>[], 'id');
      const next = new Map(changed.map((t) => [t.id, t]));
      base = { ...base, transfers: base.transfers.map((t) => next.get(t.id) ?? t) };
    }
    const added = values.filter((v) => v.id == null);
    if (added.length > 0) {
      const inserted = await w.insert<TransferRecord>(
        'transfer',
        added as unknown as Record<string, unknown>[],
        draft.filter((d) => d.id == null).map((d) => d.key),
      );
      let i = 0;
      draft = draft.map((d) => (d.id == null ? { ...d, id: inserted[i++].id, key: d.key } : d));
      const pick = (t: TransferRecord): TransferRecord => ({
        id: t.id,
        player_id: t.player_id,
        season_id: t.season_id,
        direction: t.direction,
        transfer_window: t.transfer_window,
        transfer_date: t.transfer_date,
        kind: t.kind,
        other_team_id: t.other_team_id,
        other_team_raw: t.other_team_raw,
        notes: t.notes,
      });
      base = { ...base, transfers: [...base.transfers, ...inserted.map(pick)] };
    }
    return { base, draft, error: null };
  } catch (error) {
    return { base, draft, error };
  }
}
