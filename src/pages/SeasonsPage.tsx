import { Card } from '../components/cards';
import { LoadStatus } from '../components/common';
import { loadHome, type AnyMatch, type HomeData } from '../db/queries';
import type { CareerStats, Season } from '../db/types';
import { RESULT_LABEL, RESULT_TITLE, SEASON_EPOCHS, VENUE_LABEL, formatDate, formatScore, opponentCodes, opponentName, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { matchHref, opponentHref, playerHref, seasonHref } from '../router';

// Ключ один: главная не зависит от адреса
const ALL = 'all';

/** До круглой цифры — не больше стольких матчей или голов: тогда игрок «близко к рубежу». */
const GAMES_NEAR = 30;
const GOALS_NEAR = 6;

export function SeasonsPage() {
  useDocumentTitle(null);
  const state = useLoad(ALL, loadHome);

  return (
    <div className="card-page">
      <h1 className="page-title">Сезоны</h1>
      {state.status !== 'ready' && <LoadStatus state={state} />}
      {state.status === 'ready' && state.data.seasons.length === 0 && <p className="muted">Данных пока нет.</p>}
      {state.status === 'ready' && state.data.seasons.length > 0 && <Home data={state.data} />}
    </div>
  );
}

function Home({ data }: { data: HomeData }) {
  const official = data.matches.filter((m) => m.competition.kind !== 'friendly');
  const current = data.seasons.at(-1)!;
  const near = nearMilestones(data.current);
  const today = new Date();
  const day = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const onThisDay = official
    .filter((m) => m.match_date?.slice(5) === day && m.match_date < today.toISOString().slice(0, 10))
    .sort((a, b) => a.match_date!.localeCompare(b.match_date!));
  return (
    <>
      <div className="home-cards">
        <CurrentSeason season={current} matches={official.filter((m) => m.season_id === current.id).sort((a, b) => a.seq - b.seq)} />
        {onThisDay.length > 0 && (
          <Card title={`В этот день · ${today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}>
            <ul className="home-list">
              {onThisDay.map((m) => (
                <li key={m.id}>
                  <b>{m.match_date!.slice(0, 4)}</b> <MatchLine m={m} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {near.length > 0 && (
          <Card title="Близко к рубежу">
            <ul className="milestone-near">
              {near.map((n) => (
                <li key={`${n.player.player_id}-${n.stat}`}>
                  <a href={playerHref(n.player.player_id)}>{n.player.display_name}</a> — <b>{n.value}</b>{' '}
                  {n.stat === 'games' ? plural(n.value, ['матч', 'матча', 'матчей']) : plural(n.value, ['гол', 'гола', 'голов'])}, до {n.target} — {n.target - n.value}
                  <div className="milestone-bar" aria-hidden="true">
                    <div style={{ width: `${Math.round((100 * (n.value - (n.target - n.step))) / n.step)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="note">
              Действующие игроки, которым до круглой цифры осталось не больше {GAMES_NEAR} матчей или {GOALS_NEAR} голов. Официальные матчи.
            </p>
          </Card>
        )}
      </div>

      <div className="epochs">
        {/* Новые эпохи и сезоны — сверху */}
        {[...SEASON_EPOCHS].reverse().map((epoch) => {
          const i = SEASON_EPOCHS.indexOf(epoch);
          const from = i === 0 ? -Infinity : SEASON_EPOCHS[i - 1].until;
          const seasons = data.seasons.filter((s) => s.start_year > from && s.start_year <= epoch.until).reverse();
          return (
            seasons.length > 0 && (
              <Card key={epoch.title} title={epoch.title}>
                <SeasonList seasons={seasons} />
              </Card>
            )
          );
        })}
      </div>
    </>
  );
}

/** Нынешний сезон: лига, место, последние пять официальных матчей. */
function CurrentSeason({ season, matches }: { season: Season; matches: AnyMatch[] }) {
  const last = matches.filter((m) => m.result).slice(-5);
  const codes = opponentCodes(matches.map(opponentName));
  const lastMatch = last.at(-1);
  return (
    <Card title={`Сезон ${season.label}`} aside={<a href={seasonHref(season.label)}>открыть ›</a>}>
      {season.division && <p className="muted home-division">{season.division}</p>}
      <p className="home-facts">
        {season.final_place && `${season.final_place}-е место${season.teams_count ? ` из ${season.teams_count}` : ''} · `}
        {matches.length} {plural(matches.length, ['официальный матч', 'официальных матча', 'официальных матчей'])}
      </p>
      {last.length > 0 && (
        <ol className="result-strip">
          {last.map((m) => {
            const title = `${m.seq}. ${opponentName(m)} — ${RESULT_TITLE[m.result!]}${formatScore(m) ? `, ${formatScore(m)}` : ''}`;
            return (
              <li key={m.id}>
                <a href={matchHref(m.id)} className={`form-square tone-${m.result}`} title={title} aria-label={title}>
                  <span className="form-letter">{RESULT_LABEL[m.result!]}</span>
                  <span className="form-sub">{formatScore(m) || m.seq}</span>
                </a>
                <span className="form-opp" aria-hidden="true">
                  {codes.get(opponentName(m))}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {lastMatch && (
        <p className="note">
          Последний: {lastMatch.match_date ? `${formatDate(lastMatch.match_date)}, ` : ''}
          <MatchLine m={lastMatch} />
        </p>
      )}
    </Card>
  );
}

/** «Салют 5:1, дома» — соперник ссылкой, счёт — на матч. */
function MatchLine({ m }: { m: AnyMatch }) {
  return (
    <>
      {m.opponent_id ? <a href={opponentHref(m.opponent_id)}>{opponentName(m)}</a> : opponentName(m)}{' '}
      <a href={matchHref(m.id)}>{formatScore(m) || (m.result ? RESULT_TITLE[m.result] : 'матч')}</a>
      {m.venue && <span className="muted">, {VENUE_LABEL[m.venue]}</span>}
    </>
  );
}

interface Near {
  player: CareerStats;
  stat: 'games' | 'goals';
  value: number;
  target: number;
  step: number;
}

/** Кому из действующих осталось немного до 100, 200… матчей или 50, 100… голов — ближайшие сверху. */
function nearMilestones(players: CareerStats[]): Near[] {
  const out: Near[] = [];
  for (const p of players) {
    const games = { stat: 'games' as const, value: p.games, step: 100, within: GAMES_NEAR };
    const goals = { stat: 'goals' as const, value: p.goals ?? 0, step: 50, within: GOALS_NEAR };
    for (const x of [games, goals]) {
      const target = (Math.floor(x.value / x.step) + 1) * x.step;
      if (x.value > 0 && target - x.value <= x.within) out.push({ player: p, stat: x.stat, value: x.value, target, step: x.step });
    }
  }
  return out.sort((a, b) => (a.target - a.value) / a.step - (b.target - b.value) / b.step).slice(0, 6);
}

function SeasonList({ seasons }: { seasons: Season[] }) {
  return (
    <ul className="season-list">
      {seasons.map((s) => (
        <li key={s.id}>
          <a className="season-label" href={seasonHref(s.label)}>
            {s.label}
          </a>
          {s.division && <span className="muted"> · {s.division}</span>}
          {s.final_place && (
            <span className="muted">
              {' '}
              · {s.final_place}
              {s.teams_count ? ` из ${s.teams_count}` : ' место'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
