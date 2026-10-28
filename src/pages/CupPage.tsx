import { useMemo } from 'react';
import { Card, Tiles, type Tile } from '../components/cards';
import { LoadStatus, PageNav, ResultBadge } from '../components/common';
import { CUP_STAGES, FINAL, SEMI, biggestWins, cupEditions, editionResult, roundText, shootouts, shortScore, stageName, type CupEdition, type CupTie } from '../cup';
import { loadCup, type CupPageData } from '../db/queries';
import { totals } from '../coaches';
import type { MatchRow } from '../db/types';
import { RESULT_LABEL, VENUE_LABEL, formatDate, formatScore, opponentName, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { usePageState } from '../pageState';
import { historyHref, matchHref, opponentHref, playerHref } from '../router';

// Ключ один: страница не зависит от адреса
const ALL = 'all';
const load = () => loadCup();
const WDL = 'В⁠–⁠Н⁠–⁠П';
/** Серий пенальти в карточке сразу; остальные — по кнопке. */
const SHOOTOUTS_SHOWN = 6;
const TOP_SCORERS = 10;
/** Сколько игроков с голами, как у десятого, можно добавить к десятке, прежде чем свернуть их в строку. */
const TIED_EXTRA = 5;

export function CupPage() {
  useDocumentTitle('Кубок России');
  const state = useLoad(ALL, load);
  const editions = useMemo(
    () => (state.status === 'ready' ? cupEditions(state.data.matches, new Map(state.data.seasons.map((s) => [s.id, s.start_year]))) : []),
    [state],
  );

  return (
    <div className="card-page">
      <PageNav up={<a href={historyHref()}>← История</a>} />
      <h1 className="page-title">Кубок России</h1>
      {state.status !== 'ready' ? (
        <LoadStatus state={state} />
      ) : editions.length === 0 ? (
        <p className="muted">Кубковых матчей пока нет.</p>
      ) : (
        <>
          <Tiles tiles={cupTiles(editions)} label="Кубок в цифрах" />
          <Card title="Розыгрыши" aside="докуда доходили">
            <Ladder editions={editions} />
            <EditionList editions={editions} />
            <p className="note">
              Розыгрыш идёт с лета до весны: осенние матчи и ранние раунды весной — его начало, весенние матчи с 1/8 финала —
              окончание. Зелёным — прошли дальше, красным — на ком вылетели.
            </p>
          </Card>
          <div className="cup-cards">
            <BiggestWins data={state.data} />
            <Shootouts data={state.data} editions={editions} />
            <Scorers data={state.data} />
          </div>
          <AllMatches editions={editions} />
        </>
      )}
    </div>
  );
}

function cupTiles(editions: CupEdition[]): Tile[] {
  const matches = editions.flatMap((e) => e.matches);
  const t = totals(matches);
  const best = Math.max(...editions.map((e) => e.best));
  const bestEditions = editions.filter((e) => e.best === best);
  const final = best === FINAL && bestEditions.length === 1 ? bestEditions[0].ties.at(-1)!.matches.at(-1)! : null;
  const cups = editions.filter((e) => e.won);
  const semis = editions.filter((e) => e.best >= SEMI);
  const tiles: Tile[] = [
    { value: editions.length, label: `${plural(editions.length, ['розыгрыш', 'розыгрыша', 'розыгрышей'])} с ${editions[0].label}` },
    cups.length > 0
      ? { value: cups.length, label: `${plural(cups.length, ['кубок', 'кубка', 'кубков'])}: ${cups.map((e) => e.label).join(', ')}` }
      : {
          value: final ? <a href={matchHref(final.id)}>финал</a> : stageName(best),
          label: `${bestEditions.map((e) => e.label).join(', ')}${final ? ` — ${opponentName(final)} ${formatScore(final)}` : ''}, лучший результат`,
        },
  ];
  if (best > SEMI || semis.length > 1) {
    tiles.push({ value: semis.length, label: `${plural(semis.length, ['полуфинал', 'полуфинала', 'полуфиналов'])}: ${semis.map((e) => e.label).join(', ')}` });
  }
  tiles.push({ value: `${t.w}–${t.d}–${t.l}`, label: `${t.p} ${plural(t.p, ['матч', 'матча', 'матчей'])} · ${WDL}` });
  return tiles;
}

/** Стадии в таблице — от самой ранней, до которой есть матчи, до финала; неузнанные раунды — отдельным столбцом «Отбор». */
function stagesOf(editions: CupEdition[]) {
  const stages = new Set(editions.flatMap((e) => e.ties.map((t) => t.stage)));
  const from = Math.min(...[...stages].filter((s) => s >= 0), FINAL);
  return [...(stages.has(-1) ? [-1] : []), ...CUP_STAGES.map((_, i) => i).filter((i) => i >= from)];
}

const tieTitle = (t: CupTie) =>
  t.matches.map((m) => `${m.round ? roundText(m.round) : stageName(t.stage)}${m.match_date ? `, ${formatDate(m.match_date)}` : ''}: ${t.opponent} ${formatScore(m) || (m.result ? RESULT_LABEL[m.result] : '—')}`).join('; ');

/** Клетка «лестницы»: соперник, на ком вылетели — со счётом; ссылка — на решающий матч. */
function TieChip({ tie }: { tie: CupTie }) {
  const last = tie.matches.at(-1)!;
  const tone = tie.lost ? 'lost' : last.result == null ? 'ahead' : 'won';
  return (
    <a className={`cup-tie cup-tie-${tone}${tie.stage === FINAL ? ' cup-tie-final' : ''}`} href={matchHref(last.id)} title={tieTitle(tie)}>
      {tie.opponent}
      {tie.lost && <small>{tie.matches.map((m) => shortScore(m) || (m.result ? RESULT_LABEL[m.result] : '—')).join(' / ')}</small>}
    </a>
  );
}

/** «Лестница»: строка — розыгрыш, столбец — стадия. На телефоне вместо неё — список (EditionList). */
function Ladder({ editions }: { editions: CupEdition[] }) {
  const stages = stagesOf(editions);
  return (
    <div className="table-wrap cup-ladder">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Розыгрыш</th>
            {stages.map((s) => (
              <th scope="col" key={s}>
                {s < 0 ? 'Отбор' : CUP_STAGES[s]}
              </th>
            ))}
            <th scope="col">Итог</th>
          </tr>
        </thead>
        <tbody>
          {[...editions].reverse().map((e) => (
            <tr key={e.label}>
              <th scope="row">{e.label}</th>
              {stages.map((s) => (
                <td key={s}>
                  {e.ties
                    .filter((t) => t.stage === s)
                    .map((t) => (
                      <TieChip key={t.matches[0].id} tie={t} />
                    ))}
                </td>
              ))}
              <td className="muted">{editionResult(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Телефон: розыгрыш — полоса стадий, под ней соперники по порядку; на ком вылетели — жирным и со счётом. */
function EditionList({ editions }: { editions: CupEdition[] }) {
  return (
    <ul className="cup-list">
      {[...editions].reverse().map((e) => {
        const reached = e.best + 1;
        return (
          <li key={e.label}>
            <div className="cup-list-head">
              <b>{e.label}</b>
              <span className="cup-bar" aria-hidden="true">
                {CUP_STAGES.map((s, i) => (
                  <i key={s} className={i < reached ? (i === reached - 1 && e.exit ? 'lost' : 'on') : undefined} />
                ))}
              </span>
              <span className="muted">{editionResult(e)}</span>
            </div>
            <div className="cup-list-opps">
              {e.ties.map((t, i) => (
                <span key={t.matches[0].id}>
                  {i > 0 && ' · '}
                  {t.lost ? (
                    <b>
                      {t.opponent} <a href={matchHref(t.matches.at(-1)!.id)}>{t.matches.map((m) => shortScore(m) || '—').join(' / ')}</a>
                    </b>
                  ) : (
                    <a href={matchHref(t.matches.at(-1)!.id)} title={tieTitle(t)}>
                      {t.opponent}
                    </a>
                  )}
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OpponentLink({ m }: { m: MatchRow }) {
  return m.opponent_id ? <a href={opponentHref(m.opponent_id)}>{opponentName(m)}</a> : <>{opponentName(m)}</>;
}

function BiggestWins({ data }: { data: CupPageData }) {
  const wins = biggestWins(data.matches, 5);
  if (wins.length === 0) return null;
  return (
    <Card title="Крупнейшие победы">
      <ul className="cup-lines">
        {wins.map((m) => (
          <li key={m.id}>
            <a href={matchHref(m.id)}>{shortScore(m)}</a> — <OpponentLink m={m} />
            <span className="muted">
              {' '}
              · {roundText(m.round)}
              {m.match_date && `, ${formatDate(m.match_date)}`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Shootouts({ data, editions }: { data: CupPageData; editions: CupEdition[] }) {
  const [all, setAll] = usePageState('cupShootoutsAll', false);
  const list = shootouts(data.matches);
  if (list.length === 0) return null;
  const won = list.filter((m) => m.pens_for! > m.pens_against!).length;
  const longest = [...list].sort((a, b) => b.pens_for! + b.pens_against! - (a.pens_for! + a.pens_against!))[0];
  const editionOf = new Map(editions.flatMap((e) => e.matches.map((m) => [m.id, e.label])));
  return (
    <Card title="Серии пенальти" aside={`выиграно ${won} из ${list.length}`}>
      <ul className="cup-lines">
        {(all ? list : list.slice(0, SHOOTOUTS_SHOWN)).map((m) => (
          <li key={m.id}>
            <ResultBadge result={m.pens_for! > m.pens_against! ? 'W' : 'L'} /> <a href={matchHref(m.id)}>{formatScore(m)}</a> — <OpponentLink m={m} />
            <span className="muted"> · {editionOf.get(m.id)}</span>
          </li>
        ))}
      </ul>
      {list.length > SHOOTOUTS_SHOWN && (
        <button type="button" className="show-all" onClick={() => setAll(!all)}>
          {all ? `Только последние ${SHOOTOUTS_SHOWN}` : `Показать все (${list.length})`}
        </button>
      )}
      <p className="note">
        Самая длинная — {longest.pens_for}:{longest.pens_against} с «{opponentName(longest)}» ({editionOf.get(longest.id)}). Матч, выигранный по
        пенальти, — победа, как везде на сайте.
      </p>
    </Card>
  );
}

/**
 * Бомбардиры: десять лучших и все, у кого столько же голов, сколько у десятого; одинаковые значения делят место.
 * Если таких слишком много (по два гола — у полутора десятков), их не перечисляем — только сколько их.
 */
function Scorers({ data }: { data: CupPageData }) {
  const sorted = [...data.scorers].sort((a, b) => b.goals - a.goals || a.display_name.localeCompare(b.display_name, 'ru'));
  if (sorted.length === 0) return null;
  const cut = sorted[Math.min(TOP_SCORERS, sorted.length) - 1].goals;
  const tied = sorted.filter((s) => s.goals >= cut);
  const top = tied.length > TOP_SCORERS + TIED_EXTRA && sorted.some((s) => s.goals > cut) ? sorted.filter((s) => s.goals > cut) : tied;
  const rest = tied.length - top.length;
  return (
    <Card title="Бомбардиры кубка">
      <div className="table-wrap">
        <table className="data-table leaders-table">
          <thead>
            <tr>
              <th scope="col" className="num">
                Место
              </th>
              <th scope="col">Игрок</th>
              <th scope="col" className="num">
                Голы
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((s) => (
              <tr key={s.player_id}>
                <td className="num rank">{top.findIndex((x) => x.goals === s.goals) + 1}</td>
                <td>
                  <a href={playerHref(s.player_id)}>{s.display_name}</a>
                </td>
                <td className="num value">{s.goals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {rest > 0 && `По ${cut} ${plural(cut, ['голу', 'гола', 'голов'])} — ещё ${rest} ${plural(rest, ['игрок', 'игрока', 'игроков'])}. `}
        Голы по протоколам в базе, без автоголов соперника.
      </p>
    </Card>
  );
}

/** Все матчи — по розыгрышам, новые сверху; свёрнуто, как матчи сезона. */
function AllMatches({ editions }: { editions: CupEdition[] }) {
  const [open, setOpen] = usePageState('cupMatchesOpen', false);
  const count = editions.reduce((n, e) => n + e.matches.length, 0);
  return (
    <details className="card season-matches" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="card-title">Все матчи</span>
        <span className="card-aside">
          {count} {plural(count, ['матч', 'матча', 'матчей'])}
        </span>
      </summary>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Стадия</th>
              <th>Дата</th>
              <th>Соперник</th>
              <th>Где</th>
              <th>Счёт</th>
            </tr>
          </thead>
          {[...editions].reverse().map((e) => (
            <tbody key={e.label}>
              <tr className="group-row">
                <th colSpan={5} scope="rowgroup">
                  {e.label} <span className="muted">· {editionResult(e)}</span>
                </th>
              </tr>
              {e.matches.map((m) => (
                <tr key={m.id}>
                  <td>{roundText(m.round)}</td>
                  <td>{m.match_date ? formatDate(m.match_date) : '—'}</td>
                  <td>
                    <OpponentLink m={m} />
                  </td>
                  <td className="muted">{m.venue ? VENUE_LABEL[m.venue] : '—'}</td>
                  <td>
                    <a href={matchHref(m.id)} className="match-result-link">
                      <ResultBadge result={m.result} />
                      {formatScore(m)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </details>
  );
}
