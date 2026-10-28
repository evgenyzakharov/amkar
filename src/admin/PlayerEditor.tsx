import { useEffect, useState, type ReactNode } from 'react';
import { LoadStatus, PageNav } from '../components/common';
import type { Position } from '../db/types';
import { LINK_SITES, POSITION_LABEL, POSITION_TITLE, formatDate } from '../format';
import { errorMessage, useDocumentTitle, useLoad } from '../load';
import { adminHref, adminPlayerHref, adminPlayersHref, adminSeasonHref, playerHref } from '../router';
import { confirmDiscard } from '../leaveGuard';
import { dbErrorMessage } from './dbErrors';
import { LINK_SITE_KEYS, isPlayerDirty, playerDraft, savePlayer, validatePlayer, type PlayerDraft } from './people';
import { PHOTO_TYPES, photoErrorMessage, removePhoto, replacePhoto, supabasePhotoStore } from './photos';
import { adjustmentDraft, isAdjustmentsDirty, saveAdjustments, validateAdjustments, type AdjustmentDraft } from './points';
import { loadAllPlayers, loadPlayerCard, loadPlayerPoints, type PlayerCardData, type PlayerPointsData } from './queries';
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
  const linkUrl = draft.photo_url.trim();

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
    let saved = false;
    try {
      await savePlayer(supabaseWriter, player, links, draft);
      saved = true;
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
    }
    try {
      const fresh = await loadPlayerCard(player.id);
      setData(fresh);
      // После ошибки введённое остаётся в форме: исправить и сохранить ещё раз
      if (saved) setDraft(playerDraft(fresh.player, fresh.links));
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
        {photoUrl ? (
          <img src={photoUrl} alt={`Фото: ${player.display_name}`} />
        ) : linkUrl.startsWith('https://') ? (
          <ExternalPreview key={linkUrl} src={linkUrl} alt={`Фото по ссылке: ${player.display_name}`} />
        ) : (
          <div className="photo-empty">фото нет</div>
        )}
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
          <p className="field-note">
            JPEG, PNG или WebP до 2 МБ. Файл сохраняется сразу; ссылка и подпись — кнопкой «Сохранить».
            {photoUrl && linkUrl && ' Загруженное фото важнее ссылки: ссылка покажется, если фото убрать.'}
          </p>
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
          Ссылка на фото
          <input
            type="url"
            placeholder="https://… — картинка на другом сайте"
            value={draft.photo_url}
            onChange={(e) => set('photo_url', e.target.value)}
          />
          <span className="field-note">без загрузки файла: сайт покажет картинку прямо с источника</span>
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
          <button type="button" disabled={saving || !dirty} onClick={() => confirmDiscard() && setDraft(playerDraft(player, links))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <p className="note">Номер, позиция в сезоне и аренда — в заявке сезона. «Воспитанник» — у игрока целиком, во всех сезонах.</p>
      <AdjustmentsPanel key={player.id} playerId={player.id} />
    </>
  );
}

/** Очки по сезонам и ручные поправки автора: «яркий момент» до +5, «провал» −5. Сохраняются отдельно от карточки. */
function AdjustmentsPanel({ playerId }: { playerId: number }) {
  const [data, setData] = useState<PlayerPointsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdjustmentDraft>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    loadPlayerPoints(playerId).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setDraft(adjustmentDraft(d.seasons, d.adjustments));
      },
      (e: unknown) => alive && setLoadError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [playerId]);

  const dirty = data ? isAdjustmentsDirty(draft, data.seasons, data.adjustments) : false;
  useUnsavedGuard(dirty);
  if (loadError) return <p className="muted">Очки сезона и поправки появятся после миграции 20261020200000_season_points.sql.</p>;
  if (!data) return <p className="muted">Очки сезона…</p>;
  if (data.seasons.length === 0) return null;

  const labelOf = (id: number) => data.seasons.find((s) => s.season_id === id)?.label ?? `сезон №${id}`;
  const errors = validateAdjustments(draft, labelOf);
  const edit = (id: number, field: 'points' | 'comment', value: string) => setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));

  async function save() {
    if (!data) return;
    setSaving(true);
    setStatus(null);
    let saved = false;
    try {
      await saveAdjustments(supabaseWriter, playerId, data.seasons, data.adjustments, draft);
      saved = true;
      setStatus({ kind: 'ok', text: 'Поправки сохранены.' });
    } catch (e) {
      setStatus({ kind: 'error', text: dbErrorMessage(e) });
    }
    try {
      const fresh = await loadPlayerPoints(playerId);
      setData(fresh);
      if (saved) setDraft(adjustmentDraft(fresh.seasons, fresh.adjustments));
    } catch (e) {
      setStatus({ kind: 'error', text: `Не удалось перечитать очки: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <section>
      <h3>Очки сезона и ручные поправки</h3>
      <p className="field-note">
        Поправка прибавляется к очкам сезона: «яркий момент» — до +5 (в одиночку вытащил матч), «провал» — −5. Без комментария не сохранится.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Сезон</th>
              <th className="num">Очки</th>
              <th className="num">Место в сезоне</th>
              <th>Поправка</th>
              <th>За что</th>
            </tr>
          </thead>
          <tbody>
            {data.seasons.map((s) => (
              <tr key={s.season_id}>
                <td>
                  <a href={adminSeasonHref(s.label, 'squad')}>{s.label}</a>
                </td>
                <td className="num">{s.points == null ? '—' : Math.round(s.points)}</td>
                <td className="num">{s.season_rank ?? '—'}</td>
                <td>
                  <input
                    className="w-num"
                    inputMode="decimal"
                    aria-label={`поправка, ${s.label}`}
                    value={draft[s.season_id]?.points ?? ''}
                    onChange={(e) => edit(s.season_id, 'points', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`за что поправка, ${s.label}`}
                    placeholder="в одиночку вытащил матч с …"
                    value={draft[s.season_id]?.comment ?? ''}
                    onChange={(e) => edit(s.season_id, 'comment', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
            {saving ? 'Сохранение…' : 'Сохранить поправки'}
          </button>
          <button type="button" disabled={saving || !dirty} onClick={() => confirmDiscard() && setDraft(adjustmentDraft(data.seasons, data.adjustments))}>
            Отменить изменения
          </button>
        </p>
      </div>
    </section>
  );
}

/** Превью картинки по ссылке: без referer, как на сайте; не открылась — так и пишем. */
function ExternalPreview({ src, alt }: { src: string; alt: string }): ReactNode {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="photo-empty">по ссылке картинка не открывается</div>;
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
