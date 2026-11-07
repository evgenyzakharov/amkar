// Трансферы по сезонам — на странице «Трансферы» и карточкой на «Истории»
import { NEW_CLUB_FROM } from '../format';
import { seasonHref } from '../router';
import type { SeasonMoves } from '../transfers';

export function TransferLegend() {
  return (
    <span className="tr-legend">
      <span>
        <i className="tr-in" /> пришли
      </span>
      <span>
        <i className="tr-out" /> ушли
      </span>
    </span>
  );
}

/** Столбики по сезонам: приходы вверх от черты, уходы вниз; на месте перерыва 2018–2021 — многоточие. Столбик — ссылка на сезон. */
export function TransferSeasons({ seasons }: { seasons: SeasonMoves[] }) {
  const max = Math.max(1, ...seasons.map((s) => Math.max(s.in, s.out)));
  // 80% высоты — над столбиком остаётся место под число
  const h = (n: number) => `${(80 * n) / max}%`;
  const short = (s: SeasonMoves['season']) =>
    s.start_year === s.end_year ? `’${String(s.start_year).slice(2)}` : `${String(s.start_year).slice(2)}/${String(s.end_year).slice(2)}`;
  return (
    <div className="tr-seasons">
      {seasons.map((s, i) => {
        const gap = i > 0 && seasons[i - 1].season.start_year < NEW_CLUB_FROM && s.season.start_year >= NEW_CLUB_FROM;
        const title = `${s.season.label}: пришли ${s.in}, ушли ${s.out}`;
        return (
          <span key={s.season.id} className="tr-season-wrap">
            {gap && (
              <span className="tr-gap" title="2018–2021: клуба не было">
                …
              </span>
            )}
            <a className="tr-season" href={seasonHref(s.season.label)} title={title} aria-label={title}>
              <span className="tr-up">
                <span className="tr-v">{s.in || ''}</span>
                <span className="tr-in" style={{ height: h(s.in) }} />
              </span>
              <span className="tr-down">
                <span className="tr-out" style={{ height: h(s.out) }} />
                <span className="tr-v">{s.out || ''}</span>
              </span>
              <span className="tr-label">{short(s.season)}</span>
            </a>
          </span>
        );
      })}
    </div>
  );
}
