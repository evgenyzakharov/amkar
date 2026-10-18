import { useState } from 'react';
import { Card, ScopeSwitch } from '../components/cards';
import { LoadStatus } from '../components/common';
import { MilestoneClubs } from '../components/MilestoneClubs';
import { loadLeaders } from '../db/queries';
import type { CareerStats } from '../db/types';
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
        <MilestoneClubs careers={state.data} />
      ) : (
        <>
          <div className="card-row">
            {/* key со scope: при смене фильтра таблица снова показывает топ */}
            <LeaderTable
              key={`games-${scope}`}
              title="По играм"
              column="Игры"
              rows={rank(state.data, (p) => (league ? p.games_league : p.games))}
            />
            <LeaderTable
              key={`goals-${scope}`}
              title="По голам"
              column="Голы"
              rows={rank(state.data, (p) => (league ? p.goals_league : p.goals))}
            />
          </div>
          <p className="note">
            {league ? 'Только матчи чемпионата.' : 'Чемпионат, кубок, еврокубки и стыковые матчи.'} Товарищеские не в
            счёт. Голы — итоги сезонов из таблицы автора, а где голы внесены по матчам — по карточкам матчей. Одинаковые
            значения делят место.
          </p>
        </>
      )}
    </div>
  );
}

function LeaderTable({ title, column, rows }: { title: string; column: string; rows: Ranked[] }) {
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
                  <th scope="col" className="num">
                    Место
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
                  <tr key={r.player.player_id}>
                    <td className="num rank">{r.rank}</td>
                    <td>
                      <a href={playerHref(r.player.player_id)}>{r.player.display_name}</a>
                    </td>
                    <td className="num value">{r.value}</td>
                    <td className="muted">
                      {r.player.first_year === r.player.last_year
                        ? r.player.first_year
                        : `${r.player.first_year}–${r.player.last_year}`}
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
