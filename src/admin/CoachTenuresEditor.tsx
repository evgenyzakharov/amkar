import { useEffect, useState } from 'react';
import { formatDate } from '../format';
import { errorMessage } from '../load';
import { dbErrorMessage } from './dbErrors';
import { isTenuresDirty, saveTenures, tenuresDraft, validateTenures, type TenureDraft } from './directory';
import { loadTenures, type TenuresData } from './queries';
import { supabaseWriter } from './writer';

let key = 0;

/** Сроки главного тренера: назначение и увольнение. На сайте — лента «Эпохи» и период в карточке тренера. */
export function CoachTenuresEditor({ coachId, onSaved }: { coachId: number; onSaved?: () => void }) {
  const [data, setData] = useState<TenuresData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TenureDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    loadTenures(coachId).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setDraft(tenuresDraft(d.records));
      },
      (e: unknown) => alive && setLoadError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [coachId]);

  if (loadError) return <p className="error">Не удалось загрузить сроки: {loadError}</p>;
  if (!data) return <p className="muted">Загрузка…</p>;

  const { errors, warnings } = validateTenures(draft);
  const dirty = isTenuresDirty(draft, data.records);
  const set = (k: string, patch: Partial<TenureDraft>) => setDraft((d) => d.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const add = () => setDraft((d) => [...d, { key: `new-${++key}`, id: null, from_date: '', to_date: '' }]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setStatus(null);
    const out = await saveTenures(supabaseWriter, coachId, data.records, draft);
    setData({ ...data, records: out.records });
    setDraft(out.draft);
    setStatus(out.error ? { kind: 'error', text: dbErrorMessage(out.error) } : { kind: 'ok', text: 'Сроки сохранены.' });
    setSaving(false);
    if (!out.error) onSaved?.();
  }

  return (
    <div className="team-names">
      <b>Сроки работы</b> <span className="muted">— назначение и увольнение; пусто в «по» — работает сейчас.</span>
      {data.firstMatch && (
        <span className="muted">
          {' '}
          Матчи при нём: {formatDate(data.firstMatch)} — {formatDate(data.lastMatch ?? data.firstMatch)}.
        </span>
      )}
      {draft.length > 0 && (
        <table className="edit-table">
          <tbody>
            {draft.map((d, i) => (
              <tr key={d.key}>
                <td>
                  с{' '}
                  <input type="date" aria-label={`Срок ${i + 1}: назначение`} value={d.from_date} onChange={(e) => set(d.key, { from_date: e.target.value })} />
                </td>
                <td>
                  по{' '}
                  <input type="date" aria-label={`Срок ${i + 1}: увольнение`} value={d.to_date} onChange={(e) => set(d.key, { to_date: e.target.value })} />
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
        <button type="button" onClick={add}>
          + срок
        </button>
        <button type="button" className="primary" disabled={saving || !dirty || errors.length > 0} onClick={() => void save()}>
          {saving ? 'Сохранение…' : 'Сохранить сроки'}
        </button>
      </p>
    </div>
  );
}
