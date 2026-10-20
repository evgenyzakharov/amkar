import { Card } from '../components/cards';
import { LoadStatus } from '../components/common';
import { loadPyramid, type PyramidData } from '../db/queries';
import { POSITION_LABEL, POSITION_TITLE, formatInt, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { TIER_NAMES, byTier, seasonSpan, tierBounds } from '../pyramid';
import { playerHref, seasonHref } from '../router';

const ALL = 'all';
const load = () => loadPyramid();
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** #/pyramid — игроки по ценности за карьеру ярусами, в духе пирамиды Билла Симмонса, и лучшие сезоны в истории. */
export function PyramidPage() {
  useDocumentTitle('Пирамида');
  const state = useLoad(ALL, load);
  return (
    <div className="card-page">
      <h1 className="page-title">Пирамида</h1>
      <p className="page-lead">
        Игроки «Амкара» по ценности за карьеру, в духе пирамиды Билла Симмонса. Очки сезона — минуты, голы и передачи, «сухие» матчи и
        победы с поправкой на уровень лиги и на то, как команда сыграла против ожиданий.
      </p>
      {state.status === 'ready' ? <Pyramid data={state.data} /> : <LoadStatus state={state} />}
    </div>
  );
}

function Pyramid({ data }: { data: PyramidData }) {
  const { careers, thresholds, peakSeasons, best, divisions } = data;
  return (
    <>
      <Card title="Пирамида" aside={`${careers.length} ${plural(careers.length, ['игрок', 'игрока', 'игроков'])}`}>
        <div className="pyramid">
          {byTier(careers).map(({ tier, rows }) => (
            <section className={`tier tier-${tier}`} key={tier} aria-label={TIER_NAMES[tier - 1]}>
              <div className="tier-head">
                <span className="tier-no">{ROMAN[tier - 1]}</span>
                <h3>{TIER_NAMES[tier - 1]}</h3>
                <span className="muted">
                  {tierBounds(tier, thresholds)} · {rows.length}
                </span>
              </div>
              {rows.length > 0 ? (
                <div className="tier-row">
                  {rows.map((c) => (
                    <a className="tier-chip" key={c.player_id} href={playerHref(c.player_id)} title={`${c.career_rank}-е место за карьеру`}>
                      <b>{c.display_name}</b>
                      <span className="tier-years">{seasonSpan(c.first_season, c.last_season)}</span>
                      <span className="tier-value">{formatInt(Math.round(c.value))}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted tier-empty">пока никого</p>
              )}
            </section>
          ))}
        </div>
        <p className="note">
          Ярус — по ценности за карьеру: сумма очков всех сезонов плюс {peakSeasons}{' '}
          {plural(peakSeasons, ['лучший сезон', 'лучших сезона', 'лучших сезонов'])} ещё раз. Под фамилией — годы в «Амкаре», ниже —
          ценность.
        </p>
      </Card>

      <Card title="Лучшие сезоны в истории">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Игрок</th>
                <th title="позиция">Поз.</th>
                <th>Сезон</th>
                <th>Лига</th>
                <th className="num">Очки</th>
              </tr>
            </thead>
            <tbody>
              {best.map((s, i) => (
                <tr key={`${s.season_id}-${s.player_id}`}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <a href={playerHref(s.player_id)}>{s.display_name}</a>
                  </td>
                  <td title={POSITION_TITLE[s.position]}>{POSITION_LABEL[s.position]}</td>
                  <td>
                    <a href={seasonHref(s.season_label)}>{s.season_label}</a>
                  </td>
                  <td className="muted">{divisions.get(s.season_id) ?? ''}</td>
                  <td className="num">
                    <b>{formatInt(Math.round(s.points))}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Как считаются очки">
        <ul className="points-explain">
          <li>
            <b>Сезон игрока</b> — все официальные матчи: сыгранные минуты и старты, голы (гол защитника дороже гола нападающего) и голевые
            передачи, «сухие» матчи и победы с ничьими, когда игрок провёл на поле 45 минут и больше.
          </li>
          <li>
            <b>Шкала</b> — смесь «абсолютных» очков и места среди игроков своего сезона. Очки, набранные в низших лигах, стоят дешевле;
            короткие и длинные сезоны приведены к сезону из 30 туров.
          </li>
          <li>
            <b>Команда</b> сыграла лучше ожиданий — очки всех её игроков в этом сезоне выше, хуже — ниже.
          </li>
          <li>
            <b>Поправка автора</b> — за яркий момент сезона или провальный сезон, с комментарием в карточке игрока.
          </li>
        </ul>
      </Card>
    </>
  );
}
