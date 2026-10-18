import { useState } from 'react';
import { LoadStatus } from '../components/common';
import { BEST_XI_LINES, SLOT_LABEL } from '../format';
import { useLoad } from '../load';
import { dbErrorMessage } from './dbErrors';
import { bestXiDraft, isBestXiDirty, saveBestXi, validateBestXi, type BestXiDraft, type Slot } from './people';
import { loadBestXi, type BestXiData } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

export function BestXiEditor({ label }: { label: string }) {
  const state = useLoad(label, loadBestXi);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <BestXi key={label} initial={state.data} />;
}

function BestXi({ initial }: { initial: BestXiData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<BestXiDraft>(() => bestXiDraft(initial.rows));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { season, rows, players } = data;

  const nameOf = (id: number) => players.find((p) => p.id === id)?.display_name ?? `игрок №${id}`;
  const errors = validateBestXi(draft, nameOf);
  const dirty = isBestXiDirty(draft, rows);
  useUnsavedGuard(dirty);
  const chosen = new Set(Object.values(draft).filter(Boolean));

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const after = await saveBestXi(supabaseWriter, season.id, rows, draft);
      setData({ ...data, rows: after });
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      // что успело записаться — увидим после перечитывания
      try {
        const fresh = await loadBestXi(season.label);
        setData(fresh);
      } catch {
        /* остаёмся на прежних данных */
      }
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
    }
    setSaving(false);
  }

  return (
    <>
      <div className="pitch best-xi-edit">
        {BEST_XI_LINES.map((line) => (
          <div className="pitch-line" key={line.join()}>
            {line.map((slot) => (
              <label key={slot} className="pitch-player">
                <span className="pitch-slot">{SLOT_LABEL[slot]}</span>
                <select
                  aria-label={`сборная: ${SLOT_LABEL[slot]} (${slot})`}
                  value={draft[slot as Slot]}
                  onChange={(e) => setDraft((d) => ({ ...d, [slot]: e.target.value }))}
                >
                  <option value="">—</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id} disabled={chosen.has(String(p.id)) && draft[slot as Slot] !== String(p.id)}>
                      {p.display_name}
                      {p.inSquad ? '' : ' (нет в заявке)'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ))}
      </div>
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
          <button type="button" disabled={saving || !dirty} onClick={() => setDraft(bestXiDraft(rows))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <p className="note">
        Схема как на странице сезона: три центральных защитника и полузащитника, два нападающих — заполняйте только нужные
        места. Игрок выбирается из заявки сезона; уже поставленный в сборную в других местах недоступен.
      </p>
    </>
  );
}
