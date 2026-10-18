import { lazy, Suspense, useEffect } from 'react';
import { signOut, useAuth } from './auth';
import { AuthProvider } from './components/AuthProvider';
import { NotFound } from './components/common';
import { MatchPage } from './pages/MatchPage';
import { PlayerPage } from './pages/PlayerPage';
import { LeadersPage } from './pages/LeadersPage';
import { PlayersPage } from './pages/PlayersPage';
import { SeasonPage } from './pages/SeasonPage';
import { SeasonsPage } from './pages/SeasonsPage';
import { adminHref, leadersHref, parseRoute, playersHref, useHash, type Route } from './router';

// Админка — отдельным файлом: посетителям сайта её код не нужен
const AdminPage = lazy(() => import('./admin/AdminPage').then((m) => ({ default: m.AdminPage })));

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
    case 'players':
      return <PlayersPage />;
    case 'leaders':
      return <LeadersPage scope={route.scope} />;
    case 'admin':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <AdminPage route={route.admin} />
        </Suspense>
      );
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

/** Раздел шапки, к которому относится страница: матчи — часть сезонов. */
function sectionOf(route: Route): 'seasons' | 'players' | 'leaders' | null {
  if (route.page === 'leaders') return 'leaders';
  if (route.page === 'seasons' || route.page === 'season' || route.page === 'match') return 'seasons';
  if (route.page === 'players' || route.page === 'player') return 'players';
  return null;
}

function App() {
  const hash = useHash();
  const route = parseRoute(hash);
  const section = sectionOf(route);

  // Переход по ссылке — новая страница: начинаем её сверху
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  return (
    <AuthProvider>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-logo" href="#/" title="Амкар — история в цифрах">
            Амкар
          </a>
          <nav className="site-nav" aria-label="Разделы сайта">
            <a href="#/" className={section === 'seasons' ? 'active' : undefined}>
              Сезоны
            </a>
            <a href={playersHref} className={section === 'players' ? 'active' : undefined}>
              Игроки
            </a>
            <a href={leadersHref()} className={section === 'leaders' ? 'active' : undefined}>
              Лидеры
            </a>
          </nav>
          <AdminLinks />
        </div>
      </header>

      <main className="site-main">
        <Page route={route} />
      </main>
    </AuthProvider>
  );
}

export default App;
