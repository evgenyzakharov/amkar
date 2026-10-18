import { LoadStatus, PageNav, Tag } from '../components/common';
import { loadPlayer } from '../db/queries';
import type { PlayerSeasonStats, Transfer } from '../db/types';
import {
  DIRECTION_LABEL,
  POSITION_LABEL,
  POSITION_TITLE,
  TRANSFER_KIND_LABEL,
  WINDOW_LABEL,
  formatDate,
  num,
  sumKnown,
} from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { seasonHref } from '../router';

export function PlayerPage({ id }: { id: number }) {
  const state = useLoad(id, loadPlayer);
  useDocumentTitle(state.status === 'ready' ? state.data.player.display_name : `Игрок №${id}`);
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  const { player, career, transfers } = state.data;
  const fullName = [player.last_name, player.first_name, player.middle_name].filter(Boolean).join(' ');
  const facts = [
    player.first_name && fullName,
    player.birth_date && `родился ${formatDate(player.birth_date)}`,
    player.academy && 'воспитанник клуба',
  ].filter(Boolean);

  return (
    <>
      <PageNav up={<a href="#/">← Все сезоны</a>} />
      <h2>{player.display_name}</h2>
      {facts.length > 0 && <p className="muted">{facts.join(' · ')}</p>}
      {player.notes && <p>{player.notes}</p>}

      <section>
        <h3>Сезоны в «Амкаре»</h3>
        {'error' in career ? (
          <p className="error">Статистика по сезонам не загрузилась: {career.error}</p>
        ) : career.data.length > 0 ? (
          <>
            <CareerTable seasons={career.data} />
            <p className="note">
              Игры и минуты — без товарищеских матчей. Голы и передачи — итоги сезона из таблицы автора, пустая ячейка
              — данных нет.
            </p>
          </>
        ) : (
          <p className="muted">В заявках «Амкара» не числился — известен только по трансферам.</p>
        )}
      </section>

      <section>
        <h3>Трансферы</h3>
        {transfers.length > 0 ? <TransfersTable transfers={transfers} /> : <p className="muted">Трансферов не записано.</p>}
      </section>
    </>
  );
}

function CareerTable({ seasons }: { seasons: PlayerSeasonStats[] }) {
  const hasDivision = seasons.some((s) => s.division);
  const hasPositions = seasons.some((s) => s.position);
  const hasConceded = seasons.some((s) => s.goals_conceded != null);
  const total = (key: 'goals' | 'assists' | 'goals_conceded') => num(sumKnown(seasons.map((s) => s[key])));

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Сезон</th>
            {hasDivision && <th>Лига</th>}
            <th className="num">№</th>
            {hasPositions && <th title="позиция">Поз.</th>}
            <th className="num" title="игры">И</th>
            <th className="num" title="минуты">Мин</th>
            <th className="num" title="голы">Г</th>
            <th className="num" title="голевые передачи">П</th>
            {hasConceded && (
              <th className="num" title="пропущенные мячи (вратари)">
                Проп.
              </th>
            )}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={s.season_id}>
              <td>
                <a href={seasonHref(s.season_label)}>{s.season_label}</a>
              </td>
              {hasDivision && <td>{s.division}</td>}
              <td className="num">{num(s.shirt_number)}</td>
              {hasPositions && (
                <td title={s.position ? POSITION_TITLE[s.position] : undefined}>
                  {s.position ? POSITION_LABEL[s.position] : ''}
                </td>
              )}
              <td className="num">{s.games}</td>
              <td className="num">{s.minutes}</td>
              <td className="num">{num(s.goals)}</td>
              <td className="num">{num(s.assists)}</td>
              {hasConceded && <td className="num">{num(s.goals_conceded)}</td>}
              <td>
                {s.on_loan && <Tag title="в клубе на правах аренды">аренда</Tag>}
                {s.squad_group === 'youth' && <Tag title="в молодёжном составе">молодёжь</Tag>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Всего</th>
            {hasDivision && <td></td>}
            <td></td>
            {hasPositions && <td></td>}
            <td className="num">{seasons.reduce((sum, s) => sum + s.games, 0)}</td>
            <td className="num">{seasons.reduce((sum, s) => sum + s.minutes, 0)}</td>
            <td className="num">{total('goals')}</td>
            <td className="num">{total('assists')}</td>
            {hasConceded && <td className="num">{total('goals_conceded')}</td>}
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TransfersTable({ transfers }: { transfers: Transfer[] }) {
  const hasDates = transfers.some((t) => t.transfer_date);
  const hasClubs = transfers.some((t) => t.team || t.other_team_raw);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Сезон</th>
            <th>Окно</th>
            {hasDates && <th>Дата</th>}
            <th></th>
            {hasClubs && <th>Клуб</th>}
            <th>Примечание</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={t.id}>
              <td>
                <a href={seasonHref(t.season.label)}>{t.season.label}</a>
              </td>
              <td>{t.transfer_window ? WINDOW_LABEL[t.transfer_window] : ''}</td>
              {hasDates && <td>{t.transfer_date ? formatDate(t.transfer_date) : ''}</td>}
              <td className={`direction-${t.direction}`}>{DIRECTION_LABEL[t.direction]}</td>
              {hasClubs && <td>{t.team?.name ?? t.other_team_raw}</td>}
              {/* Примечание автора точнее типа: «выкуп», «из аренды» */}
              <td>{t.notes ?? (t.kind && TRANSFER_KIND_LABEL[t.kind])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
