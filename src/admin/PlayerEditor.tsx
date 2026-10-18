import { useState } from 'react';
import { LoadStatus, PageNav } from '../components/common';
import type { Position } from '../db/types';
import { LINK_SITES, POSITION_LABEL, POSITION_TITLE, formatDate } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { adminHref, adminPlayerHref, adminPlayersHref, adminSeasonHref, playerHref } from '../router';
import { dbErrorMessage } from './dbErrors';
import { LINK_SITE_KEYS, isPlayerDirty, playerDraft, savePlayer, validatePlayer, type PlayerDraft } from './people';
import { PHOTO_TYPES, photoErrorMessage, removePhoto, replacePhoto, supabasePhotoStore } from './photos';
import { loadAllPlayers, loadPlayerCard, type PlayerCardData } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

const siteLabel = (s: string) => LINK_SITES.find((x) => x.site === s)?.label ?? s;
const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е');
const loadPlayers = () => loadAllPlayers();

/** Все игроки базы с поиском: однофамильцев различают сезоны. */
export function PlayersList() {
  useDocumentTitle('Игроки');
  const state = useLoad(null, loadPlayers);
  const [query, setQuery] = useState('');
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  const q = norm(query.trim());
  const shown = [...state.data]
    .filter((p) => !q || [p.display_name, p.last_name, p.first_name ?? ''].some((s) => norm(s).includes(q)))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'ru') || a.id - b.id);
  return (
    <>
      <PageNav up={<a href={adminHref}>← Админка</a>} />
      <h2>Игроки ({state.data.length})</h2>
      <input aria-label="поиск игрока" placeholder="Фамилия или имя" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="search-results players-admin">
        {shown.slice(0, 200).map((p) => (
          <li key={p.id}>
            <a href={adminPlayerHref(p.id)}>{p.display_name}</a>{' '}
            <span className="muted">
              {[
                p.first_name && `${p.first_name} ${p.last_name}`,
                p.birth_date && `род. ${formatDate(p.birth_date)}`,
                p.seasons.length ? `${p.seasons[0]}${p.seasons.length > 1 ? ` – ${p.seasons.at(-1)}` : ''}` : 'в заявках не было',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      {shown.length > 200 && <p className="muted">Показаны первые 200 — уточните поиск.</p>}
      <p className="note">Нового игрока заводят в заявке сезона: «+ новый игрок».</p>
    </>
  );
}

export function PlayerEditor({ id }: { id: number }) {
  const state = useLoad(id, loadPlayerCard);
  useDocumentTitle(state.status === 'ready' ? `Правка: ${state.data.player.display_name}` : `Игрок №${id}`);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <PlayerForm key={id} initial={state.data} />;
}

function PlayerForm({ initial }: { initial: PlayerCardData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<PlayerDraft>(() => playerDraft(initial.player, initial.links));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const { player, links, seasons } = data;
  const photoUrl = player.photo_path ? supabasePhotoStore.publicUrl(player.photo_path) : null;

  // Фото пишется сразу, отдельно от формы: несохранённые правки формы при этом не теряются
  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    setStatus(null);
    try {
      const path = await replacePhoto(supabaseWriter, supabasePhotoStore, player, file);
      setData((d) => ({ ...d, player: { ...d.player, photo_path: path } }));
      setStatus({ kind: 'ok', text: 'Фото загружено.' });
    } catch (e) {
      setStatus({ kind: 'error', text: photoErrorMessage(e) });
    }
    setPhotoBusy(false);
  }

  async function deletePhoto() {
    if (!window.confirm('Убрать фото игрока?')) return;
    setPhotoBusy(true);
    setStatus(null);
    try {
      await removePhoto(supabaseWriter, supabasePhotoStore, player);
      setData((d) => ({ ...d, player: { ...d.player, photo_path: null } }));
      setStatus({ kind: 'ok', text: 'Фото убрано.' });
    } catch (e) {
      setStatus({ kind: 'error', text: photoErrorMessage(e) });
    }
    setPhotoBusy(false);
  }

  const errors = validatePlayer(draft, siteLabel);
  const dirty = isPlayerDirty(draft, player, links);
  useUnsavedGuard(dirty);
  const set = <K extends keyof PlayerDraft>(key: K, value: PlayerDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await savePlayer(supabaseWriter, player, links, draft);
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
    }
    try {
      const fresh = await loadPlayerCard(player.id);
      setData(fresh);
      setDraft(playerDraft(fresh.player, fresh.links));
    } catch (e) {
      setStatus({ kind: 'error', text: `Не удалось перечитать карточку: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <>
      <PageNav up={<a href={adminPlayersHref}>← Игроки</a>} next={<a href={playerHref(player.id)}>на сайте ›</a>} />
      <h2>{player.display_name}</h2>
      {seasons.length > 0 && (
        <p className="muted">
          В заявках:{' '}
          {seasons.map((s, i) => (
            <span key={s.label}>
              {i > 0 && ', '}
              <a href={adminSeasonHref(s.label, 'squad')}>{s.label}</a>
            </span>
          ))}
        </p>
      )}
      <div className="player-photo-edit">
        {photoUrl ? <img src={photoUrl} alt={`Фото: ${player.display_name}`} /> : <div className="photo-empty">фото нет</div>}
        <div>
          <label className="button">
            {photoBusy ? 'Загрузка…' : photoUrl ? 'Заменить фото' : 'Загрузить фото'}
            <input
              type="file"
              accept={Object.keys(PHOTO_TYPES).join(',')}
              aria-label="файл фото"
              disabled={photoBusy}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void uploadPhoto(file);
              }}
            />
          </label>{' '}
          {photoUrl && (
            <button type="button" className="link-button" disabled={photoBusy} onClick={() => void deletePhoto()}>
              убрать
            </button>
          )}
          <p className="field-note">JPEG, PNG или WebP до 2 МБ. Фото сохраняется сразу; подпись — кнопкой «Сохранить».</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Как показывать
          <input value={draft.display_name} placeholder="Ю. Волков" onChange={(e) => set('display_name', e.target.value)} />
          <span className="field-note">в таблицах; однофамильцев различайте инициалом</span>
        </label>
        <label>
          Фамилия
          <input value={draft.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </label>
        <label>
          Имя
          <input value={draft.first_name} onChange={(e) => set('first_name', e.target.value)} />
        </label>
        <label>
          Отчество
          <input value={draft.middle_name} onChange={(e) => set('middle_name', e.target.value)} />
        </label>
        <label>
          Дата рождения
          <input type="date" value={draft.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
        </label>
        <label>
          Основная позиция
          <select value={draft.position} onChange={(e) => set('position', e.target.value as '' | Position)}>
            <option value="">—</option>
            {(Object.keys(POSITION_LABEL) as Position[]).map((p) => (
              <option key={p} value={p}>
                {POSITION_TITLE[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={draft.academy} onChange={(e) => set('academy', e.target.checked)} /> воспитанник клуба
        </label>
        <label className="span-2">
          Подпись к фото
          <input value={draft.photo_credit} placeholder="Фото: И. Иванов, CC BY-SA 4.0" onChange={(e) => set('photo_credit', e.target.value)} />
          <span className="field-note">автор и лицензия — показывается под фото</span>
        </label>
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
          <button type="button" disabled={saving || !dirty} onClick={() => setDraft(playerDraft(player, links))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <p className="note">Номер, позиция в сезоне и аренда — в заявке сезона. «Воспитанник» — у игрока целиком, во всех сезонах.</p>
    </>
  );
}
