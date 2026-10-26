import { useState } from 'react';
import { Card, ScopeSwitch } from '../components/cards';
import { LoadStatus } from '../components/common';
import { MilestoneClubs } from '../components/MilestoneClubs';
import { loadLeaders } from '../db/queries';
import type { CareerStats } from '../db/types';
import { clubYears } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { leadersHref, playerHref, type LeadersScope, type LeadersTab } from '../router';

// Ключ один: все итоги грузятся разом, фильтр и сортировка — на странице
const ALL = 'all';
const load = () => loadLeaders();

/** Сколько мест показывать до «показать всех». */
const TOP = 50;

interface Ranked {
  rank: number;
  value: number;
  player: CareerStats;
}

/** Места по убыванию значения; одинаковые значения делят место (1, 2, 2, 4). Нули и пустые — не в таблице. */
function rank(players: CareerStats[], value: (p: CareerStats) => number | null): Ranked[] {
  const sorted = players
    .map((player) => ({ player, value: value(player) ?? 0 }))
    .filter((r) => r.value > 0)
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.player.last_name.localeCompare(b.player.last_name, 'ru') ||
        a.player.display_name.localeCompare(b.player.display_name, 'ru'),
    );
  let place = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.value !== sorted[i - 1].value) place = i + 1;
    return { ...r, rank: place };
  });
}

export function LeadersPage({ scope, tab }: { scope: LeadersScope; tab: LeadersTab }) {
  useDocumentTitle('Лидеры');
  const state = useLoad(ALL, load);
  const league = scope === 'league';
  // Только действующие: места остаются как в общей таблице — видно, где игрок в истории клуба
  const [onlyCurrent, setOnlyCurrent] = useState(false);

  return (
    <div className="card-page">
      <div className="page-head">
        <h1 className="page-title">Лидеры</h1>
        {/* в клубах считаются все официальные матчи — фильтра нет */}
        {tab === 'tables' && <ScopeSwitch scope={scope} href={leadersHref} />}
      </div>
      <nav className="page-tabs" aria-label="Разделы лидеров">
        <a href={leadersHref(scope)} className={tab === 'tables' ? 'active' : undefined}>
          Игры и голы
        </a>
        <a href={leadersHref('all', 'clubs')} className={tab === 'clubs' ? 'active' : undefined}>
          Клубы 100, 200, 300
        </a>
      </nav>

      {state.status !== 'ready' ? (
        <LoadStatus state={state} />
      ) : tab === 'clubs' ? (
        <MilestoneClubs careers={state.data.careers} />
      ) : (
        <>
          {state.data.current.size > 0 && (
            <label className="current-filter">
              <input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} /> Только действующие игроки
            </label>
          )}
          <div className="card-row">
            {/* key со scope: при смене фильтра таблица снова показывает топ */}
            <LeaderTable
              key={`games-${scope}-${onlyCurrent}`}
              title="По играм"
              column="Игры"
              current={state.data.current}
              rows={only(rank(state.data.careers, (p) => (league ? p.games_league : p.games)), onlyCurrent && state.data.current)}
            />
            <LeaderTable
              key={`goals-${scope}-${onlyCurrent}`}
              title="По голам"
              column="Голы"
              current={state.data.current}
              rows={only(rank(state.data.careers, (p) => (league ? p.goals_league : p.goals)), onlyCurrent && state.data.current)}
            />
          </div>
          <p className="note">
            {league ? 'Только матчи чемпионата.' : 'Чемпионат, кубок, еврокубки и стыковые матчи.'} Товарищеские не в
            счёт.{state.data.current.size > 0 && ' Подсвечены действующие игроки.'}
          </p>
        </>
      )}
    </div>
  );
}

/** Только действующие — если фильтр включён. */
const only = (rows: Ranked[], current: Set<number> | false) => (current ? rows.filter((r) => current.has(r.player.player_id)) : rows);

function LeaderTable({ title, column, rows, current }: { title: string; column: string; rows: Ranked[]; current: Set<number> }) {
  const [all, setAll] = useState(false);
  const top = rows.filter((r) => r.rank <= TOP);
  const shown = all ? rows : top;

  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="muted">Данных нет.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table leaders-table">
              <thead>
                <tr>
                  <th scope="col" className="num" title="место">
                    <span className="wide">Место</span>
                    <span className="narrow">#</span>
                  </th>
                  <th scope="col">Игрок</th>
                  <th scope="col" className="num">
                    {column}
                  </th>
                  <th scope="col">В клубе</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.player.player_id} className={current.has(r.player.player_id) ? 'current-row' : undefined}>
                    <td className="num rank">{r.rank}</td>
                    <td>
                      <a href={playerHref(r.player.player_id)}>{r.player.display_name}</a>
                    </td>
                    <td className="num value">{r.value}</td>
                    <td className="muted years">
                      <span className="wide">{clubYears(r.player.first_year, r.player.last_year, current.has(r.player.player_id))}</span>
                      <span className="narrow">{clubYears(r.player.first_year, r.player.last_year, current.has(r.player.player_id), true)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > top.length && (
            <button type="button" className="show-all" onClick={() => setAll(!all)}>
              {all ? `Только первые ${TOP} мест` : `Показать всех (${rows.length})`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
