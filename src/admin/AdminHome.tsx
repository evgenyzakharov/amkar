import { useState } from 'react';
import { LoadStatus } from '../components/common';
import { loadSeasons } from '../db/queries';
import type { Season } from '../db/types';
import { goWithoutAsking } from '../leaveGuard';
import { useDocumentTitle, useLoad } from '../load';
import { adminChecksHref, adminCoachesHref, adminPlayersHref, adminPointsHref, adminSeasonHref, adminTeamsHref } from '../router';
import { dbErrorMessage } from './dbErrors';
import { createSeason, suggestNewSeason, validateNewSeason, type NewSeasonDraft } from './newSeason';
import { loadSquadToCopy } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

const loadAll = () => loadSeasons();

export function AdminHome() {
  const state = useLoad(null, loadAll);
  const [adding, setAdding] = useState(false);
  useDocumentTitle('Админка');
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  // Свежие сезоны сверху: вводить чаще всего придётся текущий
  const seasons = [...state.data].reverse();
  return (
    <>
      <h2>Админка</h2>
      <p className="button-row">
        <a className="button" href={adminTeamsHref}>
          Соперники
        </a>
        <a className="button" href={adminCoachesHref}>
          Тренеры
        </a>
        <a className="button" href={adminPlayersHref}>
          Игроки
        </a>
        <a className="button" href={adminPointsHref}>
          Формула очков
        </a>
        <a className="button" href={adminChecksHref}>
          Проверка данных
        </a>
      </p>
      <section>
        <h3>Сезоны</h3>
        {adding ? (
          <NewSeasonForm seasons={state.data} onCancel={() => setAdding(false)} />
        ) : (
          <p>
            <button type="button" onClick={() => setAdding(true)}>
              + сезон
            </button>
          </p>
        )}
        <ul className="season-list">
          {seasons.map((s) => (
            <li key={s.id}>
              <a className="season-label" href={adminSeasonHref(s.label)}>
                {s.label}
              </a>
              {s.division && <span className="muted"> · {s.division}</span>}
              {(s.matches?.[0]?.count ?? 0) === 0 && <span className="muted"> · матчей нет, на сайте не виден</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Новый сезон: метка и годы — по прошлому, заявка прошлого — переносом без ушедших. */
function NewSeasonForm({ seasons, onCancel }: { seasons: Season[]; onCancel: () => void }) {
  const last = seasons.at(-1);
  const [draft, setDraft] = useState<NewSeasonDraft>(() => suggestNewSeason(last));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validateNewSeason(draft, seasons);
  useUnsavedGuard(true);
  const set = <K extends keyof NewSeasonDraft>(key: K, value: NewSeasonDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const field = (key: 'label' | 'start_year' | 'end_year' | 'tier' | 'teams_count' | 'division', label: string, className?: string) => (
    <label className={className}>
      {label}
      <input value={draft[key]} onChange={(e) => set(key, e.target.value)} />
    </label>
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const squad = draft.copySquad && last ? await loadSquadToCopy(last.id) : [];
      const label = await createSeason(supabaseWriter, draft, squad);
      goWithoutAsking(adminSeasonHref(label));
    } catch (e) {
      setError(dbErrorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="card new-season">
      <h4>Новый сезон</h4>
      <div className="form-grid">
        {field('label', 'Метка')}
        {field('start_year', 'Год начала')}
        {field('end_year', 'Год окончания')}
        {field('tier', 'Уровень (1 — высший)')}
        {field('division', 'Лига', 'span-2')}
        {field('teams_count', 'Команд')}
      </div>
      {last && (
        <label className="new-season-copy">
          <input type="checkbox" checked={draft.copySquad} onChange={(e) => set('copySquad', e.target.checked)} /> Перенести заявку {last.label} — без
          тех, у кого в нём трансфер «ушёл»: номера, позиции и «аренда» — как были
        </label>
      )}
      <p className="note">Пока в сезоне нет ни одного матча, посетители его не видят. Место, ожидания и ссылки — потом на вкладке «Сезон».</p>
      {errors.length > 0 && (
        <ul className="error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <p className="button-row">
        <button type="button" className="primary" disabled={saving || errors.length > 0} onClick={() => void save()}>
          Завести сезон
        </button>
        <button type="button" disabled={saving} onClick={onCancel}>
          Отмена
        </button>
      </p>
    </div>
  );
}
