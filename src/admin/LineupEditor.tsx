import { useState } from 'react';
import { POSITION_LABEL } from '../format';
import {
  EMPTY_ROW,
  computeMinutes,
  isAppearance,
  rowMinutes,
  updateRow,
  type Lineup,
  type LineupRow,
  type LineupStatus,
  type SquadPlayer,
} from './match';

const STATUS_LABEL: Record<Exclude<LineupStatus, ''>, string> = {
  start: 'старт',
  sub: 'замена',
  bench: 'запас',
  unknown: 'играл, роль неизвестна',
  injury: 'пропуск: травма',
  suspension: 'пропуск: дисквалификация',
  national_team: 'пропуск: сборная',
};

interface Props {
  lineup: Lineup;
  squad: SquadPlayer[];
  end: number;
  onChange: (update: (lineup: Lineup) => Lineup) => void;
}

export function LineupEditor({ lineup, squad, end, onChange }: Props) {
  const [onlyMatch, setOnlyMatch] = useState(false);
  const rowOf = (id: number): LineupRow => lineup[id] ?? EMPTY_ROW;
  const nameOf = new Map(squad.map((p) => [p.player_id, p.display_name]));
  const set = (id: number, patch: Partial<LineupRow>) => onChange((old) => updateRow(old, id, patch));

  const count = (pred: (s: LineupStatus) => boolean) => squad.filter((p) => pred(rowOf(p.player_id).status)).length;
  const summary = [
    `старт ${count((s) => s === 'start')}`,
    `замены ${count((s) => s === 'sub')}`,
    `запас ${count((s) => s === 'bench')}`,
    count((s) => s === 'unknown') > 0 && `роль неизвестна ${count((s) => s === 'unknown')}`,
    `пропуски ${count((s) => s === 'injury' || s === 'suspension' || s === 'national_team')}`,
  ].filter(Boolean);

  // На поле в этом матче: кого мог заменить вышедший на замену
  const onPitch = squad.filter((p) => ['start', 'sub', 'unknown'].includes(rowOf(p.player_id).status));
  const replacedBy = new Map<string, number>();
  for (const p of squad) {
    const r = rowOf(p.player_id);
    if (r.status === 'sub' && r.replaced) replacedBy.set(r.replaced, p.player_id);
  }

  const visible = onlyMatch ? squad.filter((p) => rowOf(p.player_id).status !== '') : squad;
  const groupOf = (p: SquadPlayer) => (!p.inSquad ? 'Нет в заявке сезона' : p.squad_group === 'youth' ? 'Молодёжь' : null);

  return (
    <>
      <p className="lineup-summary">
        {summary.join(' · ')}
        <label className="inline">
          <input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} /> только заявка на матч
        </label>
      </p>
      <div className="table-wrap">
        <table className="data-table edit-table lineup-edit">
          <thead>
            <tr>
              <th className="num">№</th>
              <th>Игрок</th>
              <th>В матче</th>
              <th title="минута выхода на замену">Вышел</th>
              <th title="минута, когда заменён или удалён">Ушёл</th>
              <th title="кого заменил">Вместо</th>
              <th title="минуты на поле: считаются по минутам замен, можно ввести вручную">Мин</th>
              <th title="получил травму в этом матче">Травма</th>
              <th title="удалён в этом матче">Удалён</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => {
              const id = p.player_id;
              const r = rowOf(id);
              const group = groupOf(p);
              const playing = isAppearance(r.status);
              const auto = r.minutes === null;
              const minutes = rowMinutes(r, end);
              const replaceable = onPitch.filter((x) => x.player_id !== id);
              const replacedName = r.replaced ? nameOf.get(Number(r.replaced)) : undefined;
              const header =
                group !== (i > 0 ? groupOf(visible[i - 1]) : null) ? (
                  <tr className="group-row" key={`g-${group}`}>
                    <th colSpan={9}>{group}</th>
                  </tr>
                ) : null;
              return [
                header,
                <tr key={id} className={r.status === '' ? 'row-off' : undefined}>
                  <td className="num">{p.shirt_number ?? ''}</td>
                  <td>
                    {p.display_name}
                    {p.position && <span className="muted"> {POSITION_LABEL[p.position]}</span>}
                  </td>
                  <td>
                    <select
                      aria-label={`${p.display_name}: в матче`}
                      value={r.status}
                      onChange={(e) => set(id, { status: e.target.value as LineupStatus })}
                    >
                      <option value="">—</option>
                      {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {r.status === 'sub' && (
                      <input
                        className="w-min"
                        inputMode="numeric"
                        aria-label={`${p.display_name}: минута выхода`}
                        value={r.minute_on}
                        onChange={(e) => set(id, { minute_on: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    {(r.status === 'start' || r.status === 'sub' || r.status === 'unknown') && (
                      <input
                        className="w-min"
                        inputMode="numeric"
                        aria-label={`${p.display_name}: минута ухода`}
                        value={r.minute_off}
                        onChange={(e) => set(id, { minute_off: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    {r.status === 'sub' && (
                      <select
                        aria-label={`${p.display_name}: вместо кого`}
                        value={r.replaced}
                        onChange={(e) => set(id, { replaced: e.target.value })}
                      >
                        <option value="">—</option>
                        {r.replaced && !replaceable.some((x) => String(x.player_id) === r.replaced) && (
                          <option value={r.replaced}>{replacedName ?? `игрок ${r.replaced}`} (нет на поле)</option>
                        )}
                        {replaceable.map((x) => {
                          const by = replacedBy.get(String(x.player_id));
                          return (
                            <option key={x.player_id} value={x.player_id}>
                              {x.display_name}
                              {by != null && by !== id ? ' (уже заменён)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </td>
                  <td className="minutes-cell">
                    {playing && (
                      <>
                        <input
                          className={`w-min${auto ? ' auto' : ''}`}
                          inputMode="numeric"
                          aria-label={`${p.display_name}: минуты на поле`}
                          title={auto ? 'посчитано по минутам замен' : 'введено вручную'}
                          disabled={r.status === 'bench'}
                          value={auto ? (minutes == null ? '' : String(minutes)) : (r.minutes ?? '')}
                          onChange={(e) => set(id, { minutes: e.target.value })}
                        />
                        {!auto && r.status !== 'unknown' && (
                          <button
                            type="button"
                            className="link-button"
                            title={`посчитать по минутам замен: ${computeMinutes(r, end) ?? '?'}`}
                            onClick={() => set(id, { minutes: null })}
                          >
                            ↺
                          </button>
                        )}
                      </>
                    )}
                  </td>
                  <td className="center">
                    {playing && (
                      <input
                        type="checkbox"
                        aria-label={`${p.display_name}: травма в матче`}
                        checked={r.injured}
                        onChange={(e) => set(id, { injured: e.target.checked })}
                      />
                    )}
                  </td>
                  <td className="center">
                    {playing && (
                      <input
                        type="checkbox"
                        aria-label={`${p.display_name}: удалён`}
                        checked={r.sent_off}
                        onChange={(e) => set(id, { sent_off: e.target.checked })}
                      />
                    )}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {squad.length === 0 && (
        <p className="muted">В заявке сезона никого нет — сначала добавьте игроков в заявку.</p>
      )}
    </>
  );
}
