import { LoadStatus } from '../components/common';
import { loadSeasons } from '../db/queries';
import { useDocumentTitle, useLoad } from '../load';
import { seasonHref } from '../router';

// Ключ один: список сезонов не зависит от адреса
const ALL = 'all';
const load = () => loadSeasons();

export function SeasonsPage() {
  useDocumentTitle(null);
  const state = useLoad(ALL, load);

  return (
    <>
      <h2>Сезоны</h2>
      {state.status !== 'ready' && <LoadStatus state={state} />}
      {state.status === 'ready' && state.data.length === 0 && <p className="muted">Данных пока нет.</p>}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="season-list">
          {state.data.map((s) => (
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
      )}
    </>
  );
}
