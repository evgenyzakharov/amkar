import { EditLink, LoadStatus, PageNav, ResultBadge, Tag } from '../components/common';
import { loadSeason } from '../db/queries';
import type { BestXiSlot, MatchRow, PlayerSeasonStats, Result } from '../db/types';
import {
  BEST_XI_LINES,
  COMPETITION_SHORT,
  POSITION_LABEL,
  POSITION_TITLE,
  SLOT_LABEL,
  formatDate,
  formatScore,
  num,
  opponentName,
} from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { adminSeasonHref, matchHref, playerHref, seasonHref } from '../router';

export function SeasonPage({ label }: { label: string }) {
  useDocumentTitle(`Сезон ${label}`);
  const state = useLoad(label, loadSeason);
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  const { season, prev, next, matches, squad, bestXi } = state.data;
  const standing = [
    season.division,
    season.final_place && `${season.final_place} место${season.teams_count ? ` из ${season.teams_count}` : ''}`,
  ].filter(Boolean);

  return (
    <>
      <PageNav
        up={<a href="#/">← Все сезоны</a>}
        prev={prev && <a href={seasonHref(prev.label)}>‹ {prev.label}</a>}
        next={next && <a href={seasonHref(next.label)}>{next.label} ›</a>}
      />
      <h2>
        Сезон {season.label} <EditLink href={adminSeasonHref(season.label)} />
      </h2>
      {standing.length > 0 && <p className="muted">{standing.join(' · ')}</p>}
      <Summary matches={matches} />

      <section>
        <h3>Матчи</h3>
        {matches.length > 0 ? <MatchesTable matches={matches} /> : <p className="muted">Матчей нет.</p>}
      </section>

      <section>
        <h3>Заявка</h3>
        {'error' in squad ? (
          <p className="error">Статистика заявки не загрузилась: {squad.error}</p>
        ) : squad.data.length > 0 ? (
          <>
            <SquadTable squad={squad.data} />
            <p className="note">
              Игры и минуты — без товарищеских матчей. Голы и передачи — итоги сезона из таблицы автора, пустая ячейка
              — данных нет.
            </p>
          </>
        ) : (
          <p className="muted">Заявка не записана.</p>
        )}
      </section>

      {bestXi.length > 0 && (
        <section>
          <h3>Сборная сезона</h3>
          <BestXi slots={bestXi} />
        </section>
      )}
    </>
  );
}

/** Итог официальных матчей сезона. */
function Summary({ matches }: { matches: MatchRow[] }) {
  const official = matches.filter((m) => m.competition.kind !== 'friendly');
  if (official.length === 0) return null;

  const count = (r: Result) => official.filter((m) => m.result === r).length;
  const unknown = official.filter((m) => !m.result).length;
  // Мячи — только когда известен счёт всех сыгранных матчей, иначе сумма вводит в заблуждение
  const played = official.filter((m) => !m.awarded);
  const scored = played.length > 0 && played.every((m) => m.goals_for != null && m.goals_against != null);
  const goals = (key: 'goals_for' | 'goals_against') => played.reduce((sum, m) => sum + (m[key] ?? 0), 0);

  return (
    <p className="season-summary">
      Официальных матчей: <b>{official.length}</b>
      {(['W', 'D', 'L'] as const).map((r) => (
        <span key={r} className="summary-item">
          <ResultBadge result={r} /> {count(r)}
        </span>
      ))}
      {unknown > 0 && <span className="summary-item muted">результат неизвестен: {unknown}</span>}
      {scored && (
        <span className="summary-item">
          мячи {goals('goals_for')}–{goals('goals_against')}
        </span>
      )}
    </p>
  );
}

const VENUE_SHORT = { home: 'д', away: 'г', neutral: 'н' } as const;

function MatchesTable({ matches }: { matches: MatchRow[] }) {
  const hasDates = matches.some((m) => m.match_date);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="num">№</th>
            {hasDates && <th>Дата</th>}
            <th>Турнир</th>
            <th>Соперник</th>
            <th title="результат">Рез.</th>
            <th>Счёт</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id} className={m.competition.kind === 'league' ? undefined : `row-${m.competition.kind}`}>
              <td className="num">{m.seq}</td>
              {hasDates && <td>{m.match_date ? formatDate(m.match_date) : ''}</td>}
              <td title={m.round ? `${m.competition.name}, ${m.round}` : m.competition.name}>
                {COMPETITION_SHORT[m.competition.kind]}
              </td>
              <td>
                <a href={matchHref(m.id)}>{opponentName(m)}</a>
                {m.venue && <span className="muted"> ({VENUE_SHORT[m.venue]})</span>}
              </td>
              <td>
                <ResultBadge result={m.result} />
              </td>
              <td>
                {formatScore(m)}
                {m.awarded && <Tag title="результат присуждён без игры">тех.</Tag>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
            <th className="num" title="игры">И</th>
            <th className="num" title="минуты">Мин</th>
            <th className="num" title="голы">Г</th>
            <th className="num" title="голевые передачи">П</th>
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

function BestXi({ slots }: { slots: BestXiSlot[] }) {
  const bySlot = new Map(slots.map((s) => [s.slot, s.player]));
  const lines = BEST_XI_LINES.map((line) =>
    line.flatMap((slot) => {
      const player = bySlot.get(slot);
      return player ? [{ slot, player }] : [];
    }),
  ).filter((line) => line.length > 0);

  return (
    <div className="pitch">
      {lines.map((line) => (
        <div className="pitch-line" key={line.map((p) => p.slot).join()}>
          {line.map(({ slot, player }) => (
            <a className="pitch-player" key={slot} href={playerHref(player.id)}>
              <span className="pitch-slot">{SLOT_LABEL[slot]}</span>
              {player.display_name}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
