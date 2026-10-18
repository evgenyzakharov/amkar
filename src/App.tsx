import { useEffect } from 'react';
import { NotFound } from './components/common';
import { MatchPage } from './pages/MatchPage';
import { PlayerPage } from './pages/PlayerPage';
import { SeasonPage } from './pages/SeasonPage';
import { SeasonsPage } from './pages/SeasonsPage';
import { parseRoute, useHash, type Route } from './router';

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'seasons':
      return <SeasonsPage />;
    case 'season':
      return <SeasonPage label={route.label} />;
    case 'match':
      return <MatchPage id={route.id} />;
    case 'player':
      return <PlayerPage id={route.id} />;
    case 'not-found':
      return <NotFound message="Такой страницы нет." />;
  }
}

function App() {
  const hash = useHash();

  // Переход по ссылке — новая страница: начинаем её сверху
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <a href="#/">Амкар</a>
        </h1>
        <p>История клуба в цифрах</p>
      </header>

      <main>
        <Page route={parseRoute(hash)} />
      </main>
    </div>
  );
}

export default App;
