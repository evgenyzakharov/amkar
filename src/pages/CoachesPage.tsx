import { useMemo, type ReactNode } from 'react';
import { Card, ScopeSwitch, Tiles, type Tile } from '../components/cards';
import { LoadStatus, NotFound, PageNav } from '../components/common';
import { Slices, Wdl } from '../components/MatchStats';
import {
  KIND_ROWS,
  TIER_LABEL,
  VENUE_ROWS,
  WDL,
  coachStats,
  ppmText, type CoachMatch, type CoachStats, type Period, type Run, type Totals } from '../coaches';
import { loadCoachPage, loadCoaches, type CoachPlayer } from '../db/queries';
import { formatDate, formatInt, formatScore, opponentName, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { coachHref, coachesHref, matchHref, playerHref, seasonHref, type LeadersScope } from '../router';
import { usePageState } from '../pageState';

// Ключ один: данные тренеров не зависят от адреса
const ALL = 'all';
const load = () => loadCoaches();

/** Цвет тренера на ленте «Эпохи» и в шапке карточки — по порядку назначения. */
const COLORS = ['#c8102e', '#1f4e8a', '#2f8f57', '#8a6a0c', '#6b3fa0', '#0f7c84', '#b55a1f', '#5c5752', '#a3306f', '#3d6b1f', '#7a1f1f', '#2a5c9a', '#9a7a16', '#3f7f5a', '#7c3aa0', '#444444'];
const colorOf = (stats: CoachStats[], id: number) => COLORS[Math.max(0, stats.findIndex((c) => c.coach.id === id)) % COLORS.length];

const year = (iso: string) => iso.slice(0, 4);
/** «1995–2006», «2009», «2026 — н. в.» */
function years(c: CoachStats): string {
  const from = c.periods[0]?.from;
  if (!from) return '';
  if (c.current) return `${year(from)} — н. в.`;
  const to = c.periods.at(-1)?.to ?? from;
  return year(from) === year(to) ? year(from) : `${year(from)}–${year(to)}`;
}
const periodText = (p: Period) => `${formatDate(p.from)} — ${p.to ? formatDate(p.to) : 'по н. в.'}`;
// ===========================================================================
// Страница «Тренеры»
// ===========================================================================

export function CoachesPage({ scope }: { scope: LeadersScope }) {
  useDocumentTitle('Тренеры');
  const state = useLoad(ALL, load);
  const stats = useMemo(() => (state.status === 'ready' ? coachStats(state.data) : []), [state]);

  return (
    <div className="card-page coaches">
      <h1 className="page-title">Тренеры</h1>
      {state.status !== 'ready' ? (
        <LoadStatus state={state} />
      ) : (
        <>
          <Tiles tiles={overviewTiles(stats)} label="Тренеры в цифрах" />
          <Card title="Эпохи">
            <Epochs stats={stats} />
          </Card>
          <Card title="Все главные тренеры" aside={<ScopeSwitch scope={scope} href={coachesHref} allLabel="Все игры" />}>
            <CoachTable stats={stats} scope={scope} />
            <p className="note">
              Официальные матчи, без товарищеских. Очки — 3 за победу, 1 за ничью, у технических результатов — тоже.
            </p>
            <AchievementLegend stats={stats} />
          </Card>
          <Card title="Очки за матч по уровню лиги" aside="чемпионат">
            <TierTable stats={stats} />
            <p className="note">
              В скобках — матчи.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function overviewTiles(stats: CoachStats[]): Tile[] {
  if (stats.length === 0) return [];
  const longest = [...stats].sort((a, b) => b.all.p - a.all.p)[0];
  const best = stats.filter((c) => c.all.p >= 20).sort((a, b) => (b.all.ppm ?? 0) - (a.all.ppm ?? 0))[0];
  const top = stats
    .flatMap((c) => c.seasons.filter((s) => s.led && s.season.tier === 1 && s.season.final_place).map((s) => ({ c, s: s.season })))
    .sort((a, b) => a.s.final_place! - b.s.final_place!)[0];
  const tiles: Tile[] = [
    { value: stats.length, label: `${plural(stats.length, ['главный тренер', 'главных тренера', 'главных тренеров'])} с 1995 года` },
    { value: formatInt(longest.all.p), label: `матчей — ${longest.coach.full_name}, ${years(longest)}` },
  ];
  if (best) tiles.push({ value: ppmText(best.all), label: `очка за матч — ${best.coach.full_name} (лучший, от 20 матчей)` });
  if (top) tiles.push({ value: `${top.s.final_place}-е`, label: `место в Премьер-лиге — ${top.c.coach.full_name}, ${top.s.label}` });
  return tiles;
}

/** Лента сроков: от назначения до увольнения. Штриховка под лентой — время без тренера и без клуба (2018–2021). */
function Epochs({ stats }: { stats: CoachStats[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.parse('1995-01-01');
  const t1 = Date.parse(`${Number(today.slice(0, 4)) + 1}-01-01`);
  const x = (iso: string) => (100 * (Date.parse(iso) - t0)) / (t1 - t0);
  const ticks = [1995, 2000, 2005, 2010, 2015, 2021, Number(today.slice(0, 4))];
  return (
    <>
      <div className="epochs-track" aria-hidden="true">
        {stats.flatMap((c) =>
          c.periods.map((p) => {
            const left = x(p.from);
            const width = Math.max(0.4, x(p.to ?? today) - left);
            return (
              <a
                key={`${c.coach.id}-${p.from}`}
                className="epochs-seg"
                href={coachHref(c.coach.id)}
                tabIndex={-1}
                style={{ left: `${left}%`, width: `${width}%`, background: colorOf(stats, c.coach.id) }}
                title={`${c.coach.full_name}: ${periodText(p)}`}
                aria-label={`${c.coach.full_name}: ${periodText(p)}`}
              />
            );
          }),
        )}
        {ticks.map((y) => (
          <span key={y} className="epochs-year" style={{ left: `${x(`${y}-01-01`)}%` }}>
            {y}
          </span>
        ))}
      </div>
      <ul className="epochs-legend">
        {stats.map((c) => (
          <li key={c.coach.id}>
            <i style={{ background: colorOf(stats, c.coach.id) }} />
            <a href={coachHref(c.coach.id)}>{c.coach.full_name}</a>
          </li>
        ))}
      </ul>
    </>
  );
}

type SortKey = 'period' | 'name' | 'p' | 'wdl' | 'ppm' | 'winPct' | 'goals' | 'ach';
const COLUMNS: { key: SortKey; label: string; num?: boolean; value: (c: CoachStats, t: Totals) => number | string }[] = [
  { key: 'name', label: 'Тренер', value: (c) => c.coach.full_name },
  { key: 'period', label: 'Годы', value: (c) => c.periods[0]?.from ?? '' },
  { key: 'p', label: 'М', num: true, value: (_, t) => t.p },
  { key: 'wdl', label: WDL, value: (_, t) => (t.p ? t.w / t.p : 0) },
  { key: 'ppm', label: 'Очки/м', num: true, value: (_, t) => t.ppm ?? -1 },
  { key: 'winPct', label: '% побед', num: true, value: (_, t) => t.winPct ?? -1 },
  { key: 'goals', label: 'Мячи', num: true, value: (_, t) => t.gf - t.ga },
  { key: 'ach', label: 'Достижения', value: (c) => c.achievements.length },
];

function CoachTable({ stats, scope }: { stats: CoachStats[]; scope: LeadersScope }) {
  const [sort, setSort] = usePageState<{ key: SortKey; dir: 1 | -1 }>('sort', { key: 'period', dir: 1 });
  const totalsOf = (c: CoachStats) => (scope === 'league' ? c.league : c.all);
  const column = COLUMNS.find((c) => c.key === sort.key)!;
  const rows = stats
    .filter((c) => totalsOf(c).p > 0)
    .sort((a, b) => {
      const va = column.value(a, totalsOf(a));
      const vb = column.value(b, totalsOf(b));
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  const by = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' || key === 'period' ? 1 : -1 }));

  return (
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
          {rows.map((c) => {
            const t = totalsOf(c);
            return (
              <tr key={c.coach.id}>
                <td>
                  <a href={coachHref(c.coach.id)}>{c.coach.full_name}</a>
                </td>
                <td className="nowrap">
                  {years(c)}
                  {c.periods.length > 1 && <span className="muted"> · {c.periods.length} срока</span>}
                </td>
                <td className="num">{t.p}</td>
                <td>
                  <Wdl t={t} />
                </td>
                <td className="num">{ppmText(t)}</td>
                <td className="num">{t.winPct == null ? '—' : `${t.winPct}%`}</td>
                <td className="num nowrap">
                  {t.gf}:{t.ga}
                </td>
                <td className="coach-icons" title={c.achievements.map((a) => a.title).join('\n')}>
                  <AchievementIcons c={c} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Значки достижений в строке таблицы: одинаковые — одним значком с числом (у Оборина восемь рекордов). */
function AchievementIcons({ c }: { c: CoachStats }) {
  const count = new Map<string, number>();
  for (const a of c.achievements) count.set(a.icon, (count.get(a.icon) ?? 0) + 1);
  return [...count].map(([icon, n]) => (
    <span key={icon}>
      {icon}
      {n > 1 && <sub>{n}</sub>}
    </span>
  ));
}

function TierTable({ stats }: { stats: CoachStats[] }) {
  const levels = [1, 2, 3, 4].filter((l) => stats.some((c) => c.byTier[l]));
  const values = stats.flatMap((c) => levels.map((l) => c.byTier[l]?.ppm).filter((v): v is number => v != null));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const shade = (v: number) => `color-mix(in srgb, var(--win) ${Math.round(8 + (55 * (v - lo)) / (hi - lo || 1))}%, transparent)`;
  const rows = stats.filter((c) => levels.some((l) => c.byTier[l]));
  return (
    <div className="table-wrap">
      <table className="data-table tier-table">
        <thead>
          <tr>
            <th>Тренер</th>
            {levels.map((l) => (
              <th key={l} className="num">
                {l} · {TIER_LABEL[l]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.coach.id}>
              <td>
                <a href={coachHref(c.coach.id)}>{c.coach.full_name}</a>
              </td>
              {levels.map((l) => {
                const t = c.byTier[l];
                return t ? (
                  <td key={l} className="num" style={{ background: shade(t.ppm ?? 0) }} title={`${t.p} матчей, ${t.w}–${t.d}–${t.l}`}>
                    <b>{ppmText(t)}</b> <span className="muted">({t.p})</span>
                  </td>
                ) : (
                  <td key={l} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Карточка тренера
// ===========================================================================

export function CoachPage({ id }: { id: number }) {
  const state = useLoad(id, loadCoachPage);
  const stats = useMemo(() => (state.status === 'ready' ? coachStats(state.data.data) : []), [state]);
  const i = stats.findIndex((c) => c.coach.id === id);
  const c = stats[i];
  useDocumentTitle(c ? c.coach.full_name : 'Тренер');
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  if (!c) return <NotFound message="У этого тренера нет ни матчей, ни сроков работы." />;
  const prev = stats[i - 1];
  const next = stats[i + 1];

  return (
    <div className="card-page coaches">
      <PageNav
        up={<a href={coachesHref()}>← Тренеры</a>}
        prev={prev && <a href={coachHref(prev.coach.id)}>‹ {prev.coach.full_name}</a>}
        next={next && <a href={coachHref(next.coach.id)}>{next.coach.full_name} ›</a>}
      />
      <section className="coach-head" style={{ borderLeftColor: colorOf(stats, c.coach.id) }}>
        <h1>{c.coach.full_name}</h1>
        {c.periods.length > 0 && (
          <p>
            {c.periods.length > 1 ? `${c.periods.length} срока: ` : 'В должности: '}
            {c.periods.map(periodText).join('; ')}
          </p>
        )}
        {c.coach.birth_date && <p>Родился {formatDate(c.coach.birth_date)}</p>}
      </section>
      <Tiles tiles={coachTiles(c)} label="Тренер в цифрах" />
      {c.achievements.length > 0 && (
        <Card title="Достижения">
          <ul className="achievements">
            {c.achievements.map((a) => (
              <li key={a.title} className={a.kind === 'record' ? 'record' : undefined}>
                <span aria-hidden="true">{a.icon}</span>
                {a.title}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="По сезонам">
        <CoachSeasons c={c} />
        <p className="note">Место в таблице — у сезонов, где тренер провёл бо́льшую часть матчей чемпионата.</p>
      </Card>
      <div className="card-row card-row-even">
        <Card title="По турнирам">
          <Slices
            rows={KIND_ROWS.flatMap(([k, label]) => (c.byKind[k] ? [{ label, t: c.byKind[k]! }] : []))}
          />
        </Card>
        <Card title="Дома и в гостях">
          <Slices
            rows={VENUE_ROWS.flatMap(([k, label]) => (c.byVenue[k] ? [{ label, t: c.byVenue[k]! }] : []))}
          />
        </Card>
      </div>
      <Card title="Вехи и серии">
        <Milestones c={c} />
      </Card>
      <div className="card-row card-row-even">
        <Card title="Его игроки">
          <TopPlayers players={state.data.players} stat="games" />
        </Card>
        <Card title="Его бомбардиры">
          <TopPlayers players={state.data.players} stat="goals" />
        </Card>
      </div>
      <Card title="Дебютанты" aside={`${c.debutants.length} ${plural(c.debutants.length, ['игрок', 'игрока', 'игроков'])}`}>
        <Debutants c={c} />
      </Card>
    </div>
  );
}

function coachTiles(c: CoachStats): Tile[] {
  const t = c.all;
  return [
    { value: formatInt(t.p), label: plural(t.p, ['официальный матч', 'официальных матча', 'официальных матчей']) },
    { value: `${t.w}–${t.d}–${t.l}`, label: 'победы, ничьи, поражения' },
    { value: ppmText(t), label: `очка за матч · ${t.winPct ?? 0}% побед` },
    { value: `${t.gf}:${t.ga}`, label: `мячи · ${t.cleanSheets} «сухих»` },
  ];
}

function CoachSeasons({ c }: { c: CoachStats }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Сезон</th>
            <th>Лига</th>
            <th className="num">М</th>
            <th>{WDL}</th>
            <th className="num">Очки/м</th>
            <th className="num">Место</th>
          </tr>
        </thead>
        <tbody>
          {c.seasons.map(({ season: s, totals: t, led }) => (
            <tr key={s.id}>
              <td>
                <a href={seasonHref(s.label)}>{s.label}</a>
              </td>
              <td>{s.division}</td>
              <td className="num">{t.p}</td>
              <td>
                <Wdl t={t} />
              </td>
              <td className="num">{ppmText(t)}</td>
              <td className="num nowrap">
                {led && s.final_place ? `${s.final_place}${s.teams_count ? ` из ${s.teams_count}` : ''}` : <span className="muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RESULT_WORD = { W: 'победа', D: 'ничья', L: 'поражение' } as const;

function MatchRef({ m }: { m: CoachMatch }) {
  return (
    <>
      {m.match_date && `${formatDate(m.match_date)}, `}
      <a href={matchHref(m.id)}>
        {opponentName(m)} {formatScore(m)}
      </a>
      {m.result && <span className={`result-word result-word-${m.result}`}> — {RESULT_WORD[m.result]}</span>}
    </>
  );
}

function RunRef({ run, unit }: { run: Run; unit: [string, string, string] }) {
  if (run.n === 0 || !run.from || !run.to) return <span className="muted">—</span>;
  return (
    <>
      {run.n} {plural(run.n, unit)}{' '}
      <span className="muted">
        ({run.from.match_date && formatDate(run.from.match_date)} — {run.to.match_date && formatDate(run.to.match_date)})
      </span>
    </>
  );
}

function Milestones({ c }: { c: CoachStats }) {
  const items: [string, ReactNode][] = [];
  if (c.first) items.push(['Первый матч', <MatchRef m={c.first} />]);
  if (c.last) items.push(['Последний матч', <MatchRef m={c.last} />]);
  if (c.bigWin) items.push(['Крупнейшая победа', <MatchRef m={c.bigWin} />]);
  if (c.bigLoss) items.push(['Крупнейшее поражение', <MatchRef m={c.bigLoss} />]);
  items.push(
    ['Серия побед', <RunRef run={c.streaks.win} unit={['победа', 'победы', 'побед']} />],
    ['Без поражений', <RunRef run={c.streaks.unbeaten} unit={['матч', 'матча', 'матчей']} />],
    ['«Сухая» серия', <RunRef run={c.streaks.cleanSheets} unit={['матч', 'матча', 'матчей']} />],
    ['Серия поражений', <RunRef run={c.streaks.losses} unit={['поражение', 'поражения', 'поражений']} />],
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

function TopPlayers({ players, stat }: { players: CoachPlayer[]; stat: 'games' | 'goals' }) {
  const top = players
    .filter((p) => p[stat] > 0)
    .sort((a, b) => b[stat] - a[stat] || b.minutes - a.minutes || a.display_name.localeCompare(b.display_name, 'ru'))
    .slice(0, 5);
  if (top.length === 0) return <p className="muted">{stat === 'goals' ? 'Голов при нём не записано.' : 'Составов при нём не записано.'}</p>;
  return (
    <ol className="coach-top">
      {top.map((p) => (
        <li key={p.player_id}>
          <a href={playerHref(p.player_id)}>{p.display_name}</a>
          <b title={stat === 'games' ? `${formatInt(p.minutes)} минут` : undefined}>
            {stat === 'games' ? `${p.games} ${plural(p.games, ['матч', 'матча', 'матчей'])}` : p.goals}
          </b>
        </li>
      ))}
    </ol>
  );
}

function Debutants({ c }: { c: CoachStats }) {
  const academy = c.debutants.filter((d) => d.academy);
  return (
    <>
      <p className="coach-debut-line">
        {c.debutants.length > 0
          ? `${c.debutants.length} ${plural(c.debutants.length, ['игрок сыграл', 'игрока сыграли', 'игроков сыграли'])} первый официальный матч за «Амкар» при нём.`
          : 'Дебютантов при нём нет.'}
      </p>
      {academy.length > 0 && (
        <p className="coach-debut-line">
          <b>Воспитанники ({academy.length}):</b>{' '}
          {academy.map((d, k) => (
            <span key={d.player_id}>
              {k > 0 && ', '}
              <a href={playerHref(d.player_id)}>{d.display_name}</a>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

/** Что значат значки достижений — на телефоне подсказки при наведении нет. Только значки, которые есть в таблице. */
const ACHIEVEMENT_LEGEND: [string, string][] = [
  ['👑', 'рекорд клуба'],
  ['🏆', 'победа в лиге'],
  ['⬆', 'повышение'],
  ['⭐', 'место в Премьер-лиге'],
  ['🥈', 'финал Кубка'],
  ['🏟', 'полуфинал Кубка'],
  ['🌍', 'еврокубки'],
  ['🔥', 'серия побед'],
  ['🛡', 'без поражений'],
  ['🧱', '«сухие» подряд'],
  ['🌱', 'дебюты воспитанников'],
  ['⏳', '100+ матчей'],
];

function AchievementLegend({ stats }: { stats: CoachStats[] }) {
  const used = new Set(stats.flatMap((c) => c.achievements.map((a) => a.icon)));
  const shown = ACHIEVEMENT_LEGEND.filter(([icon]) => used.has(icon));
  if (shown.length === 0) return null;
  return (
    <p className="achievement-legend">
      {shown.map(([icon, text]) => (
        <span key={icon}>
          <span aria-hidden="true">{icon}</span> {text}
        </span>
      ))}
    </p>
  );
}
