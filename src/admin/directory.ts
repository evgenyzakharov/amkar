// Справочники соперников (team) и тренеров (coach): список записей с текстовыми полями.
// Плюс привязка соперников, записанных текстом из Excel (match.opponent_raw), к клубам справочника.
import { findTeam, type Team } from './match';
import type { Writer } from './writer';

export interface DirField {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'date';
  placeholder?: string;
}

export interface DirConfig {
  table: 'team' | 'coach';
  fields: DirField[];
  /** Поле, по которому записи не должны совпадать (без учёта регистра и «ё»). */
  unique?: string;
  /** Как назвать запись в сообщениях. */
  nameOf: (values: Record<string, string>) => string;
}

export const TEAM_CONFIG: DirConfig = {
  table: 'team',
  fields: [
    { key: 'name', label: 'Название', required: true, placeholder: 'Динамо Пермь' },
    { key: 'city', label: 'Город' },
    { key: 'notes', label: 'Заметки' },
  ],
  unique: 'name',
  nameOf: (v) => v.name || 'новый соперник',
};

export const COACH_CONFIG: DirConfig = {
  table: 'coach',
  fields: [
    { key: 'short_name', label: 'Как показывать', required: true, placeholder: 'Беляев' },
    { key: 'full_name', label: 'Полное имя', required: true, placeholder: 'Игорь Беляев' },
    { key: 'birth_date', label: 'Дата рождения', type: 'date' },
    { key: 'notes', label: 'Заметки' },
  ],
  nameOf: (v) => v.short_name || v.full_name || 'новый тренер',
};

export type DirRecord = { id: number } & Record<string, string | number | null>;

export interface DirDraft {
  key: string;
  id: number | null;
  values: Record<string, string>;
}

let key = 0;
export const newDirKey = () => `new-${++key}`;

export function dirDraft(records: DirRecord[], config: DirConfig): DirDraft[] {
  return records.map((r) => ({
    key: `id-${r.id}`,
    id: r.id,
    values: Object.fromEntries(config.fields.map((f) => [f.key, r[f.key] == null ? '' : String(r[f.key])])),
  }));
}

function dirValues(d: DirDraft, config: DirConfig): Record<string, string | null> {
  return Object.fromEntries(config.fields.map((f) => [f.key, d.values[f.key]?.trim() || null]));
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().replaceAll('ё', 'е');

export function validateDir(draft: DirDraft[], config: DirConfig) {
  const errors: string[] = [];
  draft.forEach((d, i) => {
    for (const f of config.fields) {
      if (f.required && !d.values[f.key]?.trim()) errors.push(`Строка ${i + 1}: заполните «${f.label}».`);
      if (f.type === 'date' && d.values[f.key] && !/^\d{4}-\d{2}-\d{2}$/.test(d.values[f.key])) {
        errors.push(`${config.nameOf(d.values)}: «${f.label}» — в формате ГГГГ-ММ-ДД.`);
      }
    }
  });
  if (config.unique) {
    const seen = new Map<string, number>();
    for (const d of draft) {
      const v = norm(d.values[config.unique] ?? '');
      if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    for (const d of draft) {
      const v = norm(d.values[config.unique] ?? '');
      if (v && seen.get(v)! > 1) {
        errors.push(`«${d.values[config.unique].trim()}» записан дважды — названия в справочнике не должны совпадать.`);
        seen.set(v, 0);
      }
    }
  }
  return errors;
}

const same = (a: DirRecord | undefined, b: Record<string, string | null>, config: DirConfig) =>
  !!a && config.fields.every((f) => (a[f.key] == null ? null : String(a[f.key])) === b[f.key]);

export function isDirDirty(draft: DirDraft[], records: DirRecord[], config: DirConfig) {
  if (draft.length !== records.length) return true;
  const byId = new Map(records.map((r) => [r.id, r]));
  return draft.some((d) => d.id == null || !same(byId.get(d.id), dirValues(d, config), config));
}

export interface DirSaveOutcome {
  records: DirRecord[];
  draft: DirDraft[];
  error: unknown;
}

/** Удалить убранные → изменить правленые → завести новые. */
export async function saveDir(w: Writer, config: DirConfig, records0: DirRecord[], draft0: DirDraft[]): Promise<DirSaveOutcome> {
  let records = records0;
  let draft = draft0;
  try {
    const kept = new Set(draft.flatMap((d) => (d.id != null ? [d.id] : [])));
    const removed = records.filter((r) => !kept.has(r.id)).map((r) => r.id);
    if (removed.length > 0) {
      await w.remove(config.table, {}, ['id', removed]);
      records = records.filter((r) => kept.has(r.id));
    }
    const byId = new Map(records.map((r) => [r.id, r]));
    const changed = draft
      .filter((d) => d.id != null && !same(byId.get(d.id), dirValues(d, config), config))
      .map((d) => ({ id: d.id!, ...dirValues(d, config) }));
    if (changed.length > 0) {
      await w.upsert(config.table, changed, 'id');
      const next = new Map(changed.map((c) => [c.id, c]));
      records = records.map((r) => (next.has(r.id) ? { ...r, ...next.get(r.id)! } : r));
    }
    const added = draft.filter((d) => d.id == null);
    if (added.length > 0) {
      const inserted = await w.insert<DirRecord>(config.table, added.map((d) => dirValues(d, config)));
      let i = 0;
      draft = draft.map((d) => (d.id == null ? { ...d, id: inserted[i++].id } : d));
      records = [...records, ...inserted];
    }
    return { records, draft, error: null };
  } catch (error) {
    return { records, draft, error };
  }
}

// ===========================================================================
// Соперники из Excel
// ===========================================================================

/** Название соперника из Excel, ещё не привязанное к справочнику. */
export interface RawOpponent {
  raw: string;
  matches: number;
  /** Сезоны по порядку — чтобы видеть, один ли это клуб. */
  seasons: string[];
}

export function rawOpponents(rows: { opponent_raw: string | null; season: { label: string; start_year: number } }[]): RawOpponent[] {
  const by = new Map<string, { matches: number; seasons: Map<string, number> }>();
  for (const r of rows) {
    if (!r.opponent_raw) continue;
    const entry = by.get(r.opponent_raw) ?? { matches: 0, seasons: new Map() };
    entry.matches++;
    entry.seasons.set(r.season.label, r.season.start_year);
    by.set(r.opponent_raw, entry);
  }
  return [...by]
    .map(([raw, e]) => ({
      raw,
      matches: e.matches,
      seasons: [...e.seasons].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([label]) => label),
    }))
    .sort((a, b) => b.matches - a.matches || a.raw.localeCompare(b.raw, 'ru'));
}

/** Клуб справочника по названию; нет — заводится. Отдельно от привязки: при сбое привязки клуб уже известен. */
export async function ensureTeam(w: Writer, teams: Team[], teamName: string): Promise<{ team: Team; created: boolean }> {
  const name = teamName.trim().replace(/\s+/g, ' ');
  const found = findTeam(teams, name);
  if (found) return { team: found, created: false };
  const [row] = await w.insert<Team>('team', [{ name }]);
  return { team: { id: row.id, name: row.name }, created: true };
}

/** Привязать все ещё не привязанные матчи с этим текстом соперника к клубу. Текст из Excel остаётся как след. */
export async function bindRawOpponent(w: Writer, raw: string, teamId: number): Promise<void> {
  await w.update('match', { opponent_id: teamId }, { opponent_raw: raw, opponent_id: null });
}
