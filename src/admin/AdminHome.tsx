import { LoadStatus } from '../components/common';
import { loadSeasons } from '../db/queries';
import { useDocumentTitle, useLoad } from '../load';
import { adminSeasonHref } from '../router';

const loadAll = () => loadSeasons();

export function AdminHome() {
  const state = useLoad(null, loadAll);
  useDocumentTitle('Админка');
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  // Свежие сезоны сверху: вводить чаще всего придётся текущий
  const seasons = [...state.data].reverse();
  return (
    <>
      <h2>Админка</h2>
      <section>
        <h3>Сезоны</h3>
        <ul className="season-list">
          {seasons.map((s) => (
            <li key={s.id}>
              <a className="season-label" href={adminSeasonHref(s.label)}>
                {s.label}
              </a>
              {s.division && <span className="muted"> · {s.division}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
