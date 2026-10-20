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
import { adminHref, coachesHref, historyHref, leadersHref, opponentsHref, parseRoute, playersHref, pyramidHref, useHash, type Route } from './router';

// Админка — отдельным файлом: посетителям сайта её код не нужен
const AdminPage = lazy(() => import('./admin/AdminPage').then((m) => ({ default: m.AdminPage })));
// История с графиками — тоже отдельным файлом: главной странице она не нужна
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
// Тренеры — тоже: статистика считается на сайте из всех матчей
const CoachesPage = lazy(() => import('./pages/CoachesPage').then((m) => ({ default: m.CoachesPage })));
const CoachPage = lazy(() => import('./pages/CoachesPage').then((m) => ({ default: m.CoachPage })));
// Соперники и выпускники — тоже по запросу
const OpponentsPage = lazy(() => import('./pages/OpponentsPage').then((m) => ({ default: m.OpponentsPage })));
const OpponentPage = lazy(() => import('./pages/OpponentsPage').then((m) => ({ default: m.OpponentPage })));
const AcademyPage = lazy(() => import('./pages/AcademyPage').then((m) => ({ default: m.AcademyPage })));
const PyramidPage = lazy(() => import('./pages/PyramidPage').then((m) => ({ default: m.PyramidPage })));

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
    case 'history':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <HistoryPage scope={route.scope} />
        </Suspense>
      );
    case 'leaders':
      return <LeadersPage scope={route.scope} tab={route.tab} />;
    case 'coaches':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <CoachesPage scope={route.scope} />
        </Suspense>
      );
    case 'coach':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <CoachPage id={route.id} />
        </Suspense>
      );
    case 'opponents':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <OpponentsPage scope={route.scope} />
        </Suspense>
      );
    case 'opponent':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <OpponentPage id={route.id} />
        </Suspense>
      );
    case 'academy':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <AcademyPage />
        </Suspense>
      );
    case 'pyramid':
      return (
        <Suspense fallback={<p className="muted">Загрузка…</p>}>
          <PyramidPage />
        </Suspense>
      );
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
function sectionOf(route: Route): 'seasons' | 'history' | 'coaches' | 'opponents' | 'players' | 'leaders' | 'pyramid' | null {
  if (route.page === 'leaders') return 'leaders';
  if (route.page === 'pyramid') return 'pyramid';
  if (route.page === 'opponents' || route.page === 'opponent') return 'opponents';
  if (route.page === 'academy') return 'history';
  if (route.page === 'coaches' || route.page === 'coach') return 'coaches';
  if (route.page === 'history') return 'history';
  if (route.page === 'seasons' || route.page === 'season' || route.page === 'match') return 'seasons';
  if (route.page === 'players' || route.page === 'player') return 'players';
  return null;
}

function App() {
  const hash = useHash();
  const route = parseRoute(hash);
  const section = sectionOf(route);

  // Переход по ссылке — новая страница: начинаем её сверху
  // Переключатели в адресе (?scope=…) страницу не меняют — прокрутку не трогаем
  const path = hash.split('?')[0];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

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
            <a href={historyHref()} className={section === 'history' ? 'active' : undefined}>
              История
            </a>
            <a href={coachesHref()} className={section === 'coaches' ? 'active' : undefined}>
              Тренеры
            </a>
            <a href={opponentsHref()} className={section === 'opponents' ? 'active' : undefined}>
              Соперники
            </a>
            <a href={playersHref} className={section === 'players' ? 'active' : undefined}>
              Игроки
            </a>
            <a href={leadersHref()} className={section === 'leaders' ? 'active' : undefined}>
              Лидеры
            </a>
            <a href={pyramidHref} className={section === 'pyramid' ? 'active' : undefined}>
              Пирамида
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
