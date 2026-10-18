import { useEffect, useState } from 'react';
import { errorMessage } from '../load';
import { dbErrorMessage } from './dbErrors';
import {
  excelNames,
  isTeamNamesDirty,
  nameInYear,
  saveTeamNames,
  teamNameValues,
  teamNamesDraft,
  validateTeamNames,
  type TeamNameDraft,
} from './directory';
import { loadTeamNames, type TeamNamesData } from './queries';
import { supabaseWriter } from './writer';

let key = 0;

/** Прежние названия клуба по годам: «Уралмаш» до 2002. С подсказками из Excel и тем, как будет на сайте. */
export function TeamNamesEditor({ teamId, current, onSaved }: { teamId: number; current: string; onSaved?: () => void }) {
  const [data, setData] = useState<TeamNamesData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TeamNameDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    loadTeamNames(teamId).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setDraft(teamNamesDraft(d.names));
      },
      (e: unknown) => alive && setLoadError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [teamId]);

  if (loadError) return <p className="error">Не удалось загрузить названия: {loadError}</p>;
  if (!data) return <p className="muted">Загрузка…</p>;

  const { errors, warnings } = validateTeamNames(draft);
  const dirty = isTeamNamesDirty(draft, data.names);
  const set = (k: string, patch: Partial<TeamNameDraft>) => setDraft((d) => d.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const add = (name = '', from = '', to = '') =>
    setDraft((d) => [...d, { key: `new-${++key}`, id: null, name, from_year: from, to_year: to }]);

  // Как будет на сайте: сезоны матчей клуба подряд с одним названием — одной строкой
  const values = teamNameValues(draft).filter((v) => v.name && !Number.isNaN(v.from_year) && !Number.isNaN(v.to_year));
  const seasons = [...new Map(data.matches.map((m) => [m.season.label, m.season])).values()].sort(
    (a, b) => a.start_year - b.start_year || a.label.localeCompare(b.label),
  );
  const runs: { from: string; to: string; name: string }[] = [];
  for (const s of seasons) {
    const name = nameInYear(values as { id: number; name: string; from_year: number | null; to_year: number | null }[], s.start_year, current);
    const last = runs.at(-1);
    if (last && last.name === name) last.to = s.label;
    else runs.push({ from: s.label, to: s.label, name });
  }
  const used = new Set(draft.map((d) => d.name.trim().toLowerCase()));
  const hints = excelNames(data.matches).filter((h) => h.raw.trim().toLowerCase() !== current.toLowerCase() && !used.has(h.raw.trim().toLowerCase()));

  async function save() {
    if (!data) return;
    setSaving(true);
    setStatus(null);
    const out = await saveTeamNames(supabaseWriter, teamId, data.names, draft);
    setData({ ...data, names: out.records });
    setDraft(out.draft);
    setStatus(out.error ? { kind: 'error', text: dbErrorMessage(out.error) } : { kind: 'ok', text: 'Названия сохранены.' });
    setSaving(false);
    if (!out.error) onSaved?.();
  }

  return (
    <div className="team-names">
      <b>Названия по годам</b> <span className="muted">— год начала сезона; пусто — без границы. В остальные годы — «{current}».</span>
      {draft.length > 0 && (
        <table className="edit-table">
          <tbody>
            {draft.map((d) => (
              <tr key={d.key}>
                <td>
                  <input aria-label="прежнее название" placeholder="Уралмаш" value={d.name} onChange={(e) => set(d.key, { name: e.target.value })} />
                </td>
                <td>
                  с{' '}
                  <input
                    className="w-year"
                    inputMode="numeric"
                    aria-label={`${d.name}: с года`}
                    value={d.from_year}
                    onChange={(e) => set(d.key, { from_year: e.target.value })}
                  />
                </td>
                <td>
                  по{' '}
                  <input
                    className="w-year"
                    inputMode="numeric"
                    aria-label={`${d.name}: по год`}
                    value={d.to_year}
                    onChange={(e) => set(d.key, { to_year: e.target.value })}
                  />
                </td>
                <td>
                  <button type="button" className="link-button" onClick={() => setDraft((x) => x.filter((y) => y.key !== d.key))}>
                    удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hints.length > 0 && (
        <p className="hints">
          В Excel:{' '}
          {hints.map((h) => (
            <button
              key={h.raw}
              type="button"
              className="link-button hint"
              title="добавить как прежнее название с этими годами"
              onClick={() => add(h.raw, String(h.first), String(h.last))}
            >
              «{h.raw}» {h.first === h.last ? h.first : `${h.first}–${h.last}`} ({h.matches})
            </button>
          ))}
        </p>
      )}
      {runs.length > 0 && (
        <p className="muted">
          На сайте: {runs.map((r) => `${r.from === r.to ? r.from : `${r.from} – ${r.to}`} — ${r.name}`).join(' · ')}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {status && <p className={status.kind === 'error' ? 'error' : 'ok'}>{status.text}</p>}
      <p className="button-row">
        <button type="button" onClick={() => add()}>
          + название
        </button>
        <button type="button" className="primary" disabled={saving || !dirty || errors.length > 0} onClick={() => void save()}>
          {saving ? 'Сохранение…' : 'Сохранить названия'}
        </button>
      </p>
    </div>
  );
}
