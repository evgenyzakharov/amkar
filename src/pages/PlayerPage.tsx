import { useState, type ReactNode } from 'react';
import { Card, ExternalLinks, Tiles, type Tile } from '../components/cards';
import { EditLink, LoadStatus, Tag } from '../components/common';
import { loadPlayer, type PlayerPoints } from '../db/queries';
import type { Player, PlayerSeasonStats, Transfer } from '../db/types';
import {
  DIRECTION_LABEL,
  POSITION_NAME,
  TRANSFER_KIND_LABEL,
  WINDOW_LABEL,
  formatDate,
  formatInt,
  formatRatio,
  plural,
  sumKnown,
} from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { tierName } from '../pyramid';
import { adminPlayerHref, playersHref, pyramidHref, seasonHref } from '../router';

export function PlayerPage({ id }: { id: number }) {
  const state = useLoad(id, loadPlayer);
  useDocumentTitle(state.status === 'ready' ? state.data.player.display_name : `Игрок №${id}`);
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  const { player, photoUrl, links, career, transfers, points } = state.data;
  const seasons = 'data' in career ? career.data : [];

  return (
    <div className="card-page">
      <nav className="crumbs" aria-label="Путь">
        <a href={playersHref}>Игроки</a> / {player.display_name} <EditLink href={adminPlayerHref(player.id)} />
      </nav>

      <PlayerHero player={player} photoUrl={photoUrl} seasons={seasons}>
        <ExternalLinks links={links} />
      </PlayerHero>

      {'error' in career ? (
        <p className="error">Статистика по сезонам не загрузилась: {career.error}</p>
      ) : seasons.length > 0 ? (
        <>
          <Tiles tiles={careerTiles(seasons)} label="Итоги за «Амкар»" />
          {seasons.some((s) => (s.goals ?? 0) > 0) && <GoalsChart seasons={seasons} />}
          {'data' in points && <SeasonPointsBlock data={points.data} seasons={seasons} />}
          <Card title="Карьера в клубе">
            <CareerTable seasons={seasons} />
          </Card>
        </>
      ) : (
        <p className="muted">В заявках «Амкара» не числился — известен только по трансферам.</p>
      )}

      {transfers.length > 0 && (
        <Card title="Трансферы">
          <TransfersTable transfers={transfers} />
        </Card>
      )}
    </div>
  );
}

/** Номер, под которым игрок провёл больше всего сезонов; при равенстве — последний. */
function mainNumber(seasons: PlayerSeasonStats[]): number | null {
  const count = new Map<number, number>();
  for (const s of seasons) if (s.shirt_number != null) count.set(s.shirt_number, (count.get(s.shirt_number) ?? 0) + 1);
  let best: number | null = null;
  for (const s of seasons) {
    const n = s.shirt_number;
    if (n != null && (best == null || (count.get(n) ?? 0) >= (count.get(best) ?? 0))) best = n;
  }
  return best;
}

/** Строка над фамилией: имя и отчество, а если их нет — инициал из display_name («Ю.» у «Ю. Волков»). */
function givenName(p: Player): string | null {
  if (p.first_name) return [p.first_name, p.middle_name].filter(Boolean).join(' ');
  const prefix = p.display_name.endsWith(p.last_name) ? p.display_name.slice(0, -p.last_name.length).trim() : '';
  return prefix || null;
}

const PhotoSilhouette = () => (
  <svg width="120" height="140" viewBox="0 0 120 140" fill="none" stroke="#6f6f6f" strokeWidth="3" role="img" aria-label="Фото нет">
    <circle cx="60" cy="46" r="26" />
    <path d="M14 136c4-30 24-46 46-46s42 16 46 46" />
  </svg>
);

/**
 * Фото игрока: загруженное в хранилище, иначе по ссылке с внешнего сайта, иначе силуэт.
 * Внешнюю картинку грузим без referer (часть сайтов не отдаёт её чужим) и лениво; не открылась — силуэт.
 */
function PlayerPhoto({ uploaded, external, credit, alt }: { uploaded: string | null; external: string | null; credit: string | null; alt: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = uploaded ?? external;
  const shown = src && failed !== src;
  return (
    <figure className="player-photo">
      {shown ? (
        uploaded ? (
          <img src={uploaded} alt={alt} />
        ) : (
          <img src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(src)} />
        )
      ) : (
        <PhotoSilhouette />
      )}
      {shown && credit && <figcaption>{credit}</figcaption>}
    </figure>
  );
}

function PlayerHero({
  player,
  photoUrl,
  seasons,
  children,
}: {
  player: Player;
  photoUrl: string | null;
  seasons: PlayerSeasonStats[];
  children: ReactNode;
}) {
  const number = mainNumber(seasons);
  const given = givenName(player);
  const fullName = [given, player.last_name].filter(Boolean).join(' ');
  const years =
    seasons.length > 0
      ? `${seasons[0].start_year}–${seasons[seasons.length - 1].end_year} · ${seasons.length} ${plural(seasons.length, ['сезон', 'сезона', 'сезонов'])}`
      : null;
  const facts = [
    player.position && { term: 'Позиция', value: POSITION_NAME[player.position], strong: true },
    player.birth_date && { term: 'Дата рождения', value: formatDate(player.birth_date), strong: false },
    (years || player.academy) && {
      term: 'В «Амкаре»',
      value: [years, player.academy && 'воспитанник'].filter(Boolean).join(' · '),
      strong: true,
    },
  ].filter((f) => !!f);

  return (
    <section className="card player-hero" aria-label="Игрок">
      <PlayerPhoto uploaded={photoUrl} external={player.photo_url ?? null} credit={player.photo_credit} alt={`Фото: ${fullName}`} />

      <div className="player-info">
        <div className="player-name-row">
          {number != null && (
            <span className="player-number" aria-label="Номер">
              {number}
            </span>
          )}
          <div className="player-name">
            {given && <div className="player-given">{given}</div>}
            <h1 className="player-surname">{player.last_name}</h1>
          </div>
        </div>

        {facts.length > 0 && (
          <dl className="facts">
            {facts.map((f) => (
              <div key={f.term}>
                <dt>{f.term}</dt>
                <dd className={f.strong ? 'strong' : undefined}>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {player.notes && <p className="player-notes">{player.notes}</p>}
        {children}
      </div>
    </section>
  );
}

function careerTiles(seasons: PlayerSeasonStats[]): Tile[] {
  const games = seasons.reduce((sum, s) => sum + s.games, 0);
  const minutes = seasons.reduce((sum, s) => sum + s.minutes, 0);
  const goals = sumKnown(seasons.map((s) => s.goals));
  const conceded = sumKnown(seasons.map((s) => s.goals_conceded));
  // Голы за матч — только по сезонам, где голы известны
  const gamesWithGoals = seasons.filter((s) => s.goals != null).reduce((sum, s) => sum + s.games, 0);
  const gamesWithConceded = seasons.filter((s) => s.goals_conceded != null).reduce((sum, s) => sum + s.games, 0);

  const tiles: Tile[] = [{ value: formatInt(games), label: plural(games, ['матч', 'матча', 'матчей']) }];
  if (goals != null && goals > 0) tiles.push({ value: formatInt(goals), label: plural(goals, ['гол', 'гола', 'голов']) });
  if (conceded != null) tiles.push({ value: formatInt(conceded), label: 'пропущено' });
  tiles.push({ value: formatInt(minutes), label: `${plural(minutes, ['минута', 'минуты', 'минут'])} на поле` });
  if (goals != null && goals > 0 && gamesWithGoals > 0) {
    tiles.push({ value: formatRatio(goals / gamesWithGoals), label: 'гола за матч' });
  } else if (conceded != null && gamesWithConceded > 0) {
    tiles.push({ value: formatRatio(conceded / gamesWithConceded), label: 'пропущено за матч' });
  }
  return tiles;
}

/** «'96», «'11/12» — подпись столбика. */
const shortSeason = (label: string) => `'${label.slice(2)}`;

function GoalsChart({ seasons }: { seasons: PlayerSeasonStats[] }) {
  const max = Math.max(...seasons.map((s) => s.goals ?? 0));
  return (
    <Card title="Голы по сезонам">
      <div className="chart-scroll">
        <div className="bars" style={{ minWidth: seasons.length * 48 }}>
          {seasons.map((s) => (
            <div className="bar-col" key={s.season_id} title={`${s.season_label}: ${s.goals ?? 'нет данных'}`}>
              <span className="bar-value">{s.goals ?? '—'}</span>
              {s.goals != null && <div className="bar" style={{ height: Math.max(2, Math.round((s.goals / max) * 150)) }} />}
              <span className="bar-label">{shortSeason(s.season_label)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Очки сезона по формуле пирамиды: ценность за карьеру, лучший сезон, ярус и полосы по сезонам. */
function SeasonPointsBlock({ data, seasons }: { data: PlayerPoints; seasons: PlayerSeasonStats[] }) {
  const bySeason = new Map(data.seasons.map((p) => [p.season_id, p]));
  // По порядку сезонов карьеры и только сезоны, где игрок выходил на поле
  const played = seasons.filter((s) => s.games > 0).flatMap((s) => bySeason.get(s.season_id) ?? []);
  if (played.length === 0 || !data.career) return null;
  const best = played.reduce((a, b) => (b.points > a.points ? b : a));
  const tier = tierName(data.career.tier);
  const tiles: Tile[] = [
    { value: formatInt(Math.round(data.career.value)), label: `ценность за карьеру — ${data.career.career_rank}-е место в истории` },
    { value: formatInt(Math.round(best.points)), label: `лучший сезон — ${best.season_label}, ${best.overall_rank}-й в истории` },
  ];
  if (tier) tiles.push({ value: <a href={pyramidHref}>{tier}</a>, label: 'ярус пирамиды' });

  return (
    <>
      <Tiles tiles={tiles} label="Пирамида" />
      <Card title="Очки по сезонам">
        <div className="points-bars">
          {played.map((p) => (
            <div className="points-row" key={p.season_id}>
              <a href={seasonHref(p.season_label)}>{p.season_label}</a>
              <div className="points-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(1, Math.min(100, (p.points / (data.scaleMax || 1)) * 100))}%` }} />
              </div>
              <b>{formatInt(Math.round(p.points))}</b>
              <span className="muted">{p.season_rank}-й в сезоне</span>
              {p.adjustment != null && (
                <span className="points-adjustment">
                  поправка автора {p.adjustment > 0 ? '+' : '−'}
                  {formatInt(Math.abs(p.adjustment))}: {p.adjustment_comment}
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="note">
          Очки — <a href={pyramidHref}>по формуле пирамиды</a>. Шкала полос общая для всех игроков: полная полоса — лучший сезон в
          истории.
        </p>
      </Card>
    </>
  );
}

/** Неизвестное значение — тире. */
const orDash = (n: number | null) => (n == null ? <span className="muted">—</span> : formatInt(n));

function CareerTable({ seasons }: { seasons: PlayerSeasonStats[] }) {
  const hasConceded = seasons.some((s) => s.goals_conceded != null);
  const total = (key: 'goals' | 'assists' | 'goals_conceded') => sumKnown(seasons.map((s) => s[key]));
  // Передачи в старых сезонах не учитывались: итог по ним неполный
  const assistsPartial = seasons.some((s) => s.assists == null) && total('assists') != null;

  return (
    <>
      <div className="table-wrap">
        <table className="data-table career-table">
          <thead>
            <tr>
              <th scope="col">Сезон</th>
              <th scope="col" className="num">
                №
              </th>
              <th scope="col" className="num">
                Матчи
              </th>
              <th scope="col" className="num">
                Минуты
              </th>
              <th scope="col" className="num">
                Голы
              </th>
              <th scope="col" className="num">
                Передачи
              </th>
              {hasConceded && (
                <th scope="col" className="num" title="пропущенные мячи (вратари)">
                  Пропущено
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {seasons.map((s) => (
              <tr key={s.season_id}>
                <th scope="row">
                  <a href={seasonHref(s.season_label)}>{s.season_label}</a>
                  {s.on_loan && <Tag title="в клубе на правах аренды">аренда</Tag>}
                  {s.squad_group === 'youth' && <Tag title="в молодёжном составе">молодёжь</Tag>}
                </th>
                <td className="num">{orDash(s.shirt_number)}</td>
                <td className="num">{s.games}</td>
                <td className="num">{formatInt(s.minutes)}</td>
                <td className="num strong">{orDash(s.goals)}</td>
                <td className="num">{orDash(s.assists)}</td>
                {hasConceded && <td className="num">{orDash(s.goals_conceded)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Итого</th>
              <td></td>
              <td className="num">{seasons.reduce((sum, s) => sum + s.games, 0)}</td>
              <td className="num">{formatInt(seasons.reduce((sum, s) => sum + s.minutes, 0))}</td>
              <td className="num">{orDash(total('goals'))}</td>
              <td className="num">
                {orDash(total('assists'))}
                {assistsPartial && '*'}
              </td>
              {hasConceded && <td className="num">{orDash(total('goals_conceded'))}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="note">
        Матчи и голы — все турниры, без товарищеских.{assistsPartial && ' * Передачи в старых сезонах не учитывались.'}
      </p>
    </>
  );
}

function TransfersTable({ transfers }: { transfers: Transfer[] }) {
  const hasDates = transfers.some((t) => t.transfer_date);
  const hasClubs = transfers.some((t) => t.other_team_name || t.team || t.other_team_raw);
  const hasNotes = transfers.some((t) => t.notes || t.kind);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Сезон</th>
            <th scope="col">Окно</th>
            {hasDates && <th scope="col">Дата</th>}
            <th scope="col"></th>
            {hasClubs && <th scope="col">Клуб</th>}
            {hasNotes && <th scope="col">Примечание</th>}
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
              {hasClubs && <td>{t.other_team_name ?? t.team?.name ?? t.other_team_raw}</td>}
              {/* Примечание автора точнее типа: «выкуп», «из аренды» */}
              {hasNotes && <td>{t.notes ?? (t.kind && TRANSFER_KIND_LABEL[t.kind])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
