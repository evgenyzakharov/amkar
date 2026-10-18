import { Card } from '../components/cards';
import { LoadStatus } from '../components/common';
import { loadSeasons } from '../db/queries';
import type { Season } from '../db/types';
import { useDocumentTitle, useLoad } from '../load';
import { seasonHref } from '../router';

// Ключ один: список сезонов не зависит от адреса
const ALL = 'all';
const load = () => loadSeasons();

/** Эпохи клуба — колонки списка. Сезон попадает в эпоху по году начала. */
const EPOCHS: { title: string; until: number }[] = [
  { title: '1995–2003', until: 2003 },
  { title: '2004–2018', until: 2018 },
  { title: 'с 2021', until: Infinity },
];

export function SeasonsPage() {
  useDocumentTitle(null);
  const state = useLoad(ALL, load);

  return (
    <div className="card-page">
      <h1 className="page-title">Сезоны</h1>
      {state.status !== 'ready' && <LoadStatus state={state} />}
      {state.status === 'ready' && state.data.length === 0 && <p className="muted">Данных пока нет.</p>}
      {state.status === 'ready' && state.data.length > 0 && (
        <div className="epochs">
          {EPOCHS.map((epoch, i) => {
            const from = i === 0 ? -Infinity : EPOCHS[i - 1].until;
            const seasons = state.data.filter((s) => s.start_year > from && s.start_year <= epoch.until);
            return (
              seasons.length > 0 && (
                <Card key={epoch.title} title={epoch.title}>
                  <SeasonList seasons={seasons} />
                </Card>
              )
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeasonList({ seasons }: { seasons: Season[] }) {
  return (
    <ul className="season-list">
      {seasons.map((s) => (
        <li key={s.id}>
          <a className="season-label" href={seasonHref(s.label)}>
            {s.label}
          </a>
          {s.division && <span className="muted"> · {s.division}</span>}
          {s.final_place && (
            <span className="muted">
              {' '}
              · {s.final_place} место{s.teams_count ? ` из ${s.teams_count}` : ''}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
