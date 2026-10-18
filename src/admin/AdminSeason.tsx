import { LoadStatus, PageNav, ResultBadge, Tag } from '../components/common';
import { COMPETITION_SHORT, formatDate, formatScore, opponentName } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { adminHref, adminMatchHref, adminNewMatchHref, adminSeasonHref, seasonHref, type SeasonTab } from '../router';
import { embeddedCount, loadAdminSeason } from './queries';
import { SeasonGrid } from './SeasonGrid';
import { SquadEditor } from './SquadEditor';
import { TransfersEditor } from './TransfersEditor';

const VENUE_SHORT = { home: 'д', away: 'г', neutral: 'н' } as const;

export function AdminSeason({ label, tab }: { label: string; tab: SeasonTab }) {
  useDocumentTitle(`Правка сезона ${label}`);
  const tabLink = (t: SeasonTab, text: string) => (
    <a href={adminSeasonHref(label, t)} className={tab === t ? 'active' : undefined} aria-current={tab === t ? 'page' : undefined}>
      {text}
    </a>
  );
  return (
    <>
      <PageNav up={<a href={adminHref}>← Админка</a>} next={<a href={seasonHref(label)}>на сайте ›</a>} />
      <h2>Сезон {label}</h2>
      <nav className="tabs">
        {tabLink('matches', 'Матчи')}
        {tabLink('grid', 'Сетка «игроки × матчи»')}
        {tabLink('squad', 'Заявка')}
        {tabLink('transfers', 'Трансферы')}
      </nav>
      {tab === 'grid' ? (
        <SeasonGrid label={label} />
      ) : tab === 'squad' ? (
        <SquadEditor label={label} />
      ) : tab === 'transfers' ? (
        <TransfersEditor label={label} />
      ) : (
        <SeasonMatches label={label} />
      )}
    </>
  );
}

function SeasonMatches({ label }: { label: string }) {
  const state = useLoad(label, loadAdminSeason);
  if (state.status !== 'ready') return <LoadStatus state={state} />;
  const { season, matches } = state.data;

  return (
    <>
      <p>
        <a className="button" href={adminNewMatchHref(season.label)}>
          + Добавить матч
        </a>
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="num">№</th>
              <th>Дата</th>
              <th>Турнир</th>
              <th>Соперник</th>
              <th title="результат">Рез.</th>
              <th>Счёт</th>
              <th className="num" title="игроков в заявке на матч">Состав</th>
              <th className="num" title="голов записано">Голы</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className={m.competition.kind === 'league' ? undefined : `row-${m.competition.kind}`}>
                <td className="num">{m.seq}</td>
                <td>{m.match_date ? formatDate(m.match_date) : <span className="muted">—</span>}</td>
                <td title={m.round ? `${m.competition.name}, ${m.round}` : m.competition.name}>
                  {COMPETITION_SHORT[m.competition.kind]}
                </td>
                <td>
                  <a href={adminMatchHref(m.id)}>{opponentName(m)}</a>
                  {m.venue && <span className="muted"> ({VENUE_SHORT[m.venue]})</span>}
                </td>
                <td>
                  <ResultBadge result={m.result} />
                </td>
                <td>
                  {formatScore(m)}
                  {m.awarded && <Tag title="результат присуждён без игры">тех.</Tag>}
                </td>
                <td className="num">{embeddedCount(m.appearance) || ''}</td>
                <td className="num">{embeddedCount(m.goal) || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {matches.length === 0 && <p className="muted">Матчей нет.</p>}
    </>
  );
}
