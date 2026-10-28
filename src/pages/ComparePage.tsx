// Сравнение двух игроков или двух сезонов рядом: #/compare?a=27&b=33, #/compare?s=2008&t=2024. Ссылкой можно поделиться.
import { useState, type ReactNode } from 'react';
import { Card } from '../components/cards';
import { LoadStatus } from '../components/common';
import { hasMatches, loadComparePlayers, loadCompareSeasons, loadSearchIndex, loadSeasons, type ComparePlayer, type CompareSeason } from '../db/queries';
import { POSITION_NAME, formatInt, formatRatio, plural } from '../format';
import { seasonAges } from '../historyStats';
import { useDocumentTitle, useLoad } from '../load';
import { seasonSpan, tierName } from '../pyramid';
import { compareHref, playerHref, seasonHref, type CompareRoute } from '../router';
import type { SearchIndex } from '../search';

export function ComparePage({ route }: { route: CompareRoute }) {
  useDocumentTitle('Сравнение');
  return (
    <div className="card-page">
      <h1 className="page-title">Сравнение</h1>
      <nav className="segmented compare-mode" aria-label="Что сравнивать">
        <a href={compareHref({ mode: 'players', a: null, b: null })} className={route.mode === 'players' ? 'active' : undefined} aria-current={route.mode === 'players' ? 'true' : undefined}>
          Игроки
        </a>
        <a href={compareHref({ mode: 'seasons', s: null, t: null })} className={route.mode === 'seasons' ? 'active' : undefined} aria-current={route.mode === 'seasons' ? 'true' : undefined}>
          Сезоны
        </a>
      </nav>
      {route.mode === 'players' ? <PlayersCompare a={route.a} b={route.b} /> : <SeasonsCompare s={route.s} t={route.t} />}
    </div>
  );
}

// ===========================================================================
// Строка сравнения: число слева и справа, у лучшего — акцент, полоски — для глаза
// ===========================================================================

interface Metric {
  label: string;
  a: number | null;
  b: number | null;
  show?: (n: number) => string;
  /** Что лучше: больше (по умолчанию), меньше (место) или не сравниваем (средний возраст). */
  better?: 'higher' | 'lower' | null;
}

function CompareTable({ rows, extra }: { rows: Metric[]; extra?: ReactNode }) {
  return (
    <table className="compare-table">
      <tbody>
        {rows.map((r) => {
          const better = r.better === undefined ? 'higher' : r.better;
          const [a, b] = [r.a ?? 0, r.b ?? 0];
          const lead = (x: number, y: number) => better != null && x !== y && (better === 'higher' ? x > y : x < y);
          // полоска длиннее у лучшего: «больше — лучше» — по доле от большего, «меньше — лучше» (место) — от меньшего
          const width = (x: number) =>
            better === 'lower' ? (x > 0 ? (Math.min(a, b) / x) * 100 : 100) : (x / (Math.max(a, b) || 1)) * 100;
          const show = (n: number | null) => (n == null ? '—' : (r.show ?? formatInt)(n));
          return (
            <tr key={r.label}>
              <td className={`num${lead(a, b) ? ' lead' : ''}`}>{show(r.a)}</td>
              <td className="compare-label">
                {r.label}
                {better != null && r.a != null && r.b != null && (
                  <div className="compare-bars" aria-hidden="true">
                    <i style={{ width: `${width(a)}%` }} />
                    <i className="b" style={{ width: `${width(b)}%` }} />
                  </div>
                )}
              </td>
              <td className={`num${lead(b, a) ? ' lead' : ''}`}>{show(r.b)}</td>
            </tr>
          );
        })}
        {extra}
      </tbody>
    </table>
  );
}

// ===========================================================================
// Игроки
// ===========================================================================

function PlayersCompare({ a, b }: { a: number | null; b: number | null }) {
  return (
    <>
      <div className="compare-pickers">
        <PlayerPick id={a} other={b} side="a" />
        <span className="muted">и</span>
        <PlayerPick id={b} other={a} side="b" />
        {a != null && b != null && (
          <a className="button" href={compareHref({ mode: 'players', a: b, b: a })}>
            Поменять местами
          </a>
        )}
      </div>
      {a != null && b != null ? <PlayersResult key={`${a}-${b}`} ids={`${a}-${b}`} /> : <p className="muted">Выберите двух игроков — по фамилии.</p>}
    </>
  );
}

const loadIndex = () => loadSearchIndex();

/** Выбор игрока: выбран — фамилия и ✕, иначе — поиск по фамилии, как в шапке. */
function PlayerPick({ id, other, side }: { id: number | null; other: number | null; side: 'a' | 'b' }) {
  const index = useLoad('index', loadIndex);
  const [query, setQuery] = useState('');
  const href = (pick: number | null) => compareHref(side === 'a' ? { mode: 'players', a: pick, b: other } : { mode: 'players', a: other, b: pick });
  if (index.status !== 'ready') return <span className="compare-pick muted">…</span>;
  if (id != null) {
    const p = index.data.players.find((x) => x.id === id);
    return (
      <span className="compare-pick chosen">
        <a href={playerHref(id)}>{p?.name ?? `игрок №${id}`}</a>{' '}
        <a href={href(null)} aria-label="убрать" title="выбрать другого">
          ✕
        </a>
      </span>
    );
  }
  const found = findPlayers(index.data, query, other);
  return (
    <span className="compare-pick">
      <input aria-label="игрок: поиск" placeholder="Фамилия игрока" value={query} onChange={(e) => setQuery(e.target.value)} />
      {found.length > 0 && (
        <ul className="search-results">
          {found.map((p) => (
            <li key={p.id}>
              <a href={href(p.id)}>{p.name}</a> <span className="muted">{[p.years, `${p.games} ${plural(p.games, ['матч', 'матча', 'матчей'])}`].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

function findPlayers(index: SearchIndex, query: string, except: number | null) {
  const q = query.trim().toLowerCase().replaceAll('ё', 'е');
  if (q.length < 2) return [];
  return index.players
    .filter((p) => p.id !== except && p.games > 0 && [p.name, p.last].some((n) => n.toLowerCase().replaceAll('ё', 'е').split(/[\s.]+/).some((w) => w.startsWith(q))))
    .sort((x, y) => y.games - x.games)
    .slice(0, 8);
}

function PlayersResult({ ids }: { ids: string }) {
  const state = useLoad(ids, loadComparePlayers);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  const [a, b] = state.data;
  const sum = (p: ComparePlayer, f: (s: ComparePlayer['seasons'][number]) => number | null) => p.seasons.reduce((n, s) => n + (f(s) ?? 0), 0);
  const tier = (p: ComparePlayer) => tierName(p.points?.tier);
  return (
    <>
      <Card title={`${a.name} и ${b.name}`}>
        <div className="compare-head">
          <Who name={a.name} href={playerHref(a.id)} note={whoNote(a)} align="right" />
          <span className="muted">против</span>
          <Who name={b.name} href={playerHref(b.id)} note={whoNote(b)} />
        </div>
        <CompareTable
          rows={[
            { label: 'матчей', a: a.career?.games ?? 0, b: b.career?.games ?? 0 },
            { label: 'в чемпионате', a: a.career?.games_league ?? 0, b: b.career?.games_league ?? 0 },
            { label: 'минут на поле', a: sum(a, (s) => s.minutes), b: sum(b, (s) => s.minutes) },
            { label: 'голов', a: a.career?.goals ?? 0, b: b.career?.goals ?? 0 },
            { label: 'передач', a: sum(a, (s) => s.assists), b: sum(b, (s) => s.assists) },
            { label: 'сезонов в заявке', a: a.career?.seasons ?? 0, b: b.career?.seasons ?? 0 },
            { label: 'ценность в пирамиде', a: a.points?.value ?? null, b: b.points?.value ?? null, show: (n) => formatInt(Math.round(n)) },
            { label: 'место за карьеру', a: a.points?.career_rank ?? null, b: b.points?.career_rank ?? null, show: (n) => `${n}-й`, better: 'lower' },
          ]}
          extra={
            (tier(a) || tier(b)) && (
              <tr>
                <td className="num-text">{tier(a) ?? '—'}</td>
                <td className="compare-label">ярус пирамиды</td>
                <td className="num-text left">{tier(b) ?? '—'}</td>
              </tr>
            )
          }
        />
      </Card>
      <SeasonByseason a={a} b={b} />
    </>
  );
}

const whoNote = (p: ComparePlayer) =>
  [p.position && POSITION_NAME[p.position].toLowerCase(), p.points?.first_season && seasonSpan(p.points.first_season, p.points.last_season)].filter(Boolean).join(' · ');

function Who({ name, href, note, align }: { name: string; href: string; note: string; align?: 'right' }) {
  return (
    <div className={`compare-who${align === 'right' ? ' right' : ''}`}>
      <a href={href}>{name}</a>
      {note && <small>{note}</small>}
    </div>
  );
}

/** По сезонам: матчи, голы и очки обоих; общие сезоны подсвечены. */
function SeasonByseason({ a, b }: { a: ComparePlayer; b: ComparePlayer }) {
  const labels = [...new Map([...a.seasons, ...b.seasons].sort((x, y) => x.start_year - y.start_year || x.end_year - y.end_year).map((s) => [s.season_label, s])).keys()];
  const of = (p: ComparePlayer, label: string) => p.seasons.find((s) => s.season_label === label);
  const pts = (p: ComparePlayer, label: string) => p.seasonPoints.find((s) => s.season_label === label)?.points;
  const cell = (p: ComparePlayer, label: string) => {
    const s = of(p, label);
    if (!s) return [<td key="g" className="num muted">—</td>, <td key="o" className="num muted" />, <td key="p" className="num muted" />];
    const points = pts(p, label);
    return [
      <td key="g" className="num">{s.games}</td>,
      <td key="o" className="num">{s.goals ?? '—'}</td>,
      <td key="p" className="num">{points == null ? '—' : formatInt(Math.round(points))}</td>,
    ];
  };
  return (
    <Card title="По сезонам" aside="подсвечены общие">
      <div className="table-wrap">
        <table className="data-table compare-seasons">
          <thead>
            <tr>
              <th rowSpan={2}>Сезон</th>
              <th colSpan={3}>{a.name}</th>
              <th colSpan={3}>{b.name}</th>
            </tr>
            <tr>
              {[a, b].flatMap((p) => [
                <th key={`${p.id}m`} className="num" title="матчи">
                  М
                </th>,
                <th key={`${p.id}g`} className="num" title="голы">
                  Г
                </th>,
                <th key={`${p.id}p`} className="num" title="очки сезона по формуле пирамиды">
                  Очки
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => (
              <tr key={label} className={of(a, label) && of(b, label) && (of(a, label)!.games > 0 || of(b, label)!.games > 0) ? 'common' : undefined}>
                <th scope="row">
                  <a href={seasonHref(label)}>{label}</a>
                </th>
                {cell(a, label)}
                {cell(b, label)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ===========================================================================
// Сезоны
// ===========================================================================

const loadAllSeasons = () => loadSeasons();

function SeasonsCompare({ s, t }: { s: string | null; t: string | null }) {
  const seasons = useLoad('seasons', loadAllSeasons);
  if (seasons.status !== 'ready') return <LoadStatus state={seasons} />;
  const visible = seasons.data.filter(hasMatches);
  const pick = (value: string | null, side: 's' | 't') => (
    <select
      aria-label={side === 's' ? 'первый сезон' : 'второй сезон'}
      value={value ?? ''}
      onChange={(e) =>
        (window.location.hash = compareHref(side === 's' ? { mode: 'seasons', s: e.target.value || null, t } : { mode: 'seasons', s, t: e.target.value || null }))
      }
    >
      <option value="">— сезон —</option>
      {[...visible].reverse().map((x) => (
        <option key={x.id} value={x.label}>
          {x.label}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <div className="compare-pickers">
        {pick(s, 's')}
        <span className="muted">и</span>
        {pick(t, 't')}
        {s && t && (
          <a className="button" href={compareHref({ mode: 'seasons', s: t, t: s })}>
            Поменять местами
          </a>
        )}
      </div>
      {s && t ? <SeasonsResult key={`${s}|${t}`} labels={`${s}|${t}`} /> : <p className="muted">Выберите два сезона.</p>}
    </>
  );
}

function SeasonsResult({ labels }: { labels: string }) {
  const state = useLoad(labels, loadCompareSeasons);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  const [a, b] = state.data;
  const age = (x: CompareSeason) => seasonAges(x.ages).get(x.season.id)?.avg ?? null;
  const per = (n: number, of: number) => (of > 0 ? n / of : null);
  const scorer = (x: CompareSeason) =>
    x.topScorer ? (
      <>
        <a href={playerHref(x.topScorer.player_id)}>{x.topScorer.display_name}</a> · {x.topScorer.goals}
      </>
    ) : (
      '—'
    );
  const wdl = (x: CompareSeason) => `${x.summary.league_wins}–${x.summary.league_draws}–${x.summary.league_losses}`;
  return (
    <Card title={`${a.season.label} и ${b.season.label}`}>
      <div className="compare-head">
        <Who name={a.season.label} href={seasonHref(a.season.label)} note={a.season.division ?? ''} align="right" />
        <span className="muted">против</span>
        <Who name={b.season.label} href={seasonHref(b.season.label)} note={b.season.division ?? ''} />
      </div>
      <CompareTable
        rows={[
          { label: `место${a.season.teams_count || b.season.teams_count ? ` · из ${a.season.teams_count ?? '?'} и ${b.season.teams_count ?? '?'}` : ''}`, a: a.season.final_place, b: b.season.final_place, show: (n) => `${n}-е`, better: 'lower' },
          { label: 'матчей в чемпионате', a: a.summary.league_played, b: b.summary.league_played, better: null },
          { label: 'очков за матч в чемпионате', a: per(a.summary.league_points, a.summary.league_played), b: per(b.summary.league_points, b.summary.league_played), show: formatRatio },
          { label: 'забито за матч', a: per(a.goalsFor, a.scored), b: per(b.goalsFor, b.scored), show: formatRatio },
          { label: 'пропущено за матч', a: per(a.goalsAgainst, a.scored), b: per(b.goalsAgainst, b.scored), show: formatRatio, better: 'lower' },
          { label: 'средний возраст', a: age(a), b: age(b), show: (n) => formatRatio(n).replace(/0$/, ''), better: null },
          {
            label: 'минут воспитанников, %',
            a: a.summary.minutes ? Math.round((100 * a.summary.academy_minutes) / a.summary.minutes) : null,
            b: b.summary.minutes ? Math.round((100 * b.summary.academy_minutes) / b.summary.minutes) : null,
          },
        ]}
        extra={
          <>
            <tr>
              <td className="num-text">{wdl(a)}</td>
              <td className="compare-label">чемпионат: В–Н–П</td>
              <td className="num-text left">{wdl(b)}</td>
            </tr>
            <tr>
              <td className="num-text">{scorer(a)}</td>
              <td className="compare-label">лучший бомбардир</td>
              <td className="num-text left">{scorer(b)}</td>
            </tr>
          </>
        }
      />
      {a.season.tier !== b.season.tier && <p className="note">Уровень лиги разный — у сезона подписано, где играли.</p>}
    </Card>
  );
}
