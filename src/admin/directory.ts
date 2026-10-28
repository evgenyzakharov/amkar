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
  // по короткому имени тренера находит карточка матча — оно должно быть одно
  unique: 'short_name',
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

// ===========================================================================
// Названия клуба по годам (team_name)
// ===========================================================================

export interface TeamNameRecord {
  id: number;
  team_id: number;
  name: string;
  from_year: number | null;
  to_year: number | null;
}

export interface TeamNameDraft {
  key: string;
  id: number | null;
  name: string;
  from_year: string;
  to_year: string;
}

export function teamNamesDraft(records: TeamNameRecord[]): TeamNameDraft[] {
  return [...records]
    .sort((a, b) => (a.from_year ?? 0) - (b.from_year ?? 0) || a.id - b.id)
    .map((r) => ({
      key: `id-${r.id}`,
      id: r.id,
      name: r.name,
      from_year: r.from_year == null ? '' : String(r.from_year),
      to_year: r.to_year == null ? '' : String(r.to_year),
    }));
}

const year = (s: string) => {
  const t = s.trim();
  if (t === '') return null;
  return /^\d{4}$/.test(t) && Number(t) >= 1900 && Number(t) <= 2100 ? Number(t) : NaN;
};

/** Название клуба в году — как функция team_name_in в базе: подходящая запись с самым поздним началом, иначе текущее. */
export function nameInYear(names: Pick<TeamNameRecord, 'id' | 'name' | 'from_year' | 'to_year'>[], y: number, current: string): string {
  const fit = names
    .filter((n) => (n.from_year == null || n.from_year <= y) && (n.to_year == null || n.to_year >= y))
    .sort((a, b) => (b.from_year ?? -Infinity) - (a.from_year ?? -Infinity) || b.id - a.id);
  return fit[0]?.name ?? current;
}

export function teamNameValues(draft: TeamNameDraft[]) {
  return draft.map((d, i) => ({
    id: d.id ?? -(i + 1),
    name: d.name.trim(),
    from_year: year(d.from_year),
    to_year: year(d.to_year),
  }));
}

export function validateTeamNames(draft: TeamNameDraft[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const values = teamNameValues(draft);
  values.forEach((v, i) => {
    const label = v.name || `Строка ${i + 1}`;
    if (!v.name) errors.push(`Строка ${i + 1}: введите название.`);
    if (Number.isNaN(v.from_year) || Number.isNaN(v.to_year)) errors.push(`${label}: год — четыре цифры, например 1996.`);
    else if (v.from_year != null && v.to_year != null && v.from_year > v.to_year) errors.push(`${label}: «с» позже, чем «по».`);
  });
  const ok = values.filter((v) => !Number.isNaN(v.from_year) && !Number.isNaN(v.to_year));
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const [a, b] = [ok[i], ok[j]];
      const overlap = (a.from_year ?? -Infinity) <= (b.to_year ?? Infinity) && (b.from_year ?? -Infinity) <= (a.to_year ?? Infinity);
      if (overlap) warnings.push(`«${a.name}» и «${b.name}» пересекаются по годам — на сайте будет то, что началось позже.`);
    }
  }
  return { errors, warnings };
}

export function isTeamNamesDirty(draft: TeamNameDraft[], records: TeamNameRecord[]) {
  if (draft.length !== records.length) return true;
  const byId = new Map(records.map((r) => [r.id, r]));
  return teamNameValues(draft).some((v, i) => {
    const r = draft[i].id != null ? byId.get(draft[i].id!) : undefined;
    return !r || r.name !== v.name || r.from_year !== v.from_year || r.to_year !== v.to_year;
  });
}

export interface TeamNamesSaveOutcome {
  records: TeamNameRecord[];
  draft: TeamNameDraft[];
  error: unknown;
}

/** Удалить убранные → изменить правленые → вставить новые. */
export async function saveTeamNames(w: Writer, teamId: number, records0: TeamNameRecord[], draft0: TeamNameDraft[]): Promise<TeamNamesSaveOutcome> {
  let records = records0;
  let draft = draft0;
  try {
    const kept = new Set(draft.flatMap((d) => (d.id != null ? [d.id] : [])));
    const removed = records.filter((r) => !kept.has(r.id)).map((r) => r.id);
    if (removed.length > 0) {
      await w.remove('team_name', { team_id: teamId }, ['id', removed]);
      records = records.filter((r) => kept.has(r.id));
    }
    const values = teamNameValues(draft);
    const byId = new Map(records.map((r) => [r.id, r]));
    const changed = values
      .filter((_, i) => draft[i].id != null)
      .filter((v) => {
        const r = byId.get(v.id)!;
        return r.name !== v.name || r.from_year !== v.from_year || r.to_year !== v.to_year;
      })
      .map((v) => ({ ...v, team_id: teamId }));
    if (changed.length > 0) {
      await w.upsert('team_name', changed, 'id');
      const next = new Map(changed.map((c) => [c.id, c]));
      records = records.map((r) => next.get(r.id) ?? r);
    }
    const added = values.filter((_, i) => draft[i].id == null).map(({ name, from_year, to_year }) => ({ team_id: teamId, name, from_year, to_year }));
    if (added.length > 0) {
      const inserted = await w.insert<TeamNameRecord>('team_name', added);
      let i = 0;
      draft = draft.map((d) => (d.id == null ? { ...d, id: inserted[i++].id } : d));
      records = [...records, ...inserted];
    }
    return { records, draft, error: null };
  } catch (error) {
    return { records, draft, error };
  }
}

/** Как клуб записан в Excel: названия с годами — подсказка для названий по годам. */
export interface ExcelName {
  raw: string;
  first: number;
  last: number;
  matches: number;
}

export function excelNames(matches: { opponent_raw: string | null; season: { start_year: number } }[]): ExcelName[] {
  const by = new Map<string, ExcelName>();
  for (const m of matches) {
    if (!m.opponent_raw) continue;
    const y = m.season.start_year;
    const e = by.get(m.opponent_raw) ?? { raw: m.opponent_raw, first: y, last: y, matches: 0 };
    e.first = Math.min(e.first, y);
    e.last = Math.max(e.last, y);
    e.matches++;
    by.set(m.opponent_raw, e);
  }
  return [...by.values()].sort((a, b) => a.first - b.first || b.matches - a.matches);
}

// ===========================================================================
// Сроки главного тренера (coach_tenure): назначение и увольнение
// ===========================================================================

export interface TenureRecord {
  id: number;
  coach_id: number;
  from_date: string;
  /** null — работает сейчас. */
  to_date: string | null;
}

export interface TenureDraft {
  key: string;
  id: number | null;
  from_date: string;
  to_date: string;
}

export function tenuresDraft(records: TenureRecord[]): TenureDraft[] {
  return [...records]
    .sort((a, b) => a.from_date.localeCompare(b.from_date) || a.id - b.id)
    .map((r) => ({ key: `id-${r.id}`, id: r.id, from_date: r.from_date, to_date: r.to_date ?? '' }));
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const tenureValues = (d: TenureDraft) => ({ from_date: d.from_date.trim(), to_date: d.to_date.trim() || null });

/** Ошибки — пустое или неверное назначение, увольнение раньше назначения; предупреждения — сроки пересекаются. */
export function validateTenures(draft: TenureDraft[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const values = draft.map(tenureValues);
  values.forEach((v, i) => {
    const label = `Срок ${i + 1}`;
    if (!isDate(v.from_date)) errors.push(`${label}: дата назначения — в формате ГГГГ-ММ-ДД.`);
    if (v.to_date != null && !isDate(v.to_date)) errors.push(`${label}: дата увольнения — в формате ГГГГ-ММ-ДД или пусто.`);
    else if (v.to_date != null && isDate(v.from_date) && v.to_date < v.from_date) errors.push(`${label}: увольнение раньше назначения.`);
  });
  const ok = values.filter((v) => isDate(v.from_date) && (v.to_date == null || isDate(v.to_date)));
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const [a, b] = [ok[i], ok[j]];
      if (a.from_date <= (b.to_date ?? '9999') && b.from_date <= (a.to_date ?? '9999')) {
        warnings.push(`Сроки с ${a.from_date} и с ${b.from_date} пересекаются.`);
      }
    }
  }
  if (values.filter((v) => v.to_date == null).length > 1) warnings.push('Без даты увольнения больше одного срока — «работает сейчас» должен быть один.');
  return { errors, warnings };
}

export function isTenuresDirty(draft: TenureDraft[], records: TenureRecord[]) {
  if (draft.length !== records.length) return true;
  const byId = new Map(records.map((r) => [r.id, r]));
  return draft.some((d) => {
    const r = d.id != null ? byId.get(d.id) : undefined;
    const v = tenureValues(d);
    return !r || r.from_date !== v.from_date || r.to_date !== v.to_date;
  });
}

export interface TenuresSaveOutcome {
  records: TenureRecord[];
  draft: TenureDraft[];
  error: unknown;
}

/** Удалить убранные → изменить правленые → вставить новые; как у названий клуба по годам. */
export async function saveTenures(w: Writer, coachId: number, records0: TenureRecord[], draft0: TenureDraft[]): Promise<TenuresSaveOutcome> {
  let records = records0;
  let draft = draft0;
  try {
    const kept = new Set(draft.flatMap((d) => (d.id != null ? [d.id] : [])));
    const removed = records.filter((r) => !kept.has(r.id)).map((r) => r.id);
    if (removed.length > 0) {
      await w.remove('coach_tenure', { coach_id: coachId }, ['id', removed]);
      records = records.filter((r) => kept.has(r.id));
    }
    const byId = new Map(records.map((r) => [r.id, r]));
    const changed = draft
      .filter((d) => d.id != null)
      .map((d) => ({ id: d.id!, coach_id: coachId, ...tenureValues(d) }))
      .filter((v) => {
        const r = byId.get(v.id)!;
        return r.from_date !== v.from_date || r.to_date !== v.to_date;
      });
    if (changed.length > 0) {
      await w.upsert('coach_tenure', changed, 'id');
      const next = new Map(changed.map((c) => [c.id, c]));
      records = records.map((r) => next.get(r.id) ?? r);
    }
    const added = draft.filter((d) => d.id == null).map((d) => ({ coach_id: coachId, ...tenureValues(d) }));
    if (added.length > 0) {
      const inserted = await w.insert<TenureRecord>('coach_tenure', added);
      let i = 0;
      draft = draft.map((d) => (d.id == null ? { ...d, id: inserted[i++].id, key: `id-${inserted[i - 1].id}` } : d));
      records = [...records, ...inserted];
    }
    return { records, draft, error: null };
  } catch (error) {
    return { records, draft, error };
  }
}
