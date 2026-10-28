import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { signOut, useAuth } from './auth';
import { currentTheme, followSystem, logoSrc, setTheme, type Theme } from './theme';
import { AuthProvider } from './components/AuthProvider';
import { NotFound } from './components/common';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { confirmLeave } from './leaveGuard';
import { restoreScroll } from './scrollMemory';
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
      return <SeasonPage label={route.label} scope={route.scope} />;
    case 'match':
      return <MatchPage id={route.id} />;
    case 'player':
      return <PlayerPage id={route.id} scope={route.scope} />;
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

/** Логотип клуба слева от названия: старый или новый, как выбрал index.html. Не загрузился — просто текст. */
function ClubLogo() {
  const [src] = useState(logoSrc);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img className="site-logo-img" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** Переключатель темы: солнце — включить светлую, луна — тёмную. */
function ThemeToggle() {
  const [theme, setState] = useState<Theme>(currentTheme);
  useEffect(() => followSystem(setState), []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Тёмная тема' : 'Светлая тема';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(next);
        setState(next);
      }}
    >
      {next === 'dark' ? '☾' : '☀'}
    </button>
  );
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
      <button
        type="button"
        className="link-button"
        onClick={() => {
          // после выхода админка закрывается — несохранённое пропало бы
          if (confirmLeave()) void signOut();
        }}
      >
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

  // Переход по ссылке — новая страница: начинаем её сверху; «Назад» и «Вперёд» — туда, где её оставили (scrollMemory.ts)
  // Переключатели в адресе (?scope=…) страницу не меняют — прокрутку не трогаем
  const path = hash.split('?')[0];
  useEffect(() => restoreScroll(path), [path]);

  // Телефон: меню листается вбок — раздел страницы должен быть виден
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    const link = el?.querySelector<HTMLElement>('a.active');
    if (!el || !link) return;
    const [box, item] = [el.getBoundingClientRect(), link.getBoundingClientRect()];
    if (item.left < box.left || item.right > box.right - 40) el.scrollLeft += item.left - box.left - 16;
  }, [section]);

  return (
    <AuthProvider>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-logo" href="#/" title="Амкар — история в цифрах">
            <ClubLogo />
            Амкар
          </a>
          <nav className="site-nav" aria-label="Разделы сайта" ref={nav}>
            <a href="#/" className={section === 'seasons' ? 'active' : undefined} aria-current={section === 'seasons' ? 'page' : undefined}>
              Сезоны
            </a>
            <a href={historyHref()} className={section === 'history' ? 'active' : undefined} aria-current={section === 'history' ? 'page' : undefined}>
              История
            </a>
            <a href={coachesHref()} className={section === 'coaches' ? 'active' : undefined} aria-current={section === 'coaches' ? 'page' : undefined}>
              Тренеры
            </a>
            <a href={opponentsHref()} className={section === 'opponents' ? 'active' : undefined} aria-current={section === 'opponents' ? 'page' : undefined}>
              Соперники
            </a>
            <a href={playersHref} className={section === 'players' ? 'active' : undefined} aria-current={section === 'players' ? 'page' : undefined}>
              Игроки
            </a>
            <a href={leadersHref()} className={section === 'leaders' ? 'active' : undefined} aria-current={section === 'leaders' ? 'page' : undefined}>
              Лидеры
            </a>
            <a href={pyramidHref} className={section === 'pyramid' ? 'active' : undefined} aria-current={section === 'pyramid' ? 'page' : undefined}>
              Пирамида
            </a>
          </nav>
          <ThemeToggle />
          <AdminLinks />
        </div>
      </header>

      <main className="site-main">
        <PageErrorBoundary resetKey={path}>
          <Page route={route} />
        </PageErrorBoundary>
      </main>
    </AuthProvider>
  );
}

export default App;
