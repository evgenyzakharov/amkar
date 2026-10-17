import { useEffect, useState } from 'react';
import { supabase } from './db/supabase';
import type { Season } from './db/types';

type SeasonsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; seasons: Season[] };

function App() {
  const [state, setState] = useState<SeasonsState>(() =>
    supabase ? { status: 'loading' } : { status: 'error', message: 'Supabase не настроен: заполните .env' },
  );

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('season')
      .select('id, label, start_year, end_year, division, tier, final_place, teams_count')
      .order('start_year')
      .order('end_year')
      .then(({ data, error }) => {
        setState(error ? { status: 'error', message: error.message } : { status: 'ready', seasons: data ?? [] });
      });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Амкар</h1>
        <p>История клуба в цифрах</p>
      </header>

      <main>
        <h2>Сезоны</h2>
        {state.status === 'loading' && <p className="muted">Загрузка…</p>}
        {state.status === 'error' && <p className="error">{state.message}</p>}
        {state.status === 'ready' && state.seasons.length === 0 && <p className="muted">Данных пока нет.</p>}
        {state.status === 'ready' && state.seasons.length > 0 && (
          <ul className="season-list">
            {state.seasons.map((s) => (
              <li key={s.id}>
                <span className="season-label">{s.label}</span>
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
      </main>
    </div>
  );
}

export default App;
