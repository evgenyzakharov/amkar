// Тепловая карта сезона: матрица «игроки × матчи», как в таблице автора, цвет — по минутам
import { useState, type MouseEvent } from 'react';
import { loadSeasonGrid } from '../db/queries';
import type { GridAbsence, GridAppearance, PlayerSeasonStats, SeasonMatch } from '../db/types';
import { ABSENCE_LABEL, RESULT_LABEL, RESULT_TITLE, opponentName } from '../format';
import { useLoad } from '../load';
import { matchHref, playerHref } from '../router';

/** Буква пропуска в клетке: травма, дисквалификация, сборная. */
const ABSENCE_LETTER = { injury: 'Т', suspension: 'Д', national_team: 'С' } as const;

/** Ступень цвета по минутам: 0 — в запасе, дальше четыре ступени до полного матча. */
function minutesStep(minutes: number): string {
  if (minutes <= 0) return 'hm-0';
  if (minutes < 30) return 'hm-1';
  if (minutes < 60) return 'hm-2';
  if (minutes < 90) return 'hm-3';
  return 'hm-4';
}

interface Cell {
  className: string;
  text: string;
  info: string;
}

function cellOf(a: GridAppearance | undefined, ab: GridAbsence | undefined): Omit<Cell, 'info'> & { what: string } {
  if (a) {
    const marks = `${a.sent_off ? ' hm-red' : ''}${a.injured ? ' hm-inj' : ''}`;
    const events = [a.sent_off && 'удалён', a.injured && 'травма в матче'].filter(Boolean).join(', ');
    const tail = events ? `, ${events}` : '';
    if (a.minutes == null) return { className: `hm-unknown${marks}`, text: '?', what: `в заявке, минуты неизвестны${tail}` };
    if (a.minutes === 0 || a.role === 'bench') return { className: `hm-0${marks}`, text: '0', what: `в запасе${tail}` };
    const role = a.role === 'start' ? ', в старте' : a.role === 'sub' ? ', вышел на замену' : '';
    return { className: `${minutesStep(a.minutes)}${marks}`, text: String(a.minutes), what: `${a.minutes} мин${role}${tail}` };
  }
  if (ab) return { className: 'hm-abs', text: ABSENCE_LETTER[ab.reason], what: `пропустил: ${ABSENCE_LABEL[ab.reason].toLowerCase()}` };
  return { className: '', text: '', what: 'не в заявке' };
}

export function SeasonHeatmap({
  seasonId,
  matches,
  squad,
}: {
  seasonId: number;
  matches: SeasonMatch[];
  squad: PlayerSeasonStats[];
}) {
  const state = useLoad(seasonId, loadSeasonGrid);
  const [picked, setPicked] = useState<{ key: string; info: string } | null>(null);

  if (state.status === 'loading') return <p className="muted">Загрузка карты…</p>;
  if (state.status === 'error') return <p className="error">Карта минут не загрузилась: {state.message}</p>;

  const key = (playerId: number, matchId: number) => `${playerId}:${matchId}`;
  const apps = new Map(state.data.appearances.map((a) => [key(a.player_id, a.match_id), a]));
  const absences = new Map(state.data.absences.map((a) => [key(a.player_id, a.match_id), a]));
  const involved = new Set([...state.data.appearances, ...state.data.absences].map((a) => a.player_id));
  // Строки — как в заявке: основной состав, потом молодёжь; без тех, кто ни разу не попал в заявку на матч
  const rows = [
    ...squad.filter((p) => p.squad_group === 'main'),
    ...squad.filter((p) => p.squad_group === 'youth'),
  ].filter((p) => involved.has(p.player_id));

  if (rows.length === 0) return <p className="muted">По матчам этого сезона составы не записаны.</p>;

  // Подсказка по клику (на телефоне наведения нет); на компьютере то же — во всплывающей подсказке
  const onClick = (e: MouseEvent<HTMLTableElement>) => {
    const td = (e.target as HTMLElement).closest<HTMLTableCellElement>('td[data-key]');
    if (td) setPicked({ key: td.dataset.key ?? '', info: td.title });
  };

  return (
    <>
      <HeatmapLegend />
      <p className="hm-picked" aria-live="polite">
        {picked?.info ?? 'Нажмите на клетку — покажу соперника и минуты.'}
      </p>
      <div className="hm-wrap">
        <table className="heatmap" onClick={onClick}>
          <thead>
            <tr>
              <th scope="col" className="hm-name">
                Игрок
              </th>
              {matches.map((m) => {
                const result = m.result ? RESULT_TITLE[m.result] : 'результат неизвестен';
                const other = m.competition.kind === 'league' ? '' : ` (${m.competition.name})`;
                return (
                  <th key={m.id} scope="col" className="hm-col">
                    <a href={matchHref(m.id)} title={`${m.seq}. ${opponentName(m)}${other} — ${result}`}>
                      <span className="hm-seq">{m.seq}</span>
                      <span
                        className={`hm-res tone-${m.result ?? 'unknown'}${m.competition.kind === 'league' ? '' : ' ringed'}`}
                      >
                        {m.result ? RESULT_LABEL[m.result] : '?'}
                      </span>
                    </a>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.player_id}>
                <th scope="row" className="hm-name">
                  <a href={playerHref(p.player_id)}>
                    {p.shirt_number != null && <span className="muted">{p.shirt_number} </span>}
                    {p.display_name}
                  </a>
                </th>
                {matches.map((m) => {
                  const k = key(p.player_id, m.id);
                  const c = cellOf(apps.get(k), absences.get(k));
                  return (
                    <td
                      key={m.id}
                      data-key={k}
                      className={`${c.className}${picked?.key === k ? ' hm-picked-cell' : ''}`}
                      title={`${p.display_name} · ${m.seq}. ${opponentName(m)} — ${c.what}`}
                    >
                      {c.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HeatmapLegend() {
  const steps: [string, string, string][] = [
    ['', '', 'не в заявке'],
    ['hm-0', '0', 'в запасе'],
    ['hm-1', '15', '1–29 мин'],
    ['hm-2', '45', '30–59'],
    ['hm-3', '75', '60–89'],
    ['hm-4', '90', 'весь матч'],
  ];
  return (
    <ul className="hm-legend" aria-label="Обозначения">
      {steps.map(([cls, text, label]) => (
        <li key={label}>
          <span className={`hm-swatch ${cls}`}>{text}</span>
          {label}
        </li>
      ))}
      <li>
        <span className="hm-swatch hm-abs">Т</span>
        <span className="hm-swatch hm-abs">Д</span>
        <span className="hm-swatch hm-abs">С</span>
        пропуск: травма, дисквалификация, сборная
      </li>
      <li>
        <span className="hm-swatch hm-3 hm-red">75</span>удалён
      </li>
      <li>
        <span className="hm-swatch hm-3 hm-inj">75</span>травма в матче
      </li>
    </ul>
  );
}
