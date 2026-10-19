import { useRef } from 'react';
import { Card, ExternalLinks, Tiles, type Tile } from '../components/cards';
import { EditLink, LoadStatus, Tag } from '../components/common';
import { SeasonHeatmap } from '../components/SeasonHeatmap';
import { loadSeason, type SeasonPageData } from '../db/queries';
import type { BestXiSlot, CompetitionKind, PlayerSeasonStats, SeasonMatch } from '../db/types';
import {
  AWARDED_LABEL,
  bestXiLines,
  POSITION_LABEL,
  POSITION_TITLE,
  RESULT_LABEL,
  RESULT_TITLE,
  SLOT_LABEL,
  SLOT_TITLE,
  num,
  opponentName,
  plural,
} from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { adminSeasonHref, matchHref, playerHref, seasonHref } from '../router';

export function SeasonPage({ label }: { label: string }) {
  useDocumentTitle(`Сезон ${label}`);
  const state = useLoad(label, loadSeason);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  return <SeasonCard data={state.data} />;
}

function SeasonCard({ data }: { data: SeasonPageData }) {
  const { season, prev, next, matches, squad, bestXi, formation, links } = data;
  const squadRef = useRef<HTMLDetailsElement>(null);

  const official = matches.filter((m) => m.competition.kind !== 'friendly');
  const friendlies = matches.filter((m) => m.competition.kind === 'friendly');
  const players = 'data' in squad ? squad.data : [];
  const squadLabel = `Весь состав — ${players.length} ${plural(players.length, ['игрок', 'игрока', 'игроков'])}`;
  const coach = mainCoach(official);
  const facts = [
    season.division && { term: 'Турнир', value: season.division },
    season.final_place && {
      term: 'Итоговое место',
      value: season.teams_count ? `${season.final_place} из ${season.teams_count}` : String(season.final_place),
    },
    coach && { term: 'Главный тренер', value: coach },
  ].filter((f) => !!f);

  const showSquad = () => {
    const el = squadRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Блок лидеров — только если есть кого показать: передачи в старых сезонах не учитывались (null)
  const hasGoals = players.some((p) => (p.goals ?? 0) > 0);
  const hasAssists = players.some((p) => (p.assists ?? 0) > 0);
  const squadButton = (
    <button type="button" className="link-button" onClick={showSquad}>
      {squadLabel}
    </button>
  );
  const leaderCards = [
    hasGoals && (
      <Card key="goals" title="Лучшие бомбардиры">
        <TopList players={players} stat="goals" />
        <p className="note">Голы во всех турнирах. {squadButton}</p>
      </Card>
    ),
    hasAssists && (
      <Card key="assists" title="Лучшие ассистенты">
        <TopList players={players} stat="assists" />
        <p className="note">
          Передачи во всех турнирах.{!hasGoals && <> {squadButton}</>}
        </p>
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

      <Tiles tiles={seasonTiles(official)} label="Итоги сезона" />

      {matches.length > 0 ? (
        <Card title="Результаты по ходу сезона" aside={legend(official)}>
          {official.length > 0 && <ResultStrip matches={official} />}
          {friendlies.length > 0 && (
            <>
              <h3 className="strip-title">Товарищеские матчи</h3>
              <ResultStrip matches={friendlies} />
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
        <details className="card squad-details" ref={squadRef}>
          <summary className="card-title">{squadLabel}</summary>
          <SquadTable squad={players} />
          <p className="note">
            {players[0]?.goals_source === 'matches'
              ? 'Игры, минуты, голы и передачи — по записанным матчам, без товарищеских.'
              : 'Игры и минуты — без товарищеских матчей. Голы и передачи — итоги сезона из таблицы автора, пустая ячейка — данных нет.'}
          </p>
        </details>
      ) : (
        <p className="muted">Заявка не записана.</p>
      )}
    </div>
  );
}

/** Главный тренер — тот, кто провёл больше всего официальных матчей сезона. */
function mainCoach(matches: SeasonMatch[]): string | null {
  const count = new Map<number, { name: string; n: number }>();
  for (const m of matches) {
    if (!m.coach) continue;
    const c = count.get(m.coach.id) ?? { name: m.coach.full_name, n: 0 };
    c.n += 1;
    count.set(m.coach.id, c);
  }
  let best: { name: string; n: number } | null = null;
  for (const c of count.values()) if (!best || c.n > best.n) best = c;
  return best?.name ?? null;
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

function legend(official: SeasonMatch[]) {
  const ringed = [...new Set(official.filter((m) => RINGED.includes(m.competition.kind)).map((m) => m.competition.name))];
  return `В — победа · Н — ничья · П — поражение${ringed.length ? ` · с рамкой — ${ringed.join(', ')}` : ''}`;
}

/** Матчи квадратами по порядку: буква результата и счёт, пока счёта нет — номер матча. */
function ResultStrip({ matches }: { matches: SeasonMatch[] }) {
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
          </li>
        );
      })}
    </ol>
  );
}

/** Лучшие по голам или передачам: пять строк, только больше нуля — null значит «не учитывались», а не ноль. */
function TopList({ players, stat }: { players: PlayerSeasonStats[]; stat: 'goals' | 'assists' }) {
  const value = (p: PlayerSeasonStats) => p[stat] ?? 0;
  const leaders = players
    .filter((p) => value(p) > 0)
    .sort((a, b) => value(b) - value(a) || a.games - b.games || a.display_name.localeCompare(b.display_name, 'ru'))
    .slice(0, 5);
  const top = leaders.length > 0 ? value(leaders[0]) : 1;
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

function SquadTable({ squad }: { squad: PlayerSeasonStats[] }) {
  const hasPositions = squad.some((p) => p.position);
  const hasConceded = squad.some((p) => p.goals_conceded != null);
  const columns = 6 + Number(hasPositions) + Number(hasConceded);
  const groups = [
    { title: null, rows: squad.filter((p) => p.squad_group === 'main') },
    { title: 'Молодёжь', rows: squad.filter((p) => p.squad_group === 'youth') },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="num">№</th>
            {hasPositions && <th title="позиция">Поз.</th>}
            <th>Игрок</th>
            <th className="num" title="игры">
              И
            </th>
            <th className="num" title="минуты">
              Мин
            </th>
            <th className="num" title="голы">
              Г
            </th>
            <th className="num" title="голевые передачи">
              П
            </th>
            {hasConceded && (
              <th className="num" title="пропущенные мячи (вратари)">
                Проп.
              </th>
            )}
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
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
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
