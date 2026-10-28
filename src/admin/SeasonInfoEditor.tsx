import { useState } from 'react';
import { LoadStatus } from '../components/common';
import { LINK_SITES } from '../format';
import { useLoad } from '../load';
import { confirmDiscard } from '../leaveGuard';
import { dbErrorMessage } from './dbErrors';
import { LINK_SITE_KEYS, isSeasonDirty, saveSeason, seasonDraft, validateSeason, type SeasonDraft } from './people';
import { loadSeasonInfo, type SeasonInfoData } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

const siteLabel = (s: string) => LINK_SITES.find((x) => x.site === s)?.label ?? s;

export function SeasonInfoEditor({ label }: { label: string }) {
  const state = useLoad(label, loadSeasonInfo);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <SeasonInfo key={label} initial={state.data} />;
}

function SeasonInfo({ initial }: { initial: SeasonInfoData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<SeasonDraft>(() => seasonDraft(initial.season, initial.links));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { season, links } = data;

  const errors = validateSeason(draft, siteLabel);
  const dirty = isSeasonDirty(draft, season, links);
  useUnsavedGuard(dirty);
  const set = <K extends keyof SeasonDraft>(key: K, value: SeasonDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    setStatus(null);
    let saved = false;
    try {
      await saveSeason(supabaseWriter, season, links, draft);
      saved = true;
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
    }
    try {
      const fresh = await loadSeasonInfo(season.label);
      setData(fresh);
      // После ошибки введённое остаётся в форме: исправить и сохранить ещё раз
      if (saved) setDraft(seasonDraft(fresh.season, fresh.links));
    } catch (e) {
      setStatus({ kind: 'error', text: `Не удалось перечитать сезон: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <>
      <div className="form-grid">
        <label className="span-2">
          Лига
          <input value={draft.division} placeholder="Премьер-лига" onChange={(e) => set('division', e.target.value)} />
          <span className="field-note">как называть на сайте в этом сезоне</span>
        </label>
        <label>
          Уровень
          <input className="w-num" inputMode="numeric" value={draft.tier} onChange={(e) => set('tier', e.target.value)} />
          <span className="field-note">1 — высший дивизион</span>
        </label>
        <label>
          Группа
          <select value={draft.league_group} onChange={(e) => set('league_group', e.target.value as SeasonDraft['league_group'])}>
            <option value="">—</option>
            <option value="gold">«Золото»</option>
            <option value="silver">«Серебро»</option>
          </select>
          <span className="field-note">вторая лига «А»: «Золото» — места 1–10, «Серебро» — 11–20</span>
        </label>
        <label>
          Место
          <input className="w-num" inputMode="numeric" value={draft.final_place} onChange={(e) => set('final_place', e.target.value)} />
        </label>
        <label>
          Команд в лиге
          <input className="w-num" inputMode="numeric" value={draft.teams_count} onChange={(e) => set('teams_count', e.target.value)} />
        </label>
        {draft.expected_place !== null && (
          <label>
            Ждали место
            <input className="w-num" inputMode="decimal" value={draft.expected_place} onChange={(e) => set('expected_place', e.target.value)} />
            <span className="field-note">перед сезоном, для очков сезона; 2,5 — между 2-м и 3-м</span>
          </label>
        )}
        {LINK_SITE_KEYS.map((s) => (
          <label key={s} className="span-2">
            {siteLabel(s)}
            <input
              type="url"
              placeholder="https://…"
              value={draft.links[s]}
              onChange={(e) => setDraft((d) => ({ ...d, links: { ...d.links, [s]: e.target.value } }))}
            />
          </label>
        ))}
        <label className="span-all">
          Заметки
          <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
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
          <button type="button" disabled={saving || !dirty} onClick={() => confirmDiscard() && setDraft(seasonDraft(season, links))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
    </>
  );
}
