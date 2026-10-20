import { useMemo, useState } from 'react';
import { Card, Tiles, type Tile } from '../components/cards';
import { LoadStatus, PageNav } from '../components/common';
import type { Debut } from '../coaches';
import { loadAcademy, type AcademyData } from '../db/queries';
import type { CareerStats, FirstGoal } from '../db/types';
import { ageYears, formatAge, formatDate, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { historyHref, matchHref, playerHref } from '../router';

const ALL = 'all';
const load = () => loadAcademy();

interface Graduate {
  id: number;
  name: string;
  birth: string | null;
  debut: Debut | null;
  debutAge: number | null;
  goal: FirstGoal | null;
  career: CareerStats | null;
}

function graduates(data: AcademyData): Graduate[] {
  const debut = new Map(data.debuts.map((d) => [d.player_id, d]));
  const goal = new Map(data.firstGoals.map((g) => [g.player_id, g]));
  const career = new Map(data.careers.map((c) => [c.player_id, c]));
  return data.players.map((p) => {
    const d = debut.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.display_name,
      birth: p.birth_date,
      debut: d,
      debutAge: d?.match_date && p.birth_date ? ageYears(p.birth_date, d.match_date) : null,
      goal: goal.get(p.id) ?? null,
      career: career.get(p.id) ?? null,
    };
  });
}

export function AcademyPage() {
  useDocumentTitle('Выпускники академии');
  const state = useLoad(ALL, load);
  const list = useMemo(() => (state.status === 'ready' ? graduates(state.data) : []), [state]);
  const played = list.filter((g) => g.debut);
  const waiting = list.filter((g) => !g.debut);

  return (
    <div className="card-page coaches">
      <PageNav up={<a href={historyHref()}>← История</a>} />
      <h1 className="page-title">Выпускники академии</h1>
      {state.status !== 'ready' ? (
        <LoadStatus state={state} />
      ) : (
        <>
          <Tiles tiles={academyTiles(list)} label="Выпускники в цифрах" />
          <Card title="Дебюты и первые голы" aside={`${played.length} ${plural(played.length, ['игрок', 'игрока', 'игроков'])}`}>
            <GraduatesTable list={played} />
            <p className="note">
              Воспитанники — игроки с отметкой «воспитанник» (из таблицы автора, примерно с 2010 года). Дебют и первый гол — в
              официальных матчах за «Амкар», по протоколам; возраст — на день дебюта.
            </p>
          </Card>
          {waiting.length > 0 && (
            <Card title="Ещё не играли за основу" aside={`${waiting.length}`}>
              <p className="coach-debut-line">
                {waiting.map((g, k) => (
                  <span key={g.id}>
                    {k > 0 && ', '}
                    <a href={playerHref(g.id)}>{g.name}</a>
                  </span>
                ))}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function academyTiles(list: Graduate[]): Tile[] {
  const played = list.filter((g) => g.debut);
  const scored = list.filter((g) => g.goal);
  const youngest = played.filter((g) => g.debutAge != null).sort((a, b) => a.debutAge! - b.debutAge!)[0];
  const most = [...played].sort((a, b) => (b.career?.games ?? 0) - (a.career?.games ?? 0))[0];
  const tiles: Tile[] = [
    { value: list.length, label: `${plural(list.length, ['воспитанник', 'воспитанника', 'воспитанников'])} в базе` },
    { value: played.length, label: `${plural(played.length, ['сыграл', 'сыграли', 'сыграли'])} за «Амкар» · ${scored.length} забивали` },
  ];
  if (youngest) tiles.push({ value: formatAge(youngest.debutAge!), label: `года — самый молодой дебют: ${youngest.name}` });
  if (most?.career) tiles.push({ value: most.career.games, label: `${plural(most.career.games, ['матч', 'матча', 'матчей'])} — ${most.name}, больше всех` });
  return tiles;
}

type SortKey = 'name' | 'debut' | 'age' | 'goal' | 'games' | 'goals';
const COLUMNS: { key: SortKey; label: string; num?: boolean; value: (g: Graduate) => number | string }[] = [
  { key: 'name', label: 'Игрок', value: (g) => g.name },
  { key: 'debut', label: 'Дебют', value: (g) => g.debut?.match_date ?? '9999' },
  { key: 'age', label: 'Возраст', num: true, value: (g) => g.debutAge ?? 99 },
  { key: 'goal', label: 'Первый гол', value: (g) => g.goal?.match_date ?? '9999' },
  { key: 'games', label: 'Матчи', num: true, value: (g) => g.career?.games ?? 0 },
  { key: 'goals', label: 'Голы', num: true, value: (g) => g.career?.goals ?? -1 },
];

function GraduatesTable({ list }: { list: Graduate[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'debut', dir: 1 });
  const column = COLUMNS.find((c) => c.key === sort.key)!;
  const rows = [...list].sort((a, b) => {
    const va = column.value(a);
    const vb = column.value(b);
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
  });
  const by = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'games' || key === 'goals' ? -1 : 1 }));

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className={c.num ? 'num' : undefined} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                <button type="button" className="sort-button" onClick={() => by(c.key)}>
                  {c.label}
                  {sort.key === c.key && (sort.dir === 1 ? ' ↑' : ' ↓')}
                </button>
              </th>
            ))}
            <th>В клубе</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td>
                <a href={playerHref(g.id)}>{g.name}</a>
              </td>
              <td>
                {g.debut && (
                  <>
                    <a href={matchHref(g.debut.match_id)}>{g.debut.match_date ? formatDate(g.debut.match_date) : g.debut.season_label}</a>
                    {g.debut.opponent && <span className="muted"> · {g.debut.opponent}</span>}
                  </>
                )}
              </td>
              <td className="num">{g.debutAge == null ? <span className="muted">—</span> : formatAge(g.debutAge)}</td>
              <td>
                {g.goal ? (
                  <>
                    <a href={matchHref(g.goal.match_id)}>{g.goal.match_date ? formatDate(g.goal.match_date) : g.goal.season_label}</a>
                    {g.goal.opponent && <span className="muted"> · {g.goal.opponent}</span>}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="num">{g.career?.games ?? 0}</td>
              <td className="num">{g.career?.goals ?? '—'}</td>
              <td className="nowrap muted">
                {g.career && (g.career.first_year === g.career.last_year ? g.career.first_year : `${g.career.first_year}–${g.career.last_year}`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
