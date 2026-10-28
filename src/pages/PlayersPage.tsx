import { LoadStatus } from '../components/common';
import { loadPlayers, type PlayersPageItem } from '../db/queries';
import { clubYears, plural } from '../format';
import { useDocumentTitle, useLoad } from '../load';
import { playerHref } from '../router';
import { usePageState } from '../pageState';

// Ключ один: список не зависит от адреса
const ALL = 'all';
const load = () => loadPlayers();

// Поиск без различия регистра и «ё»/«е»
const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function PlayersPage() {
  useDocumentTitle('Игроки');
  const state = useLoad(ALL, load);
  const [query, setQuery] = usePageState('query', '');
  if (state.status !== 'ready') return <LoadStatus state={state} />;

  const q = normalize(query.trim());
  const shown = q ? state.data.filter((p) => normalize(p.display_name).includes(q)) : state.data;
  const groups = new Map<string, PlayersPageItem[]>();
  for (const p of shown) {
    const letter = p.last_name.charAt(0).toUpperCase().replace('Ё', 'Е');
    groups.set(letter, [...(groups.get(letter) ?? []), p]);
  }

  return (
    <div className="card-page">
      <section className="card">
        <div className="card-head">
          <h1 className="card-title">Игроки</h1>
          <span className="card-aside">
            {state.data.length} {plural(state.data.length, ['игрок', 'игрока', 'игроков'])} в базе
          </span>
        </div>
        <input
          type="search"
          className="player-search"
          placeholder="Поиск по фамилии"
          aria-label="Поиск по фамилии"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {shown.length === 0 && <p className="muted">Никого не нашлось.</p>}
        {[...groups].map(([letter, list]) => (
          <section className="letter-group" key={letter}>
            <h2 className="letter">{letter}</h2>
            <ul className="player-list">
              {list.map((p) => (
                <li key={p.id}>
                  <a href={playerHref(p.id)}>{p.display_name}</a>
                  <span className="muted">
                    {p.firstYear == null
                      ? 'только трансфер'
                      : `${clubYears(p.firstYear, p.lastYear ?? p.firstYear, p.current)} · ${p.games} ${plural(p.games, ['матч', 'матча', 'матчей'])}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
    </div>
  );
}
