import { useMemo, useState } from 'react';
import { LoadStatus } from '../components/common';
import { DIRECTION_LABEL, TRANSFER_KIND_LABEL, WINDOW_LABEL } from '../format';
import { useLoad } from '../load';
import { playerHref } from '../router';
import { confirmDiscard } from '../leaveGuard';
import { dbErrorMessage } from './dbErrors';
import { findTeam } from './match';
import { loadTransfersEditor, type TransfersEditorData } from './queries';
import type { SquadPlayerInfo } from './squad';
import {
  isTransfersDirty,
  newTransferKey,
  saveTransfers,
  transfersDraft,
  validateTransfers,
  windowByDate,
  type Direction,
  type TransferDraft,
  type TransferKind,
} from './transfers';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

export function TransfersEditor({ label }: { label: string }) {
  const state = useLoad(label, loadTransfersEditor);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <Transfers key={label} initial={state.data} />;
}

/** «Попов (1996 – 2013/14)» — однофамильцев различаем по сезонам. */
const playerOption = (p: SquadPlayerInfo) =>
  `${p.display_name}${p.seasons.length ? ` (${p.seasons.length === 1 ? p.seasons[0] : `${p.seasons[0]} – ${p.seasons.at(-1)}`})` : ''}`;

type Status = { kind: 'ok' | 'error'; text: string };

function Transfers({ initial }: { initial: TransfersEditorData }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<TransferDraft[]>(() => transfersDraft(initial.base));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const { base, players, squadIds } = data;

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id: number) => byId.get(id)?.display_name ?? `игрок №${id}`;
  const { errors, warnings } = validateTransfers(draft, base, nameOf);
  const dirty = isTransfersDirty(draft, base);
  useUnsavedGuard(dirty);


  const update = (k: string, patch: Partial<TransferDraft>) =>
    setDraft((d) =>
      d.map((t) => {
        if (t.key !== k) return t;
        const next = { ...t, ...patch };
        // дата есть, окна нет — окно по месяцу
        if (patch.transfer_date && !next.transfer_window) next.transfer_window = windowByDate(patch.transfer_date) ?? '';
        return next;
      }),
    );
  const add = (direction: Direction) =>
    setDraft((d) => [
      ...d,
      { key: newTransferKey(), id: null, player_id: '', direction, transfer_window: '', transfer_date: '', kind: '', club: '', notes: '' },
    ]);

  async function save() {
    setSaving(true);
    setStatus(null);
    const out = await saveTransfers(supabaseWriter, base, draft);
    if (out.error) {
      setData({ ...data, base: out.base });
      setDraft(out.draft);
      setStatus({ kind: 'error', text: dbErrorMessage(out.error) });
      setSaving(false);
      return;
    }
    try {
      const fresh = await loadTransfersEditor(base.season.label);
      setData(fresh);
      setDraft(transfersDraft(fresh.base));
      setStatus({ kind: 'ok', text: 'Сохранено.' });
    } catch (e) {
      setData({ ...data, base: out.base });
      setDraft(out.draft);
      setStatus({ kind: 'ok', text: `Сохранено, но перечитать трансферы не удалось: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  return (
    <>
      <datalist id="admin-transfer-teams">
        {base.teams.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
      {draft.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table edit-table transfers-edit">
            <thead>
              <tr>
                <th>Окно</th>
                <th></th>
                <th>Дата</th>
                <th>Игрок</th>
                <th>Вид</th>
                <th title="откуда пришёл или куда ушёл">Клуб</th>
                <th>Заметки</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((t) => {
                const name = t.player_id ? nameOf(Number(t.player_id)) : 'новый трансфер';
                const club = t.club.trim();
                return (
                  <tr key={t.key} className={t.direction === 'in' ? 'transfer-in' : 'transfer-out'}>
                    <td>
                      <select
                        aria-label={`${name}: окно`}
                        value={t.transfer_window}
                        onChange={(e) => update(t.key, { transfer_window: e.target.value as TransferDraft['transfer_window'] })}
                      >
                        <option value="">—</option>
                        <option value="winter">{WINDOW_LABEL.winter}</option>
                        <option value="summer">{WINDOW_LABEL.summer}</option>
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`${name}: пришёл или ушёл`}
                        value={t.direction}
                        onChange={(e) => update(t.key, { direction: e.target.value as Direction })}
                      >
                        <option value="in">{DIRECTION_LABEL.in}</option>
                        <option value="out">{DIRECTION_LABEL.out}</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        aria-label={`${name}: дата`}
                        value={t.transfer_date}
                        onChange={(e) => update(t.key, { transfer_date: e.target.value })}
                      />
                    </td>
                    <td>
                      {t.id != null ? (
                        <a href={playerHref(Number(t.player_id))}>{name}</a>
                      ) : (
                        <PlayerPicker players={players} squadIds={squadIds} value={t.player_id} onPick={(id) => update(t.key, { player_id: id })} />
                      )}
                    </td>
                    <td>
                      <select
                        aria-label={`${name}: вид`}
                        value={t.kind}
                        onChange={(e) => update(t.key, { kind: e.target.value as '' | TransferKind })}
                      >
                        <option value="">—</option>
                        {(Object.keys(TRANSFER_KIND_LABEL) as TransferKind[]).map((k) => (
                          <option key={k} value={k}>
                            {TRANSFER_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        list="admin-transfer-teams"
                        aria-label={`${name}: клуб`}
                        title={club && !findTeam(base.teams, club) ? 'нет в справочнике — сохранится текстом' : undefined}
                        className={club && !findTeam(base.teams, club) ? 'as-text' : undefined}
                        value={t.club}
                        onChange={(e) => update(t.key, { club: e.target.value })}
                      />
                    </td>
                    <td>
                      <input aria-label={`${name}: заметки`} value={t.notes} onChange={(e) => update(t.key, { notes: e.target.value })} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        title="удалить трансфер"
                        onClick={() => setDraft((d) => d.filter((x) => x.key !== t.key))}
                      >
                        удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Трансферов в этом сезоне не записано.</p>
      )}
      <p className="button-row">
        <button type="button" onClick={() => add('in')}>
          + приход
        </button>
        <button type="button" onClick={() => add('out')}>
          + уход
        </button>
      </p>

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
          <button type="button" disabled={saving || !dirty} onClick={() => confirmDiscard() && setDraft(transfersDraft(base))}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>
      <p className="note">
        Клуб — из справочника соперников или текстом: незнакомое название сохранится текстом (поле с пунктиром) и в
        справочник само не попадёт. Окно по дате ставится само, если не выбрано: декабрь — март — зима, июнь — сентябрь —
        лето.
      </p>
    </>
  );
}

const norm = (s: string) => s.trim().toLowerCase().replaceAll('ё', 'е');

/** Игрок новой строки — поиском по фамилии или имени, как в заявке: в базе сотни игроков. Сначала — заявка сезона. */
function PlayerPicker({
  players,
  squadIds,
  value,
  onPick,
}: {
  players: SquadPlayerInfo[];
  squadIds: Set<number>;
  value: string;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const chosen = value ? players.find((p) => p.id === Number(value)) : undefined;
  if (chosen) {
    return (
      <span className="nowrap">
        {playerOption(chosen)}{' '}
        <button type="button" className="link-button" onClick={() => onPick('')}>
          другой
        </button>
      </span>
    );
  }
  const q = norm(query);
  const found =
    q.length < 2
      ? []
      : players
          .filter((p) => [p.display_name, p.last_name, p.first_name ?? ''].some((x) => norm(x).includes(q)))
          .sort((a, b) => Number(squadIds.has(b.id)) - Number(squadIds.has(a.id)) || a.display_name.localeCompare(b.display_name, 'ru'))
          .slice(0, 8);
  return (
    <div className="player-picker">
      <input aria-label="игрок: поиск" placeholder="Фамилия — от двух букв" value={query} onChange={(e) => setQuery(e.target.value)} />
      {found.length > 0 && (
        <ul className="search-results">
          {found.map((p) => (
            <li key={p.id}>
              <button type="button" className="link-button" onClick={() => onPick(String(p.id))}>
                {playerOption(p)}
              </button>
              {squadIds.has(p.id) && <span className="muted"> · в заявке</span>}
            </li>
          ))}
        </ul>
      )}
      {q.length >= 2 && found.length === 0 && <p className="muted">Не нашлось. Нового игрока заводят на вкладке «Заявка».</p>}
    </div>
  );
}
