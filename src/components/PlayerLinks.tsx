// Карточка игрока как центр связей: ключевые матчи, при каких тренерах играл, соперники, все матчи с минутами.
// Отдельной частью страницы: не загрузилось — карточка без этих блоков.
import { Card } from './cards';
import { loadPlayerLinks, type PlayerLinksData, type PlayerMatch } from '../db/queries';
import { RESULT_LABEL, RESULT_TITLE, formatDate, formatScore, num, opponentName, plural } from '../format';
import { useLoad } from '../load';
import { usePageState } from '../pageState';
import { coachHref, matchHref, opponentHref, seasonHref } from '../router';

export function PlayerLinks({ id }: { id: number }) {
  const state = useLoad(id, loadPlayerLinks);
  if (state.status !== 'ready' || state.data.matches.length === 0) return null;
  return <Links data={state.data} />;
}

/** Соперник ссылкой на его страницу, если клуб есть в справочнике. */
const Opponent = ({ m }: { m: PlayerMatch['match'] }) =>
  m.opponent_id ? <a href={opponentHref(m.opponent_id)}>{opponentName(m)}</a> : <>{opponentName(m)}</>;

/** Результат значком и счёт ссылкой на матч: «В 1:1 д.в. (пен. 5:3)». */
function Score({ m }: { m: PlayerMatch['match'] }) {
  return (
    <span className="key-score">
      {m.result && (
        <span className={`result result-${m.result}`} title={RESULT_TITLE[m.result]}>
          {RESULT_LABEL[m.result]}
        </span>
      )}
      <a href={matchHref(m.id)}>{formatScore(m) || (m.result ? RESULT_TITLE[m.result] : 'матч')}</a>
    </span>
  );
}

function Links({ data }: { data: PlayerLinksData }) {
  const { matches, goals, assists, coaches } = data;
  const byId = new Map(matches.map((a) => [a.match.id, a]));
  const debut = (data.debutMatchId && byId.get(data.debutMatchId)) || matches[0];
  const first = data.firstGoal && byId.get(data.firstGoal.match_id);
  const last = matches.at(-1)!;
  const key: { term: string; a: PlayerMatch; note: string }[] = [
    { term: 'Дебют', a: debut, note: debut.match.competition.kind === 'league' ? debut.match.season.label : `${debut.match.competition.name}, ${debut.match.season.label}` },
    ...(first ? [{ term: 'Первый гол', a: first, note: data.firstGoal!.minute ? `гол на ${data.firstGoal!.minute}-й` : first.match.season.label }] : []),
    ...(last !== debut ? [{ term: 'Последний матч', a: last, note: last.match.season.label }] : []),
  ];

  return (
    <>
      <Card title="Ключевые матчи">
        <div className="key-matches">
          {key.map(({ term, a, note }) => (
            <div className="tile" key={term}>
              <div className="tile-label">{term}</div>
              <div className="key-date">{a.match.match_date ? formatDate(a.match.match_date) : `${a.match.season.label}, №${a.match.seq}`}</div>
              <Score m={a.match} />
              <div className="tile-label">
                <Opponent m={a.match} /> · {note}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="card-row card-row-even">
        {coaches.length > 0 && (
          <Card title="При тренерах">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Тренер</th>
                    <th className="num" title="матчи">
                      М
                    </th>
                    <th className="num" title="минуты">
                      Мин
                    </th>
                    <th className="num" title="голы">
                      Г
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coaches.map((c) => (
                    <tr key={c.coach_id}>
                      <td>
                        <a href={coachHref(c.coach_id)}>{c.name}</a>
                      </td>
                      <td className="num">{c.games}</td>
                      <td className="num">{c.minutes.toLocaleString('ru-RU')}</td>
                      <td className="num">{c.goals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <Opponents matches={matches} goals={goals} />
      </div>
      <AllMatches matches={matches} goals={goals} assists={assists} />
    </>
  );
}

/** С кем играл чаще всего и кому забивал. */
function Opponents({ matches, goals }: { matches: PlayerMatch[]; goals: Map<number, number> }) {
  const by = new Map<string, { m: PlayerMatch['match']; games: number; w: number; d: number; l: number; goals: number }>();
  for (const a of matches) {
    const k = a.match.opponent_id ? `id-${a.match.opponent_id}` : opponentName(a.match);
    const o = by.get(k) ?? { m: a.match, games: 0, w: 0, d: 0, l: 0, goals: 0 };
    o.games++;
    if (a.match.result === 'W') o.w++;
    else if (a.match.result === 'D') o.d++;
    else if (a.match.result === 'L') o.l++;
    o.goals += goals.get(a.match.id) ?? 0;
    by.set(k, o);
  }
  const list = [...by.values()];
  const often = [...list].sort((a, b) => b.games - a.games || b.goals - a.goals).slice(0, 6);
  const scored = list.filter((o) => o.goals > 0).sort((a, b) => b.goals - a.goals || b.games - a.games);
  return (
    <Card title="Соперники">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Чаще всего</th>
              <th className="num" title="матчи">
                М
              </th>
              <th>В–Н–П</th>
              <th className="num" title="голы">
                Г
              </th>
            </tr>
          </thead>
          <tbody>
            {often.map((o) => (
              <tr key={o.m.id}>
                <td>
                  <Opponent m={o.m} />
                </td>
                <td className="num">{o.games}</td>
                <td className="nowrap">
                  {o.w}–{o.d}–{o.l}
                </td>
                <td className="num">{o.goals || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scored.length > 0 && (
        <p className="note">
          Забивал:{' '}
          {scored.slice(0, 12).map((o, i) => (
            <span key={o.m.id}>
              {i > 0 && ', '}
              <Opponent m={o.m} /> — {o.goals}
            </span>
          ))}
          {scored.length > 12 && ` и ещё ${scored.length - 12} ${plural(scored.length - 12, ['сопернику', 'соперникам', 'соперникам'])}`}.
        </p>
      )}
    </Card>
  );
}

/** Все официальные матчи с минутами, голами и передачами — по сезонам, новые сверху; свёрнуто, как «Заявка». */
function AllMatches({ matches, goals, assists }: { matches: PlayerMatch[]; goals: Map<number, number>; assists: Map<number, number> }) {
  const [open, setOpen] = usePageState('allMatchesOpen', false);
  const seasons: { label: string; list: PlayerMatch[] }[] = [];
  for (const a of [...matches].reverse()) {
    if (seasons.at(-1)?.label !== a.match.season.label) seasons.push({ label: a.match.season.label, list: [] });
    seasons.at(-1)!.list.push(a);
  }
  return (
    <details className="card season-matches" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="card-title">Все матчи</span>
        <span className="card-aside">
          {matches.length} {plural(matches.length, ['официальный', 'официальных', 'официальных'])}
        </span>
      </summary>
      {open && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Соперник</th>
                <th>Турнир</th>
                <th>Счёт</th>
                <th className="num" title="минуты на поле">
                  Мин
                </th>
                <th className="num" title="голы">
                  Г
                </th>
                <th className="num" title="голевые передачи">
                  Пас
                </th>
              </tr>
            </thead>
            {seasons.map((s) => (
              <tbody key={s.label}>
                <tr className="group-row">
                  <th colSpan={7}>
                    <a href={seasonHref(s.label)}>{s.label}</a> <span className="muted">· {s.list.length}</span>
                  </th>
                </tr>
                {s.list.map((a) => (
                  <tr key={a.match.id}>
                    <td className="nowrap">{a.match.match_date ? formatDate(a.match.match_date) : `№${a.match.seq}`}</td>
                    <td>
                      <Opponent m={a.match} />
                    </td>
                    <td className="muted">{a.match.competition.kind === 'league' ? 'чемпионат' : a.match.competition.name}</td>
                    <td className="nowrap">
                      <Score m={a.match} />
                    </td>
                    <td className="num">{num(a.minutes)}</td>
                    <td className="num">{goals.get(a.match.id) ?? ''}</td>
                    <td className="num">{assists.get(a.match.id) ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </details>
  );
}
