import { useState } from 'react';
import { LoadStatus, PageNav } from '../components/common';
import { useDocumentTitle, useLoad } from '../load';
import { adminHref } from '../router';
import { dbErrorMessage } from './dbErrors';
import {
  COACH_CONFIG,
  TEAM_CONFIG,
  bindRawOpponent,
  dirDraft,
  ensureTeam,
  isDirDirty,
  newDirKey,
  saveDir,
  validateDir,
  type DirConfig,
  type DirDraft,
  type DirRecord,
  type RawOpponent,
} from './directory';
import type { Team } from './match';
import { embeddedCount, loadCoachesPage, loadTeamsPage, type CoachesPageData, type TeamsPageData } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

type Status = { kind: 'ok' | 'error'; text: string };

const loadTeams = () => loadTeamsPage();
const loadCoaches = () => loadCoachesPage();

export function TeamsPage() {
  useDocumentTitle('Соперники');
  const state = useLoad(null, loadTeams);
  return (
    <>
      <PageNav up={<a href={adminHref}>← Админка</a>} />
      <h2>Соперники</h2>
      {state.status === 'ready' ? <Teams initial={state.data} /> : <LoadStatus state={state} />}
    </>
  );
}

export function CoachesPage() {
  useDocumentTitle('Тренеры');
  const state = useLoad(null, loadCoaches);
  return (
    <>
      <PageNav up={<a href={adminHref}>← Админка</a>} />
      <h2>Тренеры</h2>
      {state.status === 'ready' ? <Coaches initial={state.data} /> : <LoadStatus state={state} />}
    </>
  );
}

function Teams({ initial }: { initial: TeamsPageData }) {
  const [data, setData] = useState(initial);
  const usage = (r: TeamsPageData['records'][number] | undefined) => {
    if (!r) return { count: 0, text: '' };
    const [m, t] = [embeddedCount(r.match), embeddedCount(r.transfer)];
    return { count: m + t, text: [m && `матчей ${m}`, t && `трансферов ${t}`].filter(Boolean).join(', ') };
  };
  const teams: Team[] = data.records.map((r) => ({ id: r.id, name: String(r.name) }));

  return (
    <>
      <RawOpponents
        raw={data.raw}
        teams={teams}
        // привязали или завели клуб — перечитываем всё: и список Excel, и счётчики справочника
        onChange={async () => setData(await loadTeamsPage())}
      />
      <section>
        <h3>Справочник ({data.records.length})</h3>
        <Directory
          key={data.records.map((r) => `${r.id}:${r.name}`).join()}
          config={TEAM_CONFIG}
          records={data.records}
          usage={(id) => usage(data.records.find((r) => r.id === id))}
          onSaved={async () => setData(await loadTeamsPage())}
          addLabel="+ соперник"
        />
        <p className="note">
          Название — однозначное: «Динамо Пермь», а не «Динамо». Клуб, на который ссылаются матчи или трансферы, удалить
          нельзя.
        </p>
      </section>
    </>
  );
}

/** Соперники, записанные текстом из Excel: привязать все их матчи к клубу справочника. */
function RawOpponents({ raw, teams, onChange }: { raw: RawOpponent[]; teams: Team[]; onChange: () => Promise<void> }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [filter, setFilter] = useState('');

  async function bind(r: RawOpponent) {
    const name = (names[r.raw] ?? r.raw).trim();
    if (!name) return;
    setBusy(r.raw);
    setStatus(null);
    try {
      const { team, created } = await ensureTeam(supabaseWriter, teams, name);
      await bindRawOpponent(supabaseWriter, r.raw, team.id);
      setStatus({
        kind: 'ok',
        text: `«${r.raw}» → «${team.name}»${created ? ' (новый в справочнике)' : ''}: привязано матчей — ${r.matches}.`,
      });
    } catch (e) {
      setStatus({ kind: 'error', text: `«${r.raw}»: ${dbErrorMessage(e)}` });
    }
    try {
      await onChange();
    } catch (e) {
      setStatus({ kind: 'error', text: `Не удалось перечитать список: ${dbErrorMessage(e)}` });
    }
    setBusy(null);
  }

  const shown = filter.trim() ? raw.filter((r) => r.raw.toLowerCase().includes(filter.trim().toLowerCase())) : raw;
  const span = (s: string[]) => (s.length === 1 ? s[0] : `${s[0]} – ${s.at(-1)}, сезонов: ${s.length}`);

  return (
    <section>
      <h3>Из Excel, не привязаны к справочнику ({raw.length})</h3>
      {raw.length === 0 ? (
        <p className="muted">Все соперники привязаны к справочнику.</p>
      ) : (
        <>
          <p className="note">
            Матчи со своим соперником текстом из таблицы автора. «Привязать» связывает все такие матчи с клубом справочника
            (нет такого — заведёт). Неоднозначное название («Динамо») смотрите по сезонам: отдельные матчи можно поправить в
            их карточках.
          </p>
          <datalist id="admin-dir-teams">
            {teams.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
          <input aria-label="поиск по названию" placeholder="поиск" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="table-wrap">
            <table className="data-table edit-table raw-opponents">
              <thead>
                <tr>
                  <th>В Excel</th>
                  <th className="num">Матчей</th>
                  <th>Сезоны</th>
                  <th>Клуб в справочнике</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const value = names[r.raw] ?? r.raw;
                  const known = teams.some((t) => t.name.toLowerCase() === value.trim().toLowerCase());
                  return (
                    <tr key={r.raw}>
                      <td>{r.raw}</td>
                      <td className="num">{r.matches}</td>
                      <td title={r.seasons.join(', ')}>{span(r.seasons)}</td>
                      <td>
                        <input
                          list="admin-dir-teams"
                          aria-label={`${r.raw}: клуб в справочнике`}
                          className={known ? undefined : 'as-new'}
                          title={known ? 'есть в справочнике' : 'нет в справочнике — будет заведён'}
                          value={value}
                          onChange={(e) => setNames((n) => ({ ...n, [r.raw]: e.target.value }))}
                        />
                      </td>
                      <td>
                        <button type="button" disabled={busy !== null || !value.trim()} onClick={() => void bind(r)}>
                          {busy === r.raw ? 'Привязка…' : 'Привязать'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {status && (
        <p className={status.kind === 'error' ? 'error' : 'ok'} role="status">
          {status.text}
        </p>
      )}
    </section>
  );
}

function Coaches({ initial }: { initial: CoachesPageData }) {
  const [data, setData] = useState(initial);
  return (
    <>
      <Directory
        key={data.records.map((r) => `${r.id}:${r.short_name}`).join()}
        config={COACH_CONFIG}
        records={data.records}
        usage={(id) => {
          const n = embeddedCount(data.records.find((r) => r.id === id)?.match ?? []);
          return { count: n, text: n ? `матчей ${n}` : '' };
        }}
        onSaved={async () => setData(await loadCoachesPage())}
        addLabel="+ тренер"
      />
      <p className="note">
        «Как показывать» — на сайте у матча: «тренер Беляев». Тренера, у которого есть матчи, удалить нельзя. Тренера матчу
        ставят в его карточке.
      </p>
    </>
  );
}

interface DirectoryProps {
  config: DirConfig;
  records: DirRecord[];
  usage: (id: number) => { count: number; text: string };
  onSaved: () => Promise<void>;
  addLabel: string;
}

function Directory({ config, records, usage, onSaved, addLabel }: DirectoryProps) {
  const [draft, setDraft] = useState<DirDraft[]>(() => dirDraft(records, config));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const errors = validateDir(draft, config);
  const dirty = isDirDirty(draft, records, config);
  useUnsavedGuard(dirty);

  const set = (k: string, field: string, value: string) =>
    setDraft((d) => d.map((r) => (r.key === k ? { ...r, values: { ...r.values, [field]: value } } : r)));

  async function save() {
    setSaving(true);
    setStatus(null);
    const out = await saveDir(supabaseWriter, config, records, draft);
    if (out.error) {
      setDraft(out.draft);
      setStatus({ kind: 'error', text: dbErrorMessage(out.error) });
      setSaving(false);
      return;
    }
    try {
      // перечитанные записи с новыми названиями пересоздают таблицу (key у Directory)
      await onSaved();
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      setStatus({ kind: 'error', text: `Сохранено, но перечитать не удалось: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data-table edit-table directory">
          <thead>
            <tr>
              {config.fields.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th>Где встречается</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r) => {
              const u = r.id != null ? usage(r.id) : { count: 0, text: '' };
              const name = config.nameOf(r.values);
              return (
                <tr key={r.key} className={r.id == null ? 'row-new' : undefined}>
                  {config.fields.map((f) => (
                    <td key={f.key}>
                      <input
                        type={f.type ?? 'text'}
                        aria-label={`${name}: ${f.label}`}
                        placeholder={f.placeholder}
                        value={r.values[f.key]}
                        onChange={(e) => set(r.key, f.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="muted">{u.text}</td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      disabled={u.count > 0}
                      title={u.count > 0 ? 'на запись ссылаются матчи или трансферы' : 'удалить'}
                      onClick={() => setDraft((d) => d.filter((x) => x.key !== r.key))}
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {draft.length === 0 && <p className="muted">Справочник пуст.</p>}
      <p className="button-row">
        <button
          type="button"
          onClick={() =>
            setDraft((d) => [...d, { key: newDirKey(), id: null, values: Object.fromEntries(config.fields.map((f) => [f.key, ''])) }])
          }
        >
          {addLabel}
        </button>
      </p>
      <div className="save-bar">
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {status && (
          <p className={status.kind === 'error' ? 'error' : 'ok'} role="status">
            {status.text}
          </p>
        )}
        <p className="button-row">
          <button type="button" className="primary" disabled={saving || !dirty || errors.length > 0} onClick={() => void save()}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" disabled={saving || !dirty} onClick={() => setDraft(dirDraft(records, config))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
    </>
  );
}
