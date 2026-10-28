import { useEffect, useState } from 'react';
import { LoadStatus, PageNav } from '../components/common';
import { errorMessage, useDocumentTitle, useLoad } from '../load';
import { adminHref } from '../router';
import { dbErrorMessage } from './dbErrors';
import { POINTS_FIELDS, POINTS_GROUPS, isPointsDirty, pointsDraft, savePoints, validatePoints, type PointsDraft, type PointsSettings } from './points';
import { loadPointsSettings, loadTopSeasons, type TopSeasonRow } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

const loadSettings = () => loadPointsSettings();

/** #/admin/points — числа формулы очков сезона: веса, шкала, множитель команды, карьера. */
export function PointsSettingsEditor() {
  useDocumentTitle('Формула очков');
  const state = useLoad(null, loadSettings);
  return (
    <>
      <PageNav up={<a href={adminHref}>← Админка</a>} />
      <h2>Формула очков сезона</h2>
      <p className="muted">
        Очки сезона игрока и рейтинг карьеры считает база по этим числам — после сохранения всё пересчитывается само. Ожидаемое место
        команды — на вкладке сезона «Сезон», ручные поправки к сезону игрока — в карточке игрока.
      </p>
      {state.status === 'ready' ? <PointsForm initial={state.data} /> : <LoadStatus state={state} />}
    </>
  );
}

function PointsForm({ initial }: { initial: PointsSettings }) {
  const [settings, setSettings] = useState(initial);
  const [draft, setDraft] = useState<PointsDraft>(() => pointsDraft(initial));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const errors = validatePoints(draft);
  const dirty = isPointsDirty(draft, settings);
  useUnsavedGuard(dirty);

  async function save() {
    setSaving(true);
    setStatus(null);
    let saved = false;
    try {
      await savePoints(supabaseWriter, draft);
      saved = true;
      setStatus({ kind: 'ok', text: 'Сохранено — очки пересчитаны.' });
    } catch (e) {
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
    }
    try {
      const fresh = await loadPointsSettings();
      setSettings(fresh);
      // После ошибки введённое остаётся в форме: исправить и сохранить ещё раз
      if (saved) setDraft(pointsDraft(fresh));
      setVersion((v) => v + 1);
    } catch (e) {
      setStatus({ kind: 'error', text: `Не удалось перечитать формулу: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <>
      {POINTS_GROUPS.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <p className="field-note">{g.note}</p>
          <div className="form-grid">
            {g.keys.map((k) => (
              <label key={k} className={POINTS_FIELDS[k].note ? 'span-2' : undefined}>
                {POINTS_FIELDS[k].label}
                <input
                  className="w-num"
                  inputMode="decimal"
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                />
                {POINTS_FIELDS[k].note && <span className="field-note">{POINTS_FIELDS[k].note}</span>}
              </label>
            ))}
            {g.keys.includes('short_season_power') && (
              <label className="inline span-all">
                <input
                  type="checkbox"
                  checked={draft.long_season_full}
                  onChange={(e) => setDraft((d) => ({ ...d, long_season_full: e.target.checked }))}
                />{' '}
                Сезон длиннее 30 туров приводить к 30 турам полностью
              </label>
            )}
          </div>
        </section>
      ))}
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
          <button type="button" disabled={saving || !dirty} onClick={() => setDraft(pointsDraft(settings))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <TopSeasons version={version} />
    </>
  );
}

/** Лучшие сезоны по сохранённой формуле; перечитываются после каждого сохранения. */
function TopSeasons({ version }: { version: number }) {
  const [state, setState] = useState<{ rows?: TopSeasonRow[]; error?: string }>({});
  useEffect(() => {
    let alive = true;
    loadTopSeasons().then(
      (rows) => alive && setState({ rows }),
      (e: unknown) => alive && setState({ error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [version]);

  if (state.error) return <p className="error">Лучшие сезоны не загрузились: {state.error}</p>;
  if (!state.rows) return <p className="muted">Лучшие сезоны…</p>;
  return (
    <section>
      <h3>Лучшие сезоны по сохранённой формуле</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Игрок</th>
              <th>Сезон</th>
              <th className="num">Очки</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((r, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td>{r.display_name}</td>
                <td>{r.season_label}</td>
                <td className="num">{Math.round(r.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
