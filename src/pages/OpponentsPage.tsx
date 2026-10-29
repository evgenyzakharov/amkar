import { useMemo, type ReactNode } from 'react';
import { Card, ScopeSwitch, Tiles, type Tile } from '../components/cards';
import { LoadStatus, PageNav, ResultBadge } from '../components/common';
import { Slices, Wdl } from '../components/MatchStats';
import { KIND_ROWS, VENUE_ROWS, WDL, ppmText, type Run, type Totals } from '../coaches';
import { loadOpponent, loadOpponents, type OpponentPageData } from '../db/queries';
import { VENUE_LABEL, byDisplayName, formatDate, formatInt, formatScore, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { allOpponents, opponentStats, type OpponentMatch, type OpponentStats } from '../opponents';
import { matchHref, opponentHref, opponentsHref, playerHref, seasonHref, type LeadersScope } from '../router';
import { usePageState } from '../pageState';

// Ключ один: список соперников не зависит от адреса
const ALL = 'all';
const load = () => loadOpponents();

const year = (m: OpponentMatch | null) => m?.match_date?.slice(0, 4) ?? '';
/** «1996–2018», «2009» */
function meetings(o: OpponentStats): string {
  const [a, b] = [year(o.first), year(o.last)];
  return a === b ? a : `${a}–${b}`;
}

// ===========================================================================
// Список соперников
// ===========================================================================

export function OpponentsPage({ scope }: { scope: LeadersScope }) {
  useDocumentTitle('Соперники');
  const state = useLoad(ALL, load);
  const stats = useMemo(
    () => (state.status === 'ready' ? allOpponents(state.data.teams, state.data.matches, state.data.seasons) : []),
    [state],
  );

  return (
    <div className="card-page coaches">
      <h1 className="page-title">Соперники</h1>
      {state.status !== 'ready' ? (
        <LoadStatus state={state} />
      ) : (
        <>
          <Tiles tiles={opponentTiles(stats)} label="Соперники в цифрах" />
          <Card title="Все соперники" aside={<ScopeSwitch scope={scope} href={opponentsHref} allLabel="Все игры" />}>
            <OpponentTable stats={stats} scope={scope} />
            <p className="note">
              Официальные матчи, без товарищеских. Клуб, который менял название, — одной строкой под нынешним названием.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function opponentTiles(stats: OpponentStats[]): Tile[] {
  if (stats.length === 0) return [];
  const top = (key: (o: OpponentStats) => number) => [...stats].sort((a, b) => key(b) - key(a) || b.all.p - a.all.p)[0];
  const most = top((o) => o.all.p);
  const wins = top((o) => o.all.w);
  const losses = top((o) => o.all.l);
  return [
    { value: stats.length, label: `${plural(stats.length, ['соперник', 'соперника', 'соперников'])} в официальных матчах` },
    { value: most.all.p, label: `${plural(most.all.p, ['встреча', 'встречи', 'встреч'])} — ${most.team.name}, чаще всех` },
    { value: wins.all.w, label: `${plural(wins.all.w, ['победа', 'победы', 'побед'])} — ${wins.team.name}, больше всех` },
    { value: losses.all.l, label: `${plural(losses.all.l, ['поражение', 'поражения', 'поражений'])} — ${losses.team.name}, больше всех` },
  ];
}

type SortKey = 'name' | 'p' | 'wdl' | 'goals' | 'ppm' | 'years';
const COLUMNS: { key: SortKey; label: string; num?: boolean; value: (o: OpponentStats, t: Totals) => number | string }[] = [
  { key: 'name', label: 'Клуб', value: (o) => o.team.name },
  { key: 'p', label: 'М', num: true, value: (_, t) => t.p },
  { key: 'wdl', label: WDL, value: (_, t) => (t.p ? t.w / t.p : 0) },
  { key: 'goals', label: 'Мячи', num: true, value: (_, t) => t.gf - t.ga },
  { key: 'ppm', label: 'Очки/м', num: true, value: (_, t) => t.ppm ?? -1 },
  { key: 'years', label: 'Годы', value: (o) => o.first?.match_date ?? '' },
];

function OpponentTable({ stats, scope }: { stats: OpponentStats[]; scope: LeadersScope }) {
  const [sort, setSort] = usePageState<{ key: SortKey; dir: 1 | -1 }>('sort', { key: 'p', dir: -1 });
  const [query, setQuery] = usePageState('query', '');
  const totalsOf = (o: OpponentStats) => (scope === 'league' ? o.league : o.all);
  const column = COLUMNS.find((c) => c.key === sort.key)!;
  const q = query.trim().toLowerCase().replaceAll('ё', 'е');
  const rows = stats
    .filter((o) => totalsOf(o).p > 0)
    .filter((o) => !q || [o.team.name, ...o.names, o.team.city ?? ''].some((n) => n.toLowerCase().replaceAll('ё', 'е').includes(q)))
    .sort((a, b) => {
      const va = column.value(a, totalsOf(a));
      const vb = column.value(b, totalsOf(b));
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir || totalsOf(b).p - totalsOf(a).p;
    });
  const by = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' || key === 'years' ? 1 : -1 }));

  return (
    <>
      <p className="opponent-search">
        <input type="search" aria-label="Найти клуб" placeholder="Найти клуб или город" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted">
          {rows.length} {plural(rows.length, ['клуб', 'клуба', 'клубов'])}
        </span>
      </p>
      <div className="table-wrap">
        <table className="data-table coach-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? 'num' : undefined}
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                >
                  <button type="button" className="sort-button" onClick={() => by(c.key)}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 1 ? ' ↑' : ' ↓')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const t = totalsOf(o);
              return (
                <tr key={o.team.id}>
                  <td>
                    <a href={opponentHref(o.team.id)}>{o.team.name}</a>
                    {o.team.city && <span className="muted"> · {o.team.city}</span>}
                  </td>
                  <td className="num">{t.p}</td>
                  <td>
                    <Wdl t={t} />
                  </td>
                  <td className="num nowrap">
                    {t.gf}:{t.ga}
                  </td>
                  <td className="num">{ppmText(t)}</td>
                  <td className="nowrap">{meetings(o)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===========================================================================
// Карточка соперника
// ===========================================================================

export function OpponentPage({ id }: { id: number }) {
  const state = useLoad(id, loadOpponent);
  useDocumentTitle(state.status === 'ready' ? state.data.team.name : 'Соперник');
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <OpponentCard data={state.data} />;
}

function OpponentCard({ data }: { data: OpponentPageData }) {
  const o = opponentStats(data.team, data.matches, data.seasons);
  const seasonOf = new Map(data.seasons.map((s) => [s.id, s]));
  const t = o.all;
  const friendlies = data.matches.length - o.matches.length;

  return (
    <div className="card-page coaches">
      <PageNav up={<a href={opponentsHref()}>← Соперники</a>} />
      <section className="coach-head">
        <h1>{o.team.name}</h1>
        {o.team.city && <p>{o.team.city}</p>}
        {o.names.length > 1 && <p>В матчах с «Амкаром»: {o.names.join(' → ')}</p>}
      </section>
      {o.matches.length === 0 ? (
        <p className="muted">Официальных матчей с «Амкаром» нет{friendlies > 0 && ` — только товарищеские (${friendlies})`}.</p>
      ) : (
        <>
          <Tiles
            label="Встречи в цифрах"
            tiles={[
              { value: formatInt(t.p), label: `${plural(t.p, ['официальная встреча', 'официальные встречи', 'официальных встреч'])} · ${meetings(o)}` },
              { value: `${t.w}–${t.d}–${t.l}`, label: 'победы, ничьи, поражения «Амкара»' },
              { value: ppmText(t), label: `очка за матч · ${t.winPct ?? 0}% побед` },
              { value: `${t.gf}:${t.ga}`, label: `мячи · ${t.cleanSheets} «сухих»` },
            ]}
          />
          <div className="card-row card-row-even">
            <Card title="По турнирам">
              <Slices rows={KIND_ROWS.flatMap(([k, label]) => (o.byKind[k] ? [{ label, t: o.byKind[k]! }] : []))} />
            </Card>
            <Card title="Дома и в гостях">
              <Slices rows={VENUE_ROWS.flatMap(([k, label]) => (o.byVenue[k] ? [{ label, t: o.byVenue[k]! }] : []))} />
            </Card>
          </div>
          <div className="card-row card-row-even">
            <Card title="Вехи и серии">
              <Milestones o={o} />
            </Card>
            <Card title="Забивали им">
              <Scorers data={data} />
            </Card>
          </div>
          <Card title="Все встречи" aside={friendlies > 0 ? `и ${friendlies} ${plural(friendlies, ['товарищеская', 'товарищеские', 'товарищеских'])}` : undefined}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Сезон</th>
                    <th>Дата</th>
                    <th>Счёт</th>
                    <th>Турнир</th>
                    <th>Где</th>
                  </tr>
                </thead>
                <tbody>
                  {o.matches.map((m) => {
                    const s = seasonOf.get(m.season_id);
                    return (
                      <tr key={m.id}>
                        <td>{s && <a href={seasonHref(s.label)}>{s.label}</a>}</td>
                        <td className="nowrap">{m.match_date && formatDate(m.match_date)}</td>
                        <td className="nowrap">
                          <ResultBadge result={m.result} /> <a href={matchHref(m.id)}>{formatScore(m) || 'счёт?'}</a>
                        </td>
                        <td>
                          {m.competition.name}
                          {m.round && <span className="muted"> · {/^\d+$/.test(m.round) ? `${m.round}-й тур` : m.round}</span>}
                        </td>
                        <td>{m.venue && VENUE_LABEL[m.venue]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">Счёт — со стороны «Амкара».</p>
          </Card>
        </>
      )}
    </div>
  );
}

const RESULT_WORD = { W: 'победа', D: 'ничья', L: 'поражение' } as const;

function MatchRef({ m }: { m: OpponentMatch }) {
  return (
    <>
      {m.match_date && `${formatDate(m.match_date)}, `}
      <a href={matchHref(m.id)}>{formatScore(m)}</a>
      {m.venue && ` ${VENUE_LABEL[m.venue]}`}
      {m.result && <span className={`result-word result-word-${m.result}`}> — {RESULT_WORD[m.result]}</span>}
    </>
  );
}

function RunRef({ run, unit }: { run: Run<OpponentMatch>; unit: [string, string, string] }) {
  if (run.n < 2 || !run.from || !run.to) return <span className="muted">—</span>;
  return (
    <>
      {run.n} {plural(run.n, unit)}{' '}
      <span className="muted">
        ({year(run.from)}–{year(run.to)})
      </span>
    </>
  );
}

function Milestones({ o }: { o: OpponentStats }) {
  const items: [string, ReactNode][] = [];
  if (o.first) items.push(['Первая встреча', <MatchRef m={o.first} />]);
  if (o.last && o.last !== o.first) items.push(['Последняя', <MatchRef m={o.last} />]);
  if (o.bigWin) items.push(['Крупнейшая победа', <MatchRef m={o.bigWin} />]);
  if (o.bigLoss) items.push(['Крупнейшее поражение', <MatchRef m={o.bigLoss} />]);
  items.push(
    ['Победы подряд', <RunRef run={o.streaks.win} unit={['победа', 'победы', 'побед']} />],
    ['Без поражений', <RunRef run={o.streaks.unbeaten} unit={['матч', 'матча', 'матчей']} />],
    ['Без побед', <RunRef run={o.streaks.winless} unit={['матч', 'матча', 'матчей']} />],
    ['Поражения подряд', <RunRef run={o.streaks.loss} unit={['поражение', 'поражения', 'поражений']} />],
  );
  return (
    <dl className="coach-facts">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Scorers({ data }: { data: OpponentPageData }) {
  const top = [...data.scorers].sort((a, b) => b.goals - a.goals || byDisplayName(a.display_name, b.display_name)).slice(0, 7);
  if (top.length === 0) return <p className="muted">Голов «Амкара» в этих матчах не записано.</p>;
  return (
    <ol className="coach-top">
      {top.map((p) => (
        <li key={p.player_id}>
          <a href={playerHref(p.player_id)}>{p.display_name}</a>
          <b>{p.goals}</b>
        </li>
      ))}
    </ol>
  );
}
