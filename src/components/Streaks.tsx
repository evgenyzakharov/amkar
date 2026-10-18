// Серии результатов: рекорды за историю и лучшие серии каждого сезона (view team_streaks)
import { Card, ScopeSwitch } from './cards';
import { LoadStatus } from './common';
import { loadStreaks } from '../db/queries';
import type { SeasonSummary, StreakKind, TeamStreak } from '../db/types';
import { formatDate, plural } from '../format';
import { useLoad } from '../load';
import { historyHref, matchHref, seasonHref, type LeadersScope } from '../router';

// Ключ один: все серии грузятся разом, фильтр — на странице
const ALL = 'all';
const load = () => loadStreaks();

const KINDS: { kind: StreakKind; title: string; column: string }[] = [
  { kind: 'win', title: 'Победная', column: 'Победы' },
  { kind: 'unbeaten', title: 'Беспроигрышная', column: 'Без поражений' },
  { kind: 'loss', title: 'Проигрышная', column: 'Поражения' },
  { kind: 'winless', title: 'Без побед', column: 'Без побед' },
];

/** Сколько серий показать под рекордом. */
const RUNNERS = 4;

/** Матч серии: дата, а если её нет — сезон и номер матча. */
const point = (date: string | null, season: string, seq: number) => (date ? formatDate(date) : `${season}, №${seq}`);

/** Начало и конец серии текстом — для подсказки. */
function rangeText(s: TeamStreak): string {
  const from = point(s.first_date, s.first_season_label, s.first_seq);
  if (s.length === 1) return from;
  if (!s.first_date && !s.last_date && s.first_season_label === s.last_season_label) {
    return `${s.first_season_label}, матчи №${s.first_seq}–${s.last_seq}`;
  }
  return `${from} — ${point(s.last_date, s.last_season_label, s.last_seq)}`;
}

/** Начало и конец серии ссылками на матчи. */
function StreakRange({ s }: { s: TeamStreak }) {
  const first = <a href={matchHref(s.first_match_id)}>{point(s.first_date, s.first_season_label, s.first_seq)}</a>;
  if (s.length === 1) return first;
  if (!s.first_date && !s.last_date && s.first_season_label === s.last_season_label) {
    return (
      <>
        {s.first_season_label}, матчи <a href={matchHref(s.first_match_id)}>№{s.first_seq}</a>–
        <a href={matchHref(s.last_match_id)}>{s.last_seq}</a>
      </>
    );
  }
  return (
    <>
      {first} — <a href={matchHref(s.last_match_id)}>{point(s.last_date, s.last_season_label, s.last_seq)}</a>
    </>
  );
}

/** Из чего сложена смешанная серия: «17 побед, 10 ничьих». */
function composition(s: TeamStreak): string | null {
  const parts = {
    unbeaten: [
      [s.wins, ['победа', 'победы', 'побед']],
      [s.draws, ['ничья', 'ничьи', 'ничьих']],
    ],
    winless: [
      [s.draws, ['ничья', 'ничьи', 'ничьих']],
      [s.losses, ['поражение', 'поражения', 'поражений']],
    ],
  } as const;
  if (s.kind !== 'unbeaten' && s.kind !== 'winless') return null;
  return parts[s.kind]
    .filter(([n]) => n > 0)
    .map(([n, forms]) => `${n} ${plural(n, [...forms])}`)
    .join(', ');
}

export function Streaks({ seasons, scope }: { seasons: SeasonSummary[]; scope: LeadersScope }) {
  const state = useLoad(ALL, load);
  const streaks = state.status === 'ready' ? state.data.filter((s) => s.scope === scope) : [];

  return (
    <>
      <Card title="Серии" aside={<ScopeSwitch scope={scope} href={historyHref} />}>
        {state.status !== 'ready' ? <LoadStatus state={state} /> : <Records streaks={streaks} />}
        <p className="note">
          {scope === 'league' ? 'Только матчи чемпионата.' : 'Все официальные матчи, без товарищеских.'} Серии идут по
          порядку матчей через границы сезонов и рвутся на матче с неизвестным результатом (весь 2013/14) и на перерыве
          2018–2021: с 2021 года — новый клуб.
        </p>
      </Card>
      {state.status === 'ready' && (
        <Card title="Лучшие серии каждого сезона">
          <SeasonBest streaks={streaks} seasons={seasons} />
          <p className="note">Самая длинная серия в пределах сезона, в матчах. Подсказка и ссылка — на первый матч серии.</p>
        </Card>
      )}
    </>
  );
}

function Records({ streaks }: { streaks: TeamStreak[] }) {
  const history = streaks.filter((s) => s.span === 'history');
  return (
    <div className="streak-records">
      {KINDS.map(({ kind, title }) => {
        const list = history.filter((s) => s.kind === kind);
        const best = list.filter((s) => s.rank === 1);
        if (best.length === 0) return null;
        const rest = list.filter((s) => s.rank !== 1);
        return (
          <div key={kind} className={`streak-card streak-${kind}`}>
            <div className="streak-kind">{title}</div>
            <div className="streak-length">
              {best[0].length} <span>{plural(best[0].length, ['матч', 'матча', 'матчей'])}</span>
            </div>
            {best.map((s) => (
              <div key={s.first_match_id} className="streak-range">
                <StreakRange s={s} />
                {composition(s) && <div className="streak-comp">{composition(s)}</div>}
              </div>
            ))}
            {rest.length > 0 && (
              <ol className="streak-runners" aria-label="Следующие по длине">
                {rest.slice(0, RUNNERS).map((s) => (
                  <li key={s.first_match_id}>
                    <span className="streak-runner-len">{s.length}</span> <StreakRange s={s} />
                  </li>
                ))}
                {rest.length > RUNNERS && <li className="muted">и ещё {rest.length - RUNNERS} такой же длины</li>}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SeasonBest({ streaks, seasons }: { streaks: TeamStreak[]; seasons: SeasonSummary[] }) {
  const best = new Map(
    streaks.filter((s) => s.span === 'season').map((s) => [`${s.season_id}:${s.kind}`, s] as const),
  );
  // Рекорд столбца — жирным
  const max = new Map(
    KINDS.map(({ kind }) => [
      kind,
      Math.max(0, ...seasons.map((season) => best.get(`${season.season_id}:${kind}`)?.length ?? 0)),
    ]),
  );
  return (
    <div className="table-wrap">
      <table className="data-table streak-table">
        <thead>
          <tr>
            <th scope="col">Сезон</th>
            {KINDS.map(({ kind, title, column }) => (
              <th key={kind} scope="col" className="num" title={`${title} серия`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seasons.map((season) => (
            <tr key={season.season_id}>
              <th scope="row">
                <a href={seasonHref(season.label)}>{season.label}</a>
              </th>
              {KINDS.map(({ kind }) => {
                const s = best.get(`${season.season_id}:${kind}`);
                return (
                  <td key={kind} className={`num${s && s.length === max.get(kind) ? ' strong' : ''}`}>
                    {s ? (
                      <a href={matchHref(s.first_match_id)} title={rangeText(s)}>
                        {s.length}
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
