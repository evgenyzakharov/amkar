import { useSyncExternalStore } from 'react';
import { leaveAllowed } from './leaveGuard';
import { forgetPageState } from './pageState';
import { isLinkNavigation, rememberScroll } from './scrollMemory';

// Маршруты на hash: сайт лежит на GitHub Pages в подпапке, а серверной маршрутизации там нет

export type Route =
  | { page: 'seasons' }
  | { page: 'season'; label: string; scope: LeadersScope }
  | { page: 'players' }
  | { page: 'leaders'; scope: LeadersScope; tab: LeadersTab }
  | { page: 'history'; scope: LeadersScope }
  | { page: 'coaches'; scope: LeadersScope }
  | { page: 'coach'; id: number }
  | { page: 'opponents'; scope: LeadersScope }
  | { page: 'opponent'; id: number }
  | { page: 'academy' }
  | { page: 'pyramid' }
  | { page: 'match'; id: number }
  | { page: 'player'; id: number; scope: LeadersScope }
  | { page: 'admin'; admin: AdminRoute }
  | { page: 'not-found' };

/** Разделы админки: #/admin/… */
export type AdminRoute =
  | { page: 'home' }
  | { page: 'season'; label: string; tab: SeasonTab }
  | { page: 'match'; id: number }
  | { page: 'new-match'; label: string }
  | { page: 'teams' }
  | { page: 'coaches' }
  | { page: 'players' }
  | { page: 'player'; id: number }
  | { page: 'points' }
  | { page: 'checks' };

/** Вкладки сезона в админке: матчи, сетка «игроки × матчи», заявка, трансферы, сборная, сведения о сезоне. */
export type SeasonTab = 'matches' | 'grid' | 'squad' | 'transfers' | 'best' | 'info';

// «2011/12» в адресе — «2011-12»: косая черта разделяет части маршрута
const labelPart = (label: string) => label.replace('/', '-');
const labelFromPart = (part: string) => part.replace('-', '/');

/** Сезон и игрок: «только чемпионат» — в адресе (?scope=league), как у лидеров. */
export const seasonHref = (label: string, scope: LeadersScope = 'all') =>
  `#/season/${labelPart(label)}${scope === 'league' ? '?scope=league' : ''}`;
export const matchHref = (id: number) => `#/match/${id}`;
export const playerHref = (id: number, scope: LeadersScope = 'all') => `#/player/${id}${scope === 'league' ? '?scope=league' : ''}`;
export const playersHref = '#/players';

/** Лидеры: все турниры или только чемпионат — в адресе, чтобы ссылкой можно было поделиться. */
export type LeadersScope = 'all' | 'league';
/** Вкладки «Лидеров»: таблицы по играм и голам — или клубы 100, 200, 300 матчей и рубежи голов. */
export type LeadersTab = 'tables' | 'clubs';
export const leadersHref = (scope: LeadersScope = 'all', tab: LeadersTab = 'tables') =>
  tab === 'clubs' ? '#/leaders?tab=clubs' : `#/leaders${scope === 'league' ? '?scope=league' : ''}`;
const scopeOf = (query: string): LeadersScope => (new URLSearchParams(query).get('scope') === 'league' ? 'league' : 'all');

/** История: фильтр серий по турнирам — в адресе, как у лидеров. */
export const historyHref = (scope: LeadersScope = 'all') => `#/history${scope === 'league' ? '?scope=league' : ''}`;

/** Тренеры: таблица — все игры или только чемпионат, как у лидеров. */
export const coachesHref = (scope: LeadersScope = 'all') => `#/coaches${scope === 'league' ? '?scope=league' : ''}`;
export const coachHref = (id: number) => `#/coach/${id}`;

/** Соперники: личные встречи, как у тренеров — все игры или только чемпионат. */
export const opponentsHref = (scope: LeadersScope = 'all') => `#/opponents${scope === 'league' ? '?scope=league' : ''}`;
export const opponentHref = (id: number) => `#/opponent/${id}`;
export const academyHref = '#/academy';
export const pyramidHref = '#/pyramid';

export const adminHref = '#/admin';
export const adminSeasonHref = (label: string, tab: SeasonTab = 'matches') =>
  `#/admin/season/${labelPart(label)}${tab === 'matches' ? '' : `/${tab}`}`;
export const adminMatchHref = (id: number) => `#/admin/match/${id}`;
export const adminNewMatchHref = (label: string) => `${adminSeasonHref(label)}/new`;
export const adminTeamsHref = '#/admin/teams';
export const adminCoachesHref = '#/admin/coaches';
export const adminPlayersHref = '#/admin/players';
export const adminPlayerHref = (id: number) => `#/admin/player/${id}`;
export const adminPointsHref = '#/admin/points';
export const adminChecksHref = '#/admin/checks';

const isId = (s: string) => /^\d+$/.test(s);

function parseAdminRoute(parts: string[]): Route {
  const [page, param, extra] = parts;
  const admin = (r: AdminRoute): Route => ({ page: 'admin', admin: r });
  if (parts.length === 0) return admin({ page: 'home' });
  if (parts.length === 1 && (page === 'teams' || page === 'coaches' || page === 'players' || page === 'points' || page === 'checks')) return admin({ page });
  if (page === 'player' && parts.length === 2 && isId(param)) return admin({ page: 'player', id: Number(param) });
  if (page === 'season' && parts.length === 2) return admin({ page: 'season', label: labelFromPart(param), tab: 'matches' });
  if (page === 'season' && parts.length === 3 && extra === 'new') {
    return admin({ page: 'new-match', label: labelFromPart(param) });
  }
  if (page === 'season' && parts.length === 3 && (extra === 'grid' || extra === 'squad' || extra === 'transfers' || extra === 'best' || extra === 'info')) {
    return admin({ page: 'season', label: labelFromPart(param), tab: extra });
  }
  if (page === 'match' && parts.length === 2 && isId(param)) return admin({ page: 'match', id: Number(param) });
  return { page: 'not-found' };
}

export function parseRoute(hash: string): Route {
  // Параметры после «?» — у страниц, где состояние хранится в адресе (#/leaders?scope=league)
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  let parts: string[];
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { page: 'not-found' };
  }
  if (parts.length === 0) return { page: 'seasons' };
  if (parts[0] === 'admin') return parseAdminRoute(parts.slice(1));
  if (parts.length === 1 && parts[0] === 'players') return { page: 'players' };
  if (parts.length === 1 && parts[0] === 'history') return { page: 'history', scope: scopeOf(query) };
  if (parts.length === 1 && parts[0] === 'coaches') return { page: 'coaches', scope: scopeOf(query) };
  if (parts.length === 1 && parts[0] === 'opponents') return { page: 'opponents', scope: scopeOf(query) };
  if (parts.length === 1 && parts[0] === 'academy') return { page: 'academy' };
  if (parts.length === 1 && parts[0] === 'pyramid') return { page: 'pyramid' };
  if (parts.length === 1 && parts[0] === 'leaders') {
    return { page: 'leaders', scope: scopeOf(query), tab: new URLSearchParams(query).get('tab') === 'clubs' ? 'clubs' : 'tables' };
  }
  if (parts.length !== 2) return { page: 'not-found' };

  const [page, param] = parts;
  if (page === 'season') return { page: 'season', label: labelFromPart(param), scope: scopeOf(query) };
  if (!isId(param)) return { page: 'not-found' };
  if (page === 'match') return { page: 'match', id: Number(param) };
  if (page === 'player') return { page: 'player', id: Number(param), scope: scopeOf(query) };
  if (page === 'coach') return { page: 'coach', id: Number(param) };
  if (page === 'opponent') return { page: 'opponent', id: Number(param) };
  return { page: 'not-found' };
}

// Показанный адрес. С несохранёнными правками админки уходим только с согласия (leaveGuard.ts):
// при отказе в адресной строке возвращается прежний адрес, страница не меняется
let shown: string | null = null;
const listeners = new Set<() => void>();

function onHashChange() {
  const next = window.location.hash;
  if (next === shown) return;
  if (!leaveAllowed()) {
    window.history.pushState(null, '', window.location.pathname + window.location.search + (shown ?? ''));
    return;
  }
  if (shown != null) rememberScroll(shown);
  // по ссылке страница открывается заново: поиск и сортировка — начальные; «Назад» их вернёт (pageState.ts)
  if (isLinkNavigation()) forgetPageState(next);
  shown = next;
  listeners.forEach((l) => l());
}

/** Подписка на смену адреса — для useHash. */
export function subscribeHash(onChange: () => void) {
  if (listeners.size === 0) {
    shown = window.location.hash;
    window.addEventListener('hashchange', onHashChange);
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener('hashchange', onHashChange);
  };
}

/** Показанный адрес страницы. */
export const shownHash = () => shown ?? window.location.hash;

/** Текущий hash; компонент перерисовывается при переходе по ссылке и кнопками «Назад» и «Вперёд». */
export function useHash() {
  return useSyncExternalStore(subscribeHash, shownHash);
}
