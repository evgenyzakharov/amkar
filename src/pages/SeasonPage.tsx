import { useState } from 'react';
import { Card, ExternalLinks, Tiles, type Tile } from '../components/cards';
import { EditLink, LoadStatus, Tag } from '../components/common';
import { SeasonHeatmap } from '../components/SeasonHeatmap';
import { loadSeason, type SeasonPageData } from '../db/queries';
import type { BestXiSlot, CompetitionKind, PlayerSeasonStats, SeasonMatch, SeasonPoints } from '../db/types';
import {
  AWARDED_LABEL,
  bestXiLines,
  formatInt,
  POSITION_LABEL,
  POSITION_ORDER,
  POSITION_TITLE,
  RESULT_LABEL,
  RESULT_TITLE,
  SLOT_LABEL,
  SLOT_TITLE,
  num,
  opponentCodes,
  opponentName,
  plural,
} from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { adminSeasonHref, coachHref, matchHref, playerHref, pyramidHref, seasonHref } from '../router';

export function SeasonPage({ label }: { label: string }) {
  useDocumentTitle(`Сезон ${label}`);
  const state = useLoad(label, loadSeason);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <SeasonCard data={state.data} />;
}

function SeasonCard({ data }: { data: SeasonPageData }) {
  const { season, prev, next, matches, squad, bestXi, formation, links } = data;
  // Очки сезона — отдельной частью: без миграции очков страница показывается без них
  const points = 'data' in data.points ? data.points.data : [];
  const pointsBy = new Map(points.map((p) => [p.player_id, p]));
  const leader = points[0]?.points > 0 ? points[0] : null;

  const official = matches.filter((m) => m.competition.kind !== 'friendly');
  const friendlies = matches.filter((m) => m.competition.kind === 'friendly');
  const codes = opponentCodes(matches.map(opponentName));
  const players = 'data' in squad ? squad.data : [];
  // Бомбардиры и ассистенты: все турниры или только чемпионат — одним переключателем на обе карточки
  const [leagueOnly, setLeagueOnly] = useState(false);
  const leagueBy = new Map(data.league.map((l) => [l.player_id, l]));
  const coach = mainCoach(official);
  const facts = [
    season.division && { term: 'Турнир', value: season.division },
    season.final_place && {
      term: 'Итоговое место',
      value: season.teams_count ? `${season.final_place} из ${season.teams_count}` : String(season.final_place),
    },
    coach && { term: 'Главный тренер', value: <a href={coachHref(coach.id)}>{coach.name}</a> },
  ].filter((f) => !!f);

  // Блок лидеров — только если есть кого показать: передачи в старых сезонах не учитывались (null)
  const hasGoals = players.some((p) => (p.goals ?? 0) > 0);
  const hasAssists = players.some((p) => (p.assists ?? 0) > 0);
  const scopeSwitch = leagueBy.size > 0 && (
    <span className="segmented" role="group" aria-label="Турниры">
      <button type="button" className={leagueOnly ? undefined : 'active'} aria-pressed={!leagueOnly} onClick={() => setLeagueOnly(false)}>
        Все турниры
      </button>
      <button type="button" className={leagueOnly ? 'active' : undefined} aria-pressed={leagueOnly} onClick={() => setLeagueOnly(true)}>
        Только чемпионат
      </button>
    </span>
  );
  const statOf = (stat: 'goals' | 'assists') => (p: PlayerSeasonStats) =>
    leagueOnly ? (leagueBy.get(p.player_id)?.[stat === 'goals' ? 'goals_league' : 'assists_league'] ?? 0) : (p[stat] ?? 0);
  const leaderCards = [
    hasGoals && (
      <Card key="goals" title="Лучшие бомбардиры" aside={scopeSwitch}>
        <TopList players={players} value={statOf('goals')} />
      </Card>
    ),
    hasAssists && (
      <Card key="assists" title="Лучшие ассистенты" aside={scopeSwitch}>
        <TopList players={players} value={statOf('assists')} />
      </Card>
    ),
  ].filter((card) => !!card);
  const xiCard = bestXi.length > 0 && (
    <Card title="Сборная сезона" aside={formation && <span className="formation-label">{formation}</span>}>
      <BestXi slots={bestXi} formation={formation} />
    </Card>
  );

  return (
    <div className="card-page">
      <nav className="crumbs crumbs-split" aria-label="Путь и соседние сезоны">
        <span>
          <a href="#/">Сезоны</a> / {season.label}
        </span>
        <span className="crumbs-siblings">
          {prev && <a href={seasonHref(prev.label)}>← {prev.label}</a>}
          {next && <a href={seasonHref(next.label)}>{next.label} →</a>}
        </span>
      </nav>

      <section className="season-hero" aria-label="Сезон">
        <div className="season-hero-main">
          <div>
            <div className="season-kicker">Сезон</div>
            <h1 className="season-title">{season.label}</h1>
          </div>
          {facts.length > 0 && (
            <dl className="band-facts">
              {facts.map((f) => (
                <div key={f.term}>
                  <dt>{f.term}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="season-hero-side">
          <ExternalLinks links={links} />
          <EditLink href={adminSeasonHref(season.label)} />
        </div>
      </section>

      <Tiles tiles={[...seasonTiles(official), ...(leader ? [leaderTile(leader)] : [])]} label="Итоги сезона" />

      {matches.length > 0 ? (
        <Card title="Результаты по ходу сезона" aside={legend(official)}>
          {official.length > 0 && <ResultStrip matches={official} codes={codes} />}
          {friendlies.length > 0 && (
            <>
              <h3 className="strip-title">Товарищеские матчи</h3>
              <ResultStrip matches={friendlies} codes={codes} />
            </>
          )}
        </Card>
      ) : (
        <p className="muted">Матчей нет.</p>
      )}

      {leaderCards.length === 2 ? (
        // Бомбардиры и ассистенты — парой, сборная сезона — под ними во всю ширину
        <>
          <div className="card-row card-row-even">{leaderCards}</div>
          {xiCard}
        </>
      ) : (
        (leaderCards.length > 0 || xiCard) && (
          <div className="card-row">
            {leaderCards}
            {xiCard}
          </div>
        )
      )}

      {players.length > 0 && matches.length > 0 && (
        <Card title="Минуты по матчам">
          <SeasonHeatmap seasonId={season.id} matches={matches} squad={players} />
        </Card>
      )}

      {'error' in squad ? (
        <p className="error">Статистика заявки не загрузилась: {squad.error}</p>
      ) : players.length > 0 ? (
        <details className="card squad-details">
          <summary className="card-title">Заявка</summary>
          <SquadTable squad={players} points={pointsBy} />
          <p className="note">
            {players[0]?.goals_source === 'matches'
              ? 'Игры, минуты, голы и передачи — по записанным матчам, без товарищеских.'
              : 'Игры и минуты — без товарищеских матчей. Голы и передачи — итоги сезона без разбивки по матчам, пустая ячейка — данных нет.'}
            {pointsBy.size > 0 && (
              <>
                {' '}
                Очки — <a href={pyramidHref}>по формуле Амкаровской пирамиды</a>, место в сезоне — во всплывающей подсказке; звёздочка — с поправкой.
              </>
            )}
          </p>
        </details>
      ) : (
        <p className="muted">Заявка не записана.</p>
      )}
    </div>
  );
}

/** Плитка «игрок сезона по очкам»: лучший по очкам сезона и его место среди всех сезонов в истории. */
function leaderTile(p: SeasonPoints): Tile {
  return {
    value: <a href={playerHref(p.player_id)}>{p.display_name}</a>,
    label: `игрок сезона по очкам — ${formatInt(Math.round(p.points))}, ${p.overall_rank}-й сезон в истории`,
  };
}

/** Главный тренер — тот, кто провёл больше всего официальных матчей сезона. */
function mainCoach(matches: SeasonMatch[]): { id: number; name: string } | null {
  const count = new Map<number, { id: number; name: string; n: number }>();
  for (const m of matches) {
    if (!m.coach) continue;
    const c = count.get(m.coach.id) ?? { id: m.coach.id, name: m.coach.full_name, n: 0 };
    c.n += 1;
    count.set(m.coach.id, c);
  }
  let best: { id: number; name: string; n: number } | null = null;
  for (const c of count.values()) if (!best || c.n > best.n) best = c;
  return best && { id: best.id, name: best.name };
}

// «В–Н–П» не переносится по тире: между буквами — невидимые неразрывные соединители
const WDL = 'В⁠–⁠Н⁠–⁠П';

const wdl = (matches: SeasonMatch[]) => {
  const n = (r: string) => matches.filter((m) => m.result === r).length;
  return { w: n('W'), d: n('D'), l: n('L'), unknown: matches.filter((m) => !m.result).length };
};

function seasonTiles(official: SeasonMatch[]): Tile[] {
  if (official.length === 0) return [];
  const tiles: Tile[] = [
    { value: official.length, label: `${plural(official.length, ['матч', 'матча', 'матчей'])} в сезоне` },
  ];

  const league = official.filter((m) => m.competition.kind === 'league');
  const lr = wdl(league);
  // Результаты неизвестны у всех матчей — плитка «0–0–0» соврала бы
  if (league.length > lr.unknown) {
    tiles.push({
      value: `${lr.w}–${lr.d}–${lr.l}`,
      label: `чемпионат: ${WDL}${lr.unknown ? `, без результата ${lr.unknown}` : ''}`,
    });
    // Очки — только когда известны все результаты
    if (lr.unknown === 0) {
      const points = lr.w * 3 + lr.d;
      tiles.push({ value: points, label: `${plural(points, ['очко', 'очка', 'очков'])} в чемпионате` });
    }
  }

  // Кубок, еврокубок, стыковые — по плитке на турнир
  const others = new Map<string, SeasonMatch[]>();
  for (const m of official) {
    if (m.competition.kind === 'league') continue;
    others.set(m.competition.name, [...(others.get(m.competition.name) ?? []), m]);
  }
  for (const [name, list] of others) {
    const r = wdl(list);
    if (list.length > r.unknown) tiles.push({ value: `${r.w}–${r.d}–${r.l}`, label: `${name}: ${WDL}` });
  }
  return tiles;
}

const RINGED: CompetitionKind[] = ['cup', 'europe', 'playoff'];

/** Подпись к квадратам: какие турниры обведены рамкой. */
function legend(official: SeasonMatch[]) {
  const ringed = [...new Set(official.filter((m) => RINGED.includes(m.competition.kind)).map((m) => m.competition.name))];
  return ringed.length ? `с рамкой — ${ringed.join(', ')}` : undefined;
}

/** Матчи квадратами по порядку: буква результата и счёт, пока счёта нет — номер матча; под квадратом — соперник в 3–4 буквы. */
function ResultStrip({ matches, codes }: { matches: SeasonMatch[]; codes: Map<string, string> }) {
  return (
    <ol className="result-strip">
      {matches.map((m) => {
        const score = m.goals_for != null && m.goals_against != null ? `${m.goals_for}:${m.goals_against}` : null;
        const outcome = m.result ? (m.awarded ? AWARDED_LABEL[m.result] : RESULT_TITLE[m.result]) : 'результат неизвестен';
        const other = m.competition.kind !== 'league' ? ` (${m.competition.name})` : '';
        const title = `${m.seq}. ${opponentName(m)}${other} — ${outcome}${score ? `, ${score}` : ''}`;
        const ringed = RINGED.includes(m.competition.kind);
        return (
          <li key={m.id}>
            <a
              href={matchHref(m.id)}
              className={`form-square tone-${m.result ?? 'unknown'}${ringed ? ' ringed' : ''}`}
              title={title}
              aria-label={title}
            >
              <span className="form-letter">{m.result ? RESULT_LABEL[m.result] : '?'}</span>
              <span className="form-sub">{score ?? m.seq}</span>
            </a>
            <span className="form-opp" aria-hidden="true">
              {codes.get(opponentName(m))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Лучшие по голам или передачам: пять строк, только больше нуля — null значит «не учитывались», а не ноль. */
function TopList({ players, value }: { players: PlayerSeasonStats[]; value: (p: PlayerSeasonStats) => number }) {
  const leaders = players
    .filter((p) => value(p) > 0)
    .sort((a, b) => value(b) - value(a) || a.games - b.games || a.display_name.localeCompare(b.display_name, 'ru'))
    .slice(0, 5);
  if (leaders.length === 0) return <p className="muted">Данных нет.</p>;
  const top = value(leaders[0]);
  return (
    <ol className="scorers">
      {leaders.map((s) => {
        // Равные значения — одно место
        const rank = leaders.findIndex((x) => value(x) === value(s)) + 1;
        return (
          <li key={s.player_id}>
            <span className="scorer-rank">{rank}</span>
            <div className="scorer-main">
              <a href={playerHref(s.player_id)}>{s.display_name}</a>
              <div className="scorer-track">
                <div className="scorer-bar" style={{ width: `${Math.round((value(s) / top) * 100)}%` }} />
              </div>
            </div>
            <span className="scorer-goals">{value(s)}</span>
          </li>
        );
      })}
    </ol>
  );
}

type SquadSort = 'number' | 'position' | 'name' | 'games' | 'minutes' | 'goals' | 'assists' | 'conceded' | 'points';

/** Заявка сезона: порядок — как в заявке, по клику на заголовок — сортировка (основа и молодёжь — отдельно). */
function SquadTable({ squad, points }: { squad: PlayerSeasonStats[]; points: Map<number, SeasonPoints> }) {
  const [sort, setSort] = useState<{ key: SquadSort; dir: 1 | -1 } | null>(null);
  const hasPositions = squad.some((p) => p.position);
  const hasConceded = squad.some((p) => p.goals_conceded != null);
  const hasPoints = points.size > 0;
  const columns = 6 + Number(hasPositions) + Number(hasConceded) + Number(hasPoints);
  const value: Record<SquadSort, (p: PlayerSeasonStats) => number | string> = {
    number: (p) => p.shirt_number ?? 999,
    position: (p) => (p.position ? POSITION_ORDER[p.position] : 9),
    name: (p) => p.display_name,
    games: (p) => p.games,
    minutes: (p) => p.minutes,
    goals: (p) => p.goals ?? -1,
    assists: (p) => p.assists ?? -1,
    conceded: (p) => p.goals_conceded ?? -1,
    points: (p) => points.get(p.player_id)?.points ?? -1,
  };
  const sorted = (rows: PlayerSeasonStats[]) => {
    if (!sort) return rows;
    const f = value[sort.key];
    return [...rows].sort((a, b) => {
      const [va, vb] = [f(a), f(b)];
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir || a.display_name.localeCompare(b.display_name, 'ru');
    });
  };
  const groups = [
    { title: null, rows: sorted(squad.filter((p) => p.squad_group === 'main')) },
    { title: 'Молодёжь', rows: sorted(squad.filter((p) => p.squad_group === 'youth')) },
  ].filter((g) => g.rows.length > 0);
  // числа — сначала большие, номер, позиция и фамилия — по возрастанию
  const by = (key: SquadSort) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: ['number', 'position', 'name'].includes(key) ? 1 : -1 }));
  const head = (key: SquadSort, label: string, title?: string, num = true) => (
    <th className={num ? 'num' : undefined} title={title} aria-sort={sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sort-button" onClick={() => by(key)}>
        {label}
        {sort?.key === key && (sort.dir === 1 ? ' ↑' : ' ↓')}
      </button>
    </th>
  );

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {head('number', '№')}
            {hasPositions && head('position', 'Поз.', 'позиция', false)}
            {head('name', 'Игрок', undefined, false)}
            {head('games', 'И', 'игры')}
            {head('minutes', 'Мин', 'минуты')}
            {head('goals', 'Г', 'голы')}
            {head('assists', 'П', 'голевые передачи')}
            {hasConceded && head('conceded', 'Проп.', 'пропущенные мячи (вратари)')}
            {hasPoints && head('points', 'Очки', 'очки сезона по формуле Амкаровской пирамиды')}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.title ?? 'main'}>
            {g.title && (
              <tr className="group-row">
                <th colSpan={columns}>{g.title}</th>
              </tr>
            )}
            {g.rows.map((p) => (
              <tr key={p.player_id}>
                <td className="num">{num(p.shirt_number)}</td>
                {hasPositions && (
                  <td title={p.position ? POSITION_TITLE[p.position] : undefined}>
                    {p.position ? POSITION_LABEL[p.position] : ''}
                  </td>
                )}
                <td>
                  <a href={playerHref(p.player_id)}>{p.display_name}</a>
                  {p.academy && <Tag title="воспитанник клуба">восп.</Tag>}
                  {p.on_loan && <Tag title="в клубе на правах аренды">аренда</Tag>}
                </td>
                <td className="num">{p.games}</td>
                <td className="num">{p.minutes}</td>
                <td className="num">{num(p.goals)}</td>
                <td className="num">{num(p.assists)}</td>
                {hasConceded && <td className="num">{num(p.goals_conceded)}</td>}
                {hasPoints && <PointsCell points={points.get(p.player_id)} />}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** Очки сезона в заявке: место в сезоне — подсказкой, поправка — звёздочкой. */
function PointsCell({ points }: { points: SeasonPoints | undefined }) {
  if (!points) return <td className="num" />;
  const title = [
    `${points.season_rank}-е место в сезоне`,
    points.adjustment ? `поправка ${points.adjustment > 0 ? '+' : '−'}${Math.abs(points.adjustment)}: ${points.adjustment_comment}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return (
    <td className="num" title={title}>
      {formatInt(Math.round(points.points))}
      {points.adjustment ? '*' : ''}
    </td>
  );
}

function BestXi({ slots, formation }: { slots: BestXiSlot[]; formation: string }) {
  const bySlot = new Map(slots.map((s) => [s.slot, s.player]));
  const lines = bestXiLines(formation, [...bySlot.keys()]).map((line) =>
    line.flatMap((slot) => {
      const player = bySlot.get(slot);
      return player ? [{ slot, player }] : [];
    }),
  );

  return (
    <div className="pitch">
      {lines.map((line) => (
        <div className="pitch-line" key={line.map((p) => p.slot).join()}>
          {line.map(({ slot, player }) => (
            <a className="pitch-player" key={slot} href={playerHref(player.id)}>
              <span className="pitch-slot" title={SLOT_TITLE[SLOT_LABEL[slot]]}>
                {SLOT_LABEL[slot]}
              </span>
              {player.display_name}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
