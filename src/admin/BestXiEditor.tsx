import { useState } from 'react';
import { LoadStatus } from '../components/common';
import { FORMATIONS, formationOf, SLOT_LABEL, SLOT_TITLE } from '../format';
import { useLoad } from '../load';
import { dbErrorMessage } from './dbErrors';
import {
  bestXiDraft,
  isBestXiDirty,
  placePlayer,
  saveBestXi,
  slotsOutside,
  switchFormation,
  validateBestXi,
  type BestXiDraft,
  type FormationSwitch,
  type Slot,
} from './people';
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
  const [formation, setFormation] = useState(initial.formation);
  const [moved, setMoved] = useState<FormationSwitch['moved']>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { season, rows, players } = data;

  const nameOf = (id: number) => players.find((p) => p.id === id)?.display_name ?? `игрок №${id}`;
  const lines = formationOf(formation).lines as Slot[][];
  const outside = slotsOutside(draft, formation);
  const errors = validateBestXi(draft, formation, nameOf);
  const dirty = isBestXiDirty(draft, formation, rows, data.formation);
  useUnsavedGuard(dirty);
  const chosen = new Set(lines.flat().map((s) => draft[s]).filter(Boolean));

  function changeFormation(next: string) {
    const result = switchFormation(draft, next);
    setDraft(result.draft);
    setFormation(next);
    // ЦЗ3 → ЦЗ2 на поле не видно — о таких не пишем
    setMoved(result.moved.filter((m) => SLOT_LABEL[m.from] !== SLOT_LABEL[m.to]));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const after = await saveBestXi(supabaseWriter, season.id, rows, data.formation, draft, formation);
      setData({ ...data, rows: after, formation });
      setDraft(bestXiDraft(after));
      setMoved([]);
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

  function reset() {
    setDraft(bestXiDraft(rows));
    setFormation(data.formation);
    setMoved([]);
  }

  return (
    <>
      <p className="formation-pick">
        <label htmlFor="best-xi-formation">Схема</label>
        <select id="best-xi-formation" value={formation} onChange={(e) => changeFormation(e.target.value)}>
          {FORMATIONS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.name}
            </option>
          ))}
        </select>
      </p>
      <div className="pitch best-xi-edit">
        {lines.map((line) => (
          <div className="pitch-line" key={line.join()}>
            {line.map((slot) => (
              <label key={slot} className="pitch-player">
                <span className="pitch-slot" title={SLOT_TITLE[SLOT_LABEL[slot]]}>
                  {SLOT_LABEL[slot]}
                </span>
                <select
                  aria-label={`сборная: ${SLOT_LABEL[slot]} (${slot})`}
                  value={draft[slot]}
                  onChange={(e) => setDraft((d) => placePlayer(d, formation, slot, e.target.value))}
                >
                  <option value="">—</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id} disabled={chosen.has(String(p.id)) && draft[slot] !== String(p.id)}>
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
      {(moved.length > 0 || outside.length > 0) && (
        <div className="formation-change" role="status">
          {moved.length > 0 && (
            <p>
              Перешли на похожие места:{' '}
              {moved.map((m) => `${nameOf(Number(m.playerId))}: ${SLOT_LABEL[m.from]} → ${SLOT_LABEL[m.to]}`).join(', ')}.
            </p>
          )}
          {outside.length > 0 && (
            <p className="warnings">
              Нет места в схеме, снимутся при сохранении:{' '}
              {outside.map((s) => `${nameOf(Number(draft[s]))} (${SLOT_LABEL[s]})`).join(', ')}.
            </p>
          )}
        </div>
      )}
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
          <button type="button" disabled={saving || !dirty} onClick={reset}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <p className="note">
        Места на поле — по выбранной схеме; заполняйте только нужные. При смене схемы игроки переходят на похожие места
        (ЛЗ → ЛФЗ, ОП → ЦП), кому места не нашлось — снимаются при сохранении. «Без схемы» — 13 мест, как в Excel. Игрок
        выбирается из заявки сезона; уже поставленный в сборную на другое место недоступен.
      </p>
    </>
  );
}
