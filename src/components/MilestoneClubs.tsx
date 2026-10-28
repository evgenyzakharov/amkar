// Клубы 100, 200, 300 матчей и рубежи голов: кто и в каком матче перешёл рубеж (view player_milestones)
import { Card } from './cards';
import { LoadStatus } from './common';
import { loadMilestones } from '../db/queries';
import type { CareerStats, Milestone } from '../db/types';
import { formatDate, plural } from '../format';
import { useLoad } from '../load';
import { matchHref, playerHref } from '../router';

// Ключ один: рубежи не зависят от адреса
const ALL = 'all';
const load = () => loadMilestones();

/** Когда перейдён рубеж: матч ссылкой (дата или сезон и номер) и соперник. */
function Reached({ m }: { m: Milestone }) {
  return (
    <>
      <a href={matchHref(m.match_id)}>{m.match_date ? formatDate(m.match_date) : `${m.season_label}, №${m.seq}`}</a>
      {m.opponent && <span className="muted"> · {m.opponent}</span>}
    </>
  );
}

export function MilestoneClubs({ careers }: { careers: CareerStats[] }) {
  const state = useLoad(ALL, load);
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  const { milestones, seasons } = state.data;
  // По времени: порядок сезона, внутри — номер матча
  const seasonOrder = new Map(seasons.map((s, i) => [s.id, i]));
  const when = (m: Milestone) => (seasonOrder.get(m.season_id) ?? 0) * 1000 + m.seq;
  const career = new Map(careers.map((c) => [c.player_id, c]));

  const games = milestones.filter((m) => m.stat === 'games');
  const clubs = [...new Set(games.map((m) => m.milestone))].sort((a, b) => b - a);
  const goals = milestones.filter((m) => m.stat === 'goals').sort((a, b) => b.milestone - a.milestone || when(a) - when(b));

  return (
    <>
      {clubs.map((club) => {
        const members = games.filter((m) => m.milestone === club).sort((a, b) => when(a) - when(b));
        return (
          <Card key={club} title={`Клуб ${club}`} aside={`${members.length} ${plural(members.length, ['игрок', 'игрока', 'игроков'])}`}>
            <div className="table-wrap">
              <table className="data-table clubs-table">
                <thead>
                  <tr>
                    <th scope="col">Игрок</th>
                    <th scope="col">{club}-й матч</th>
                    <th scope="col" className="num">
                      Всего
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.player_id}>
                      <td>
                        <a href={playerHref(m.player_id)}>{m.display_name}</a>
                      </td>
                      <td>
                        <Reached m={m} />
                      </td>
                      <td className="num value">{career.get(m.player_id)?.games}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {goals.length > 0 && (
        <Card title="Рубежи голов" aside="каждые 50">
          <div className="table-wrap">
            <table className="data-table clubs-table">
              <thead>
                <tr>
                  <th scope="col">Игрок</th>
                  <th scope="col" className="num">
                    Рубеж
                  </th>
                  <th scope="col">Когда</th>
                  <th scope="col" className="num">
                    Всего
                  </th>
                </tr>
              </thead>
              <tbody>
                {goals.map((m) => (
                  <tr key={`${m.player_id}:${m.milestone}`}>
                    <td>
                      <a href={playerHref(m.player_id)}>{m.display_name}</a>
                    </td>
                    <td className="num value">{m.milestone}</td>
                    <td>
                      <Reached m={m} />
                    </td>
                    <td className="num value">{career.get(m.player_id)?.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="note">
        Матчи и голы — официальные, без товарищеских, как в таблицах «По играм» и «По голам». Рубеж — матч, в котором
        игрок его перешёл.
      </p>
    </>
  );
}
