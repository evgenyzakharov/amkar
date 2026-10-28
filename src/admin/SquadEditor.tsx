import { useState } from 'react';
import { LoadStatus } from '../components/common';
import type { Position } from '../db/types';
import { POSITION_LABEL, formatDate } from '../format';
import { useLoad } from '../load';
import { adminPlayerHref, playerHref } from '../router';
import { confirmDiscard } from '../leaveGuard';
import { dbErrorMessage } from './dbErrors';
import { loadSquadEditor, type SquadEditorData } from './queries';
import {
  isSquadDirty,
  newTempId,
  rowName,
  saveSquad,
  squadDraft,
  validateSquad,
  type SquadPlayerInfo,
  type SquadRowDraft,
} from './squad';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

export function SquadEditor({ label }: { label: string }) {
  const state = useLoad(label, loadSquadEditor);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <Squad key={label} initial={state.data} />;
}

const POSITIONS: Position[] = ['GK', 'DF', 'MF', 'FW'];
const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е');

/** «2008–2012, 5 сезонов» — чтобы отличить однофамильцев. */
function seasonsSummary(p: SquadPlayerInfo) {
  if (p.seasons.length === 0) return 'в заявках не было';
  const span = p.seasons.length === 1 ? p.seasons[0] : `${p.seasons[0]} – ${p.seasons.at(-1)}`;
  return `${span}, сезонов: ${p.seasons.length}`;
}

type Status = { kind: 'ok' | 'error'; text: string };

function Squad({ initial }: { initial: SquadEditorData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<SquadRowDraft[]>(() => squadDraft(initial.base));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const { season, base, allPlayers } = data;

  const { errors, warnings } = validateSquad(draft, base);
  const dirty = isSquadDirty(draft, base);
  useUnsavedGuard(dirty);

  const update = (id: number, patch: Partial<SquadRowDraft>) =>
    setDraft((d) => d.map((r) => (r.player_id === id ? { ...r, ...patch } : r)));
  const updateNew = (id: number, patch: Partial<NonNullable<SquadRowDraft['newPlayer']>>) =>
    setDraft((d) => d.map((r) => (r.player_id === id && r.newPlayer ? { ...r, newPlayer: { ...r.newPlayer, ...patch } } : r)));
  const move = (id: number, delta: number) =>
    setDraft((d) => {
      const i = d.findIndex((r) => r.player_id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (id: number) => setDraft((d) => d.filter((r) => r.player_id !== id));
  const addExisting = (p: SquadPlayerInfo) => {
    setDraft((d) => [...d, { player_id: p.id, shirt_number: '', position: '', squad_group: 'main', on_loan: false }]);
    setSearch('');
  };
  const addNew = () => {
    const id = newTempId();
    const last = search.trim();
    setDraft((d) => [
      ...d,
      { player_id: id, shirt_number: '', position: '', squad_group: 'main', on_loan: false, newPlayer: { last_name: last, first_name: '', display_name: '' } },
    ]);
    setSearch('');
  };

  const inDraft = new Set(draft.map((r) => r.player_id));
  const query = norm(search.trim());
  const found =
    query.length < 2
      ? []
      : allPlayers
          .filter((p) => !inDraft.has(p.id))
          .filter((p) => [p.display_name, p.last_name, p.first_name ?? ''].some((s) => norm(s).includes(query)))
          .slice(0, 12);

  async function save() {
    setSaving(true);
    setStatus(null);
    const out = await saveSquad(supabaseWriter, base, draft);
    if (out.error) {
      setData({ ...data, base: out.base });
      setDraft(out.draft);
      setStatus({ kind: 'error', text: dbErrorMessage(out.error) });
      setSaving(false);
      return;
    }
    try {
      const fresh = await loadSquadEditor(season.label);
      setData(fresh);
      setDraft(squadDraft(fresh.base));
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      setData({ ...data, base: out.base });
      setDraft(out.draft);
      setStatus({ kind: 'ok', text: `Сохранено, но перечитать заявку не удалось: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data-table edit-table squad-edit">
          <thead>
            <tr>
              <th title="порядок строк, как в таблице автора"></th>
              <th className="num">№</th>
              <th>Поз.</th>
              <th>Игрок</th>
              <th>Группа</th>
              <th title="в клубе на правах аренды">Аренда</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => {
              const name = rowName(r, base);
              const playedHere = base.inMatches.has(r.player_id);
              return (
                <tr key={r.player_id} className={r.newPlayer ? 'row-new' : undefined}>
                  <td className="nowrap">
                    <button type="button" className="link-button" title="выше" disabled={i === 0} onClick={() => move(r.player_id, -1)}>
                      ↑
                    </button>{' '}
                    <button
                      type="button"
                      className="link-button"
                      title="ниже"
                      disabled={i === draft.length - 1}
                      onClick={() => move(r.player_id, 1)}
                    >
                      ↓
                    </button>
                  </td>
                  <td>
                    <input
                      className="w-num"
                      inputMode="numeric"
                      aria-label={`${name}: номер`}
                      value={r.shirt_number}
                      onChange={(e) => update(r.player_id, { shirt_number: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`${name}: позиция`}
                      value={r.position}
                      onChange={(e) => update(r.player_id, { position: e.target.value as SquadRowDraft['position'] })}
                    >
                      <option value="">—</option>
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {POSITION_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {r.newPlayer ? (
                      <span className="new-player">
                        <input
                          aria-label="фамилия"
                          placeholder="Фамилия"
                          value={r.newPlayer.last_name}
                          onChange={(e) => updateNew(r.player_id, { last_name: e.target.value })}
                        />
                        <input
                          aria-label="имя"
                          placeholder="Имя"
                          value={r.newPlayer.first_name}
                          onChange={(e) => updateNew(r.player_id, { first_name: e.target.value })}
                        />
                        <input
                          aria-label="как показывать"
                          placeholder={`на сайте: ${r.newPlayer.last_name.trim() || 'как фамилия'}`}
                          title="как показывать в таблицах; однофамильцев различайте: «Ю. Волков»"
                          value={r.newPlayer.display_name}
                          onChange={(e) => updateNew(r.player_id, { display_name: e.target.value })}
                        />
                      </span>
                    ) : (
                      <>
                        <a href={playerHref(r.player_id)}>{name}</a>{' '}
                        <a className="edit-link" href={adminPlayerHref(r.player_id)} title="карточка игрока: ФИО, дата рождения, воспитанник, ссылки">
                          ✎
                        </a>
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      aria-label={`${name}: группа`}
                      value={r.squad_group}
                      onChange={(e) => update(r.player_id, { squad_group: e.target.value as SquadRowDraft['squad_group'] })}
                    >
                      <option value="main">основа</option>
                      <option value="youth">молодёжь</option>
                    </select>
                  </td>
                  <td className="center">
                    <input
                      type="checkbox"
                      aria-label={`${name}: аренда`}
                      checked={r.on_loan}
                      onChange={(e) => update(r.player_id, { on_loan: e.target.checked })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      disabled={playedHere}
                      title={playedHere ? 'у игрока есть матчи этого сезона' : 'убрать из заявки'}
                      onClick={() => remove(r.player_id)}
                    >
                      убрать
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {draft.length === 0 && <p className="muted">В заявке никого нет.</p>}

      <section className="squad-add">
        <h3>Добавить в заявку</h3>
        <input
          aria-label="поиск игрока"
          placeholder="Фамилия или имя — от двух букв"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />{' '}
        <button type="button" onClick={addNew}>
          + новый игрок{search.trim() ? ` «${search.trim()}»` : ''}
        </button>
        {found.length > 0 && (
          <ul className="search-results">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" className="link-button" onClick={() => addExisting(p)}>
                  {p.display_name}
                </button>{' '}
                <span className="muted">
                  {[p.first_name && `${p.first_name} ${p.last_name}`, p.birth_date && `род. ${formatDate(p.birth_date)}`, seasonsSummary(p)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {query.length >= 2 && found.length === 0 && <p className="muted">Не нашлось — заведите нового игрока.</p>}
      </section>

      <div className="save-bar">
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
        {status && (
          <p className={status.kind === 'error' ? 'error' : 'ok'} role="status">
            {status.text}
          </p>
        )}
        <p className="button-row">
          <button type="button" className="primary" disabled={saving || !dirty || errors.length > 0} onClick={() => void save()}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" disabled={saving || !dirty} onClick={() => confirmDiscard() && setDraft(squadDraft(base))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <p className="note">
        Порядок строк — как в заявке на сайте. «Воспитанник» — в карточке игрока (ссылка у фамилии), сразу для всех сезонов.
        Игрока с матчами этого сезона из заявки не убрать — сначала уберите его из составов.
      </p>
    </>
  );
}
