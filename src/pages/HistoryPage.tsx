import { Fragment } from 'react';
import { Card, Tiles, type Tile } from '../components/cards';
import { LoadStatus } from '../components/common';
import { Streaks } from '../components/Streaks';
import { loadHistory } from '../db/queries';
import type { CareerStats, SeasonSummary } from '../db/types';
import { NEW_CLUB_FROM, SEASON_EPOCHS, formatInt, formatRatio, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { playerHref, seasonHref, type LeadersScope } from '../router';

// Ключ один: история не зависит от адреса
const ALL = 'all';
const load = () => loadHistory();

/** Очки за матч в чемпионате; null — ни одного известного результата. */
const ppg = (s: SeasonSummary) => (s.league_played > 0 ? s.league_points / s.league_played : null);

const placeText = (s: SeasonSummary) =>
  s.final_place ? `${s.final_place} место${s.teams_count ? ` из ${s.teams_count}` : ''}` : null;

/** Подпись столбика — год начала сезона: «95», «11». У второго сезона того же года (2025 и 2025/26) подписи нет,
    полное название — в подсказке и в ленте ниже. */
const shortLabel = (seasons: SeasonSummary[], i: number) =>
  i > 0 && seasons[i - 1].start_year === seasons[i].start_year ? '' : String(seasons[i].start_year).slice(2);

export function HistoryPage({ scope }: { scope: LeadersScope }) {
  useDocumentTitle('История');
  const state = useLoad(ALL, load);

  return (
    <div className="card-page">
      <h1 className="page-title">История</h1>
      {state.status !== 'ready' ? (
        <LoadStatus state={state} />
      ) : (
        <>
          <Tiles tiles={historyTiles(state.data.seasons)} label="Итоги истории" />
          <Card title="Уровень лиги" aside="1 — высший дивизион">
            <TierChart seasons={state.data.seasons} />
          </Card>
          <Card title="Сезон за сезоном" aside={<WdlLegend />}>
            <SeasonRibbon seasons={state.data.seasons} />
            <p className="note">
              Очки за матч и победы, ничьи, поражения — только чемпионат, по результатам матчей: техническая победа —
              тоже победа. Матчи без известного результата не считаются.
            </p>
          </Card>
          <Card title="Воспитанники: доля минут">
            <AcademyChart seasons={state.data.seasons} />
            <p className="note">
              Доля минут игроков с отметкой «воспитанник» в официальных матчах сезона. Отметка — из таблицы автора и
              проставлена примерно с 2010 года: у тех, кто ушёл раньше, её может не быть.
            </p>
          </Card>
          <Card title="Лучшие воспитанники">
            <div className="academy-list">
              <AcademyLeaders players={state.data.academy} />
              <p className="note">По матчам за «Амкар» во всех турнирах, без товарищеских.</p>
            </div>
          </Card>
          <Streaks seasons={state.data.seasons} scope={scope} />
        </>
      )}
    </div>
  );
}

function historyTiles(seasons: SeasonSummary[]): Tile[] {
  const top = seasons.filter((s) => s.tier === 1);
  const best = [...top].filter((s) => s.final_place).sort((a, b) => (a.final_place ?? 99) - (b.final_place ?? 99))[0];
  const tiles: Tile[] = [{ value: seasons.length, label: plural(seasons.length, ['сезон', 'сезона', 'сезонов']) }];
  if (top.length > 0) {
    tiles.push({ value: top.length, label: `${plural(top.length, ['сезон', 'сезона', 'сезонов'])} в высшем дивизионе` });
  }
  if (best?.final_place) tiles.push({ value: `${best.final_place}-е`, label: `лучшее место в высшем дивизионе · ${best.label}` });
  return tiles;
}

interface Column {
  /** Высота столбика от 0 до 1; null — данных нет. */
  value: number | null;
  title: string;
  /** Подпись над столбиком — только у тех, о ком стоит сказать числом. */
  mark?: string;
}

/**
 * Столбики по сезонам с линиями шкалы каждые 1/5 высоты. Перерыв 2018–2021 — пустым промежутком.
 * Клик по столбику ведёт на карточку сезона.
 */
function SeasonColumns({
  seasons,
  axis,
  column,
}: {
  seasons: SeasonSummary[];
  axis: string[];
  column: (s: SeasonSummary) => Column;
}) {
  return (
    <div className="chart-scroll">
      <div className="sc-chart">
        <div className="sc-axis" aria-hidden="true">
          {axis.map((label, k) => (
            <span key={label} style={{ bottom: `${((k + 1) / axis.length) * 100}%` }}>
              {label}
            </span>
          ))}
        </div>
        <div className="sc-plot">
          {seasons.map((s, i) => {
            const restart = i > 0 && s.start_year >= NEW_CLUB_FROM && seasons[i - 1].start_year < NEW_CLUB_FROM;
            const c = column(s);
            return (
              <Fragment key={s.season_id}>
                {restart && (
                  <div className="sc-break" title="2018–2021: перерыв, с 2021 — новый клуб">
                    <span>перерыв</span>
                  </div>
                )}
                <a className="sc-col" href={seasonHref(s.label)} title={c.title} aria-label={c.title}>
                  <span className="sc-slot">
                    {c.value != null && (
                      <span className="sc-bar" style={{ height: `${Math.min(1, c.value) * 100}%` }}>
                        {c.mark && <span className="sc-mark">{c.mark}</span>}
                      </span>
                    )}
                  </span>
                  <span className="sc-label">{shortLabel(seasons, i)}</span>
                </a>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Уровень лиги по сезонам: чем выше лига, тем выше столбик; шкала — 5 (снизу) … 1 (сверху). */
function TierChart({ seasons }: { seasons: SeasonSummary[] }) {
  return (
    <SeasonColumns
      seasons={seasons}
      axis={['5', '4', '3', '2', '1']}
      column={(s) => ({
        value: s.tier ? (6 - s.tier) / 5 : null,
        title: [s.label, s.division, s.tier && `уровень ${s.tier}`, placeText(s)].filter(Boolean).join(' · '),
      })}
    />
  );
}

/** Доля минут воспитанников: шкала кратна 5 %, подписаны пик и последний сезон. */
function AcademyChart({ seasons }: { seasons: SeasonSummary[] }) {
  const share = (s: SeasonSummary) => (s.minutes > 0 ? s.academy_minutes / s.minutes : null);
  const shares = seasons.map(share).filter((v): v is number => v != null);
  const peak = Math.max(0, ...shares);
  const step = Math.max(5, Math.ceil((peak * 100) / 5 / 5) * 5);
  const scale = (step * 5) / 100;
  const peakSeason = seasons.find((s) => share(s) === peak);
  const last = [...seasons].reverse().find((s) => share(s) != null);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <SeasonColumns
      seasons={seasons}
      axis={[1, 2, 3, 4, 5].map((k) => `${k * step}%`)}
      column={(s) => {
        const v = share(s);
        if (v == null) return { value: null, title: `${s.label}: минут нет` };
        return {
          value: v / scale,
          title: `${s.label}: ${pct(v)} минут — ${formatInt(s.academy_minutes)} из ${formatInt(s.minutes)}`,
          mark: s === peakSeason || s === last ? pct(v) : undefined,
        };
      }}
    />
  );
}

/** Воспитанники с наибольшим числом матчей; одинаковые значения делят место. */
function AcademyLeaders({ players }: { players: CareerStats[] }) {
  if (players.length === 0) return <p className="muted">Воспитанники не отмечены.</p>;
  return (
    <div className="table-wrap">
      <table className="data-table leaders-table">
        <thead>
          <tr>
            <th scope="col" className="num">
              Место
            </th>
            <th scope="col">Игрок</th>
            <th scope="col" className="num">
              Игры
            </th>
            <th scope="col">В клубе</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.player_id}>
              <td className="num rank">{players.findIndex((x) => x.games === p.games) + 1}</td>
              <td>
                <a href={playerHref(p.player_id)}>{p.display_name}</a>
              </td>
              <td className="num value">{p.games}</td>
              <td className="muted">{p.first_year === p.last_year ? p.first_year : `${p.first_year}–${p.last_year}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WdlLegend() {
  return (
    <span className="wdl-legend">
      <span>
        <i className="wdl-W" />
        победы
      </span>
      <span>
        <i className="wdl-D" />
        ничьи
      </span>
      <span>
        <i className="wdl-L" />
        поражения
      </span>
    </span>
  );
}

/** Сезоны строками по эпохам; между эпохами 2004–2018 и «с 2021» — перерыв. */
function SeasonRibbon({ seasons }: { seasons: SeasonSummary[] }) {
  return (
    <div className="ribbon">
      <div className="ribbon-row ribbon-head" aria-hidden="true">
        <span>Сезон</span>
        <span>Лига</span>
        <span>Очки за матч</span>
        <span>Чемпионат: В–Н–П</span>
      </div>
      {SEASON_EPOCHS.map((epoch, i) => {
        const from = i === 0 ? -Infinity : SEASON_EPOCHS[i - 1].until;
        const list = seasons.filter((s) => s.start_year > from && s.start_year <= epoch.until);
        if (list.length === 0) return null;
        return (
          <section key={epoch.title} className="ribbon-epoch">
            {list[0].start_year >= NEW_CLUB_FROM && (
              <p className="ribbon-break">2018–2021 — перерыв. С 2021 года — новый клуб, история идёт заново.</p>
            )}
            <h3 className="ribbon-epoch-title">{epoch.title}</h3>
            <ul className="ribbon-list">
              {list.map((s) => (
                <RibbonRow key={s.season_id} s={s} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function RibbonRow({ s }: { s: SeasonSummary }) {
  const points = ppg(s);
  const facts = [s.tier && `уровень ${s.tier}`, placeText(s)].filter(Boolean).join(' · ');
  return (
    <li className="ribbon-row">
      <a className="ribbon-season" href={seasonHref(s.label)}>
        {s.label}
      </a>
      <div className="ribbon-league">
        <div>{s.division ?? <span className="muted">лига не указана</span>}</div>
        {facts && <div className="muted">{facts}</div>}
      </div>
      <div className="ribbon-ppg">
        {points == null ? (
          <span className="muted">результаты не внесены</span>
        ) : (
          <>
            <span className="meter" aria-hidden="true">
              <span className="meter-fill" style={{ width: `${(points / 3) * 100}%` }} />
            </span>
            <span className="ribbon-num">{formatRatio(points)}</span>
          </>
        )}
      </div>
      <div className="ribbon-wdl">
        {s.league_played === 0 ? (
          <span className="muted">—</span>
        ) : (
          <>
            <span className="wdl-bar" aria-hidden="true">
              {(
                [
                  ['W', s.league_wins],
                  ['D', s.league_draws],
                  ['L', s.league_losses],
                ] as const
              ).map(([r, n]) => n > 0 && <span key={r} className={`wdl-${r}`} style={{ flexGrow: n }} />)}
            </span>
            <span className="ribbon-num">
              {s.league_wins}–{s.league_draws}–{s.league_losses}
              {s.league_unknown > 0 && <span className="muted"> · без результата {s.league_unknown}</span>}
            </span>
          </>
        )}
      </div>
    </li>
  );
}
