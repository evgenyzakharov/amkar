import { useEffect } from 'react';
import { AdminPage } from './admin/AdminPage';
import { signOut, useAuth } from './auth';
import { AuthProvider } from './components/AuthProvider';
import { NotFound } from './components/common';
import { MatchPage } from './pages/MatchPage';
import { PlayerPage } from './pages/PlayerPage';
import { SeasonPage } from './pages/SeasonPage';
import { SeasonsPage } from './pages/SeasonsPage';
import { adminHref, parseRoute, useHash, type Route } from './router';

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
    case 'admin':
      return <AdminPage route={route.admin} />;
    case 'not-found':
      return <NotFound message="Такой страницы нет." />;
  }
}

/** Ссылки админа в шапке. Посетителям без входа ничего не показываем: в админку заходят по адресу #/admin. */
function AdminLinks() {
  const auth = useAuth();
  if (auth.status !== 'signed-in') return null;
  return (
    <nav className="admin-links">
      <a href={adminHref}>Админка</a>
      <span className="muted" title="вы вошли как">
        {auth.email}
      </span>
      <button type="button" className="link-button" onClick={() => void signOut()}>
        Выйти
      </button>
    </nav>
  );
}

function App() {
  const hash = useHash();

  // Переход по ссылке — новая страница: начинаем её сверху
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  return (
    <AuthProvider>
      <div className="app">
        <header className="app-header">
          <div>
            <h1>
              <a href="#/">Амкар</a>
            </h1>
            <p>История клуба в цифрах</p>
          </div>
          <AdminLinks />
        </header>

        <main>
          <Page route={parseRoute(hash)} />
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
