import { Fragment, type ReactNode } from 'react';
import { EditLink, LoadStatus, PageNav, ResultBadge, Tag } from '../components/common';
import { loadMatch } from '../db/queries';
import type { Absence, AbsenceReason, Appearance, Goal, SquadEntry } from '../db/types';
import { VIDEO_KIND_LABEL, VIDEO_SITE_LABEL, loadMatchVideos, type MatchVideo } from '../db/videos';
import {
  ABSENCE_LABEL,
  AWARDED_LABEL,
  POSITION_ORDER,
  VENUE_LABEL,
  formatDate,
  formatHomeScore,
  num,
  opponentName,
} from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { adminMatchHref, coachHref, matchHref, playerHref, seasonHref } from '../router';

export function MatchPage({ id }: { id: number }) {
  const state = useLoad(id, loadMatch);
  // Видео — отдельным запросом: не загрузились — страница без них
  const videos = useLoad(id, loadMatchVideos);
  const match = state.status === 'ready' ? state.data.match : null;
  useDocumentTitle(match ? `${opponentName(match)}, ${match.season.label}` : `Матч №${id}`);
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  const { lineup, goals, absences, squad, prevId, nextId } = state.data;
  const m = state.data.match;
  // Хозяева слева: в гостях «Амкар» справа — в заголовке, счёте и голах
  const away = m.venue === 'away';
  const [left, right] = away ? [opponentName(m), 'Амкар'] : ['Амкар', opponentName(m)];
  const score = formatHomeScore(m);
  const details: ReactNode[] = [
    m.competition.name,
    m.round && (/^\d+$/.test(m.round) ? `${m.round}-й тур` : m.round),
    m.match_date && formatDate(m.match_date),
    m.venue && VENUE_LABEL[m.venue],
    m.coach && (
      <>
        тренер <a href={coachHref(m.coach.id)}>{m.coach.short_name}</a>
      </>
    ),
    m.formation && `схема ${m.formation}`,
  ].filter(Boolean);

  return (
    <>
      <PageNav
        up={
          <a href={seasonHref(m.season.label)}>
            ← Сезон {m.season.label}, матч №{m.seq}
          </a>
        }
        prev={prevId && <a href={matchHref(prevId)}>‹ предыдущий</a>}
        next={nextId && <a href={matchHref(nextId)}>следующий ›</a>}
      />
      <h2>
        {left} — {right} <EditLink href={adminMatchHref(m.id)} />
      </h2>
      <p className="match-score">
        <ResultBadge result={m.result} />
        {score && <span className="score">{score}</span>}
        {!m.result && <span className="muted">результат неизвестен</span>}
      </p>
      {details.length > 0 && (
        <p className="muted">
          {details.map((d, k) => (
            <Fragment key={k}>
              {k > 0 && ' · '}
              {d}
            </Fragment>
          ))}
        </p>
      )}
      {m.awarded && (
        <p className="note">
          Результат присуждён без игры{m.result && `: ${AWARDED_LABEL[m.result]}`}.
        </p>
      )}
      {m.notes && <p>{m.notes}</p>}

      {videos.status === 'ready' && videos.data.length > 0 && <Videos videos={videos.data} />}

      {goals.length > 0 && <Goals goals={goals} opponent={opponentName(m)} amkarRight={away} />}

      {lineup.length > 0 ? (
        <Lineup lineup={lineup} squad={squad} />
      ) : (
        !m.awarded && <p className="muted">Состав на матч не записан.</p>
      )}
      <Absences absences={absences} />
    </>
  );
}

/** Видео матча — ссылками в новой вкладке, без встроенных плееров и их трекеров. */
function Videos({ videos }: { videos: MatchVideo[] }) {
  return (
    <section>
      <h3>Видео</h3>
      <ul className="inline-list">
        {videos.map((v) => (
          <li key={v.id}>
            <a className="button" href={v.url} target="_blank" rel="noopener noreferrer" title={v.title ?? undefined}>
              {VIDEO_KIND_LABEL[v.kind]} · {VIDEO_SITE_LABEL[v.site]}
            </a>
            {v.title && <span className="muted"> {v.title}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Lineup({ lineup, squad }: { lineup: Appearance[]; squad: SquadEntry[] }) {
  const squadById = new Map(squad.map((s) => [s.player_id, s]));
  // Порядок как в заявке: вратари, защитники, полузащитники, нападающие, дальше — строки Excel
  const bySquad = (a: Appearance, b: Appearance) => {
    const sa = squadById.get(a.player_id);
    const sb = squadById.get(b.player_id);
    const pos = (s?: SquadEntry) => (s?.position ? POSITION_ORDER[s.position] : 9);
    return pos(sa) - pos(sb) || (sa?.sort_order ?? 999) - (sb?.sort_order ?? 999);
  };
  const number = (a: Appearance) => num(squadById.get(a.player_id)?.shirt_number);

  const starters = lineup.filter((a) => a.role === 'start').sort(bySquad);
  const subs = lineup
    .filter((a) => a.role === 'sub')
    .sort((a, b) => (a.minute_on ?? 999) - (b.minute_on ?? 999) || bySquad(a, b));
  // Старые матчи: роль не записана, известны только минуты
  const playedUnknown = lineup
    .filter((a) => a.role === null && (a.minutes ?? 0) > 0)
    .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0) || bySquad(a, b));
  const bench = lineup.filter((a) => a.role === 'bench' || (a.role === null && a.minutes === 0)).sort(bySquad);
  const minutesUnknown = lineup.filter((a) => a.role === null && a.minutes === null).sort(bySquad);

  const nameOf = new Map(lineup.map((a) => [a.player_id, a.player.display_name]));
  const replacedBy = new Map(subs.flatMap((s) => (s.replaced_player_id ? [[s.replaced_player_id, s] as const] : [])));
  const playerLink = (playerId: number) => <a href={playerHref(playerId)}>{nameOf.get(playerId)}</a>;

  const events = (a: Appearance) => {
    const list: ReactNode[] = [];
    if (a.role === 'sub' && a.replaced_player_id) list.push(<>вместо {playerLink(a.replaced_player_id)}</>);
    const replacement = replacedBy.get(a.player_id);
    if (a.sent_off) list.push(<Tag title="удалён с поля">удалён{a.minute_off ? ` на ${a.minute_off}'` : ''}</Tag>);
    else if (replacement) {
      list.push(
        <>
          замена на {replacement.minute_on ?? a.minute_off}': {playerLink(replacement.player_id)}
        </>,
      );
    } else if (a.minute_off) list.push(<>заменён на {a.minute_off}'</>);
    if (a.injured) list.push(<Tag title="получил травму в этом матче">травма</Tag>);
    return list.map((e, i) => (
      <span key={i} className="event">
        {e}
      </span>
    ));
  };

  const table = (rows: Appearance[], withMinuteOn: boolean) => (
    <div className="table-wrap">
      <table className="data-table lineup-table">
        <thead>
          <tr>
            {withMinuteOn && (
              <th className="num" title="минута выхода">
                Вышел
              </th>
            )}
            <th className="num">№</th>
            <th>Игрок</th>
            <th className="num" title="минуты на поле">
              Мин
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.player_id}>
              {withMinuteOn && <td className="num">{a.minute_on ? `${a.minute_on}'` : ''}</td>}
              <td className="num">{number(a)}</td>
              <td>{playerLink(a.player_id)}</td>
              <td className="num">{num(a.minutes)}</td>
              <td>{events(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const names = (rows: Appearance[]) => (
    <ul className="inline-list">
      {rows.map((a) => (
        <li key={a.player_id}>
          {number(a) && <span className="muted">{number(a)} </span>}
          {playerLink(a.player_id)}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {starters.length > 0 && (
        <section>
          <h3>Стартовый состав ({starters.length})</h3>
          {table(starters, false)}
        </section>
      )}
      {subs.length > 0 && (
        <section>
          <h3>Вышли на замену ({subs.length})</h3>
          {table(subs, true)}
        </section>
      )}
      {playedUnknown.length > 0 && (
        <section>
          <h3>{starters.length > 0 ? 'Ещё играли' : 'Играли'} ({playedUnknown.length})</h3>
          <p className="note">Кто вышел в старте, а кто на замену, не записано — известны только минуты.</p>
          {table(playedUnknown, false)}
        </section>
      )}
      {bench.length > 0 && (
        <section>
          <h3>Запасные ({bench.length})</h3>
          {names(bench)}
        </section>
      )}
      {minutesUnknown.length > 0 && (
        <section>
          <h3>В заявке, минуты неизвестны</h3>
          {names(minutesUnknown)}
        </section>
      )}
    </>
  );
}

/** Голы по ходу матча: колонки команд — как в заголовке, хозяева слева. */
function Goals({ goals, opponent, amkarRight }: { goals: Goal[]; opponent: string; amkarRight: boolean }) {
  const minute = (g: Goal) => (g.minute == null ? '' : `${g.minute}${g.added_time ? `+${g.added_time}` : ''}'`);
  const describe = (g: Goal) => {
    const name = g.scorer_id ? (
      <a href={playerHref(g.scorer_id)}>{g.scorer?.display_name}</a>
    ) : (
      (g.scorer_name ?? <span className="muted">автор неизвестен</span>)
    );
    return (
      <>
        {name}
        {g.kind === 'penalty' && <Tag title="с пенальти">пен.</Tag>}
        {g.kind === 'own_goal' && <Tag title="автогол">автогол</Tag>}
        {g.assist_id && (
          <span className="muted">
            {' '}
            (пас <a href={playerHref(g.assist_id)}>{g.assist?.display_name}</a>)
          </span>
        )}
      </>
    );
  };
  return (
    <section>
      <h3>Голы</h3>
      <div className="table-wrap">
        <table className="data-table goals-table">
          <thead>
            <tr>
              <th className="num">Мин</th>
              <th>{amkarRight ? opponent : 'Амкар'}</th>
              <th>{amkarRight ? 'Амкар' : opponent}</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g) => (
              <tr key={g.id}>
                <td className="num">{minute(g)}</td>
                <td>{g.side === (amkarRight ? 'opponent' : 'amkar') && describe(g)}</td>
                <td>{g.side === (amkarRight ? 'amkar' : 'opponent') && describe(g)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const ABSENCE_ORDER: AbsenceReason[] = ['injury', 'suspension', 'national_team'];

function Absences({ absences }: { absences: Absence[] }) {
  if (absences.length === 0) return null;
  return (
    <section>
      <h3>Пропустили матч</h3>
      <dl className="absences">
        {ABSENCE_ORDER.map((reason) => {
          const players = absences
            .filter((a) => a.reason === reason)
            .sort((a, b) => a.player.display_name.localeCompare(b.player.display_name, 'ru'));
          if (players.length === 0) return null;
          return (
            <div key={reason}>
              <dt>{ABSENCE_LABEL[reason]}</dt>
              <dd>
                <ul className="inline-list">
                  {players.map((a) => (
                    <li key={a.player_id}>
                      <a href={playerHref(a.player_id)}>{a.player.display_name}</a>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
