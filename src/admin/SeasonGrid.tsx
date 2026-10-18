import { memo, useCallback, useState, type KeyboardEvent } from 'react';
import { LoadStatus } from '../components/common';
import { RESULT_TITLE, formatDate, formatScore, opponentName } from '../format';
import { useLoad } from '../load';
import { adminMatchHref } from '../router';
import { dbErrorMessage } from './dbErrors';
import { cellKey, cellText, changedCells, gridBase, parseCell, planGrid, saveGrid, type GridBase } from './grid';
import type { SquadPlayer } from './match';
import { loadSeasonGrid, type SeasonGridData } from './queries';
import { useUnsavedGuard } from './useUnsavedGuard';
import { supabaseWriter } from './writer';

export function SeasonGrid({ label }: { label: string }) {
  const state = useLoad(label, loadSeasonGrid);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <Grid key={label} initial={state.data} />;
}

const ABSENCE_TITLE = { injury: 'пропуск: травма', suspension: 'пропуск: дисквалификация', national_team: 'пропуск: сборная' };

/** Стрелки и Enter — по ячейкам, как в таблице: вверх-вниз всегда, влево-вправо — от края текста. */
function moveFocus(e: KeyboardEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  const r = Number(input.dataset.r);
  const c = Number(input.dataset.c);
  let [nr, nc] = [r, c];
  if (e.key === 'Enter') nr = e.shiftKey ? r - 1 : r + 1;
  else if (e.key === 'ArrowDown') nr = r + 1;
  else if (e.key === 'ArrowUp') nr = r - 1;
  else if (e.key === 'ArrowRight' && input.selectionEnd === input.value.length) nc = c + 1;
  else if (e.key === 'ArrowLeft' && input.selectionStart === 0) nc = c - 1;
  else return;
  const target = input.closest('table')?.querySelector<HTMLInputElement>(`input[data-r="${nr}"][data-c="${nc}"]`);
  if (target) {
    e.preventDefault();
    target.focus();
  }
}

interface CellProps {
  k: string;
  text: string;
  className: string;
  title: string;
  r: number;
  c: number;
  onEdit: (key: string, text: string) => void;
}

// Ячеек в сезоне больше тысячи: перерисовываем только изменившиеся
const Cell = memo(function Cell({ k, text, className, title, r, c, onEdit }: CellProps) {
  return (
    <td className={className}>
      <input
        value={text}
        title={title}
        aria-label={title}
        data-r={r}
        data-c={c}
        inputMode="numeric"
        onChange={(e) => onEdit(k, e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={moveFocus}
      />
    </td>
  );
});

type Status = { kind: 'ok' | 'error'; text: string };

function Grid({ initial }: { initial: SeasonGridData }) {
  const [data, setData] = useState(initial);
  const [base, setBase] = useState<GridBase>(() => gridBase(initial.appearances, initial.absences));
  const [edits, setEdits] = useState<Map<string, string>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const { season, matches, players } = data;

  const onEdit = useCallback((key: string, text: string) => {
    setEdits((prev) => new Map(prev).set(key, text));
  }, []);

  const nameById = new Map(players.map((p) => [p.player_id, p.display_name]));
  const nameOf = (id: number) => nameById.get(id) ?? `игрок №${id}`;
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const matchLabel = (id: number) => {
    const m = matchById.get(id);
    return m ? `Матч №${m.seq} (${opponentName(m)})` : `Матч ${id}`;
  };
  const changed = new Set(changedCells(base, edits));
  const plan = planGrid(base, edits, nameOf, matchLabel);
  const dirty = changed.size > 0;
  useUnsavedGuard(dirty);

  async function save() {
    setSaving(true);
    setStatus(null);
    const out = await saveGrid(supabaseWriter, base, plan);
    setBase(out.base);
    if (out.error) {
      // Записанное уже в base: эти ячейки перестали быть изменёнными, повтор допишет остальное
      setStatus({ kind: 'error', text: dbErrorMessage(out.error) });
      setSaving(false);
      return;
    }
    const count = changed.size;
    try {
      const fresh = await loadSeasonGrid(season.label);
      setData(fresh);
      setBase(gridBase(fresh.appearances, fresh.absences));
      setEdits(new Map());
      setStatus({ kind: 'ok', text: `Сохранено ячеек: ${count}.` });
    } catch (e) {
      setEdits(new Map());
      setStatus({ kind: 'ok', text: `Сохранено, но перечитать сетку не удалось: ${dbErrorMessage(e)}` });
    }
    setSaving(false);
  }

  /** Текст ячейки сейчас: правка или то, что в базе. */
  const textOf = (key: string) => edits.get(key) ?? cellText(base.appearances.get(key), base.absences.get(key));
  const official = matches.filter((m) => m.competition.kind !== 'friendly');

  function totals(p: SquadPlayer) {
    let games = 0;
    let minutes = 0;
    for (const m of official) {
      const key = cellKey(m.id, p.player_id);
      const cell = parseCell(textOf(key));
      if (cell.kind !== 'minutes') continue;
      const role = edits.has(key) ? null : base.appearances.get(key)?.role;
      if ((cell.minutes ?? 0) > 0 || role === 'start' || role === 'sub') games++;
      minutes += cell.minutes ?? 0;
    }
    return { games, minutes };
  }

  function cellClass(key: string) {
    const a = base.appearances.get(key);
    const b = base.absences.get(key);
    const cls = ['gc'];
    if (a?.sent_off) cls.push('gc-red');
    else if (a?.injured) cls.push('gc-injured');
    else if (b) cls.push(`gc-${b.reason}`);
    if (a?.role === 'sub') cls.push('gc-sub');
    if (changed.has(key)) cls.push(parseCell(edits.get(key)!).kind === 'invalid' ? 'gc-invalid' : 'gc-dirty');
    return cls.join(' ');
  }

  function cellTitle(p: SquadPlayer, m: SeasonGridData['matches'][number], key: string) {
    const a = base.appearances.get(key);
    const b = base.absences.get(key);
    const facts = [
      a?.role === 'start' && 'старт',
      a?.role === 'sub' && (a.minute_on ? `вышел на ${a.minute_on}'` : 'вышел на замену'),
      a?.role === 'bench' && 'запас',
      a?.sent_off && 'удалён',
      a?.injured && 'травма в матче',
      b && ABSENCE_TITLE[b.reason],
    ].filter(Boolean);
    return `${p.display_name} — №${m.seq} ${opponentName(m)}${facts.length ? `: ${facts.join(', ')}` : ''}`;
  }

  const groupOf = (p: SquadPlayer) => (!p.inSquad ? 'Нет в заявке сезона' : p.squad_group === 'youth' ? 'Молодёжь' : null);
  const onPitch = (matchId: number) =>
    players.filter((p) => {
      const cell = parseCell(textOf(cellKey(matchId, p.player_id)));
      return cell.kind === 'minutes' && (cell.minutes ?? 0) > 0;
    }).length;

  if (matches.length === 0) return <p className="muted">В сезоне нет матчей.</p>;

  return (
    <>
      <div className="grid-wrap">
        <table className="season-grid">
          <thead>
            <tr>
              <th className="gp">Игрок</th>
              {matches.map((m) => (
                <th
                  key={m.id}
                  className={`gh gh-${m.result ?? 'none'} gh-${m.competition.kind}`}
                  title={[
                    `№${m.seq} ${opponentName(m)}`,
                    m.competition.name,
                    m.match_date && formatDate(m.match_date),
                    m.result && RESULT_TITLE[m.result],
                    formatScore(m),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  <a href={adminMatchHref(m.id)}>
                    <span className="gh-seq">{m.seq}</span>
                    <span className="gh-name">{opponentName(m)}</span>
                  </a>
                </th>
              ))}
              <th className="gt" title="игры без товарищеских">
                И
              </th>
              <th className="gt" title="минуты без товарищеских">
                Мин
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, r) => {
              const group = groupOf(p);
              const header =
                group !== (r > 0 ? groupOf(players[r - 1]) : null) ? (
                  <tr className="group-row" key={`g-${group}`}>
                    <th className="gp" colSpan={1}>
                      {group}
                    </th>
                  </tr>
                ) : null;
              const t = totals(p);
              return [
                header,
                <tr key={p.player_id}>
                  <th className="gp">
                    <span className="muted">{p.shirt_number ?? ''}</span> {p.display_name}
                  </th>
                  {matches.map((m, c) => {
                    const key = cellKey(m.id, p.player_id);
                    return (
                      <Cell
                        key={m.id}
                        k={key}
                        text={textOf(key)}
                        className={cellClass(key)}
                        title={cellTitle(p, m, key)}
                        r={r}
                        c={c}
                        onEdit={onEdit}
                      />
                    );
                  })}
                  <td className="gt">{t.games || ''}</td>
                  <td className="gt">{t.minutes || ''}</td>
                </tr>,
              ];
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="gp" title="сколько игроков с минутами в матче">
                На поле
              </th>
              {matches.map((m) => (
                <td key={m.id} className="gt">
                  {onPitch(m.id) || ''}
                </td>
              ))}
              <td className="gt" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="save-bar">
        {plan.errors.length > 0 && (
          <ul className="error">
            {plan.errors.map((e) => (
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
          <button type="button" className="primary" disabled={saving || !dirty || plan.errors.length > 0} onClick={() => void save()}>
            {saving ? 'Сохранение…' : dirty ? `Сохранить (${changed.size})` : 'Сохранить'}
          </button>
          <button type="button" disabled={saving || edits.size === 0} onClick={() => setEdits(new Map())}>
            Отменить изменения
          </button>
          {!dirty && <span className="muted">Изменений нет.</span>}
        </p>
      </div>

      <p className="note">
        В ячейке — минуты: пусто — не в заявке на матч, 0 — в запасе, «+» — в заявке, минуты неизвестны. Пропуск матча —
        буквой: т — травма, д — дисквалификация, с — сборная. Курсивом — вышедшие на замену; красным — удаление, розовым
        — травма. Минуты, введённые здесь, не трогают роль и замены из карточки матча: 0 делает игрока запасным, минуты
        у запасного — «роль неизвестна». Стрелки и Enter переходят по ячейкам.
      </p>
    </>
  );
}
