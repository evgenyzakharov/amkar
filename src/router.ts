import { useSyncExternalStore } from 'react';

// Маршруты на hash: сайт лежит на GitHub Pages в подпапке, а серверной маршрутизации там нет

export type Route =
  | { page: 'seasons' }
  | { page: 'season'; label: string }
  | { page: 'players' }
  | { page: 'leaders'; scope: LeadersScope }
  | { page: 'history' }
  | { page: 'match'; id: number }
  | { page: 'player'; id: number }
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
  | { page: 'player'; id: number };

/** Вкладки сезона в админке: матчи, сетка «игроки × матчи», заявка, трансферы, сборная, сведения о сезоне. */
export type SeasonTab = 'matches' | 'grid' | 'squad' | 'transfers' | 'best' | 'info';

// «2011/12» в адресе — «2011-12»: косая черта разделяет части маршрута
const labelPart = (label: string) => label.replace('/', '-');
const labelFromPart = (part: string) => part.replace('-', '/');

export const seasonHref = (label: string) => `#/season/${labelPart(label)}`;
export const matchHref = (id: number) => `#/match/${id}`;
export const playerHref = (id: number) => `#/player/${id}`;
export const playersHref = '#/players';

/** Лидеры: все турниры или только чемпионат — в адресе, чтобы ссылкой можно было поделиться. */
export type LeadersScope = 'all' | 'league';
export const leadersHref = (scope: LeadersScope = 'all') => `#/leaders${scope === 'league' ? '?scope=league' : ''}`;
export const historyHref = '#/history';

export const adminHref = '#/admin';
export const adminSeasonHref = (label: string, tab: SeasonTab = 'matches') =>
  `#/admin/season/${labelPart(label)}${tab === 'matches' ? '' : `/${tab}`}`;
export const adminMatchHref = (id: number) => `#/admin/match/${id}`;
export const adminNewMatchHref = (label: string) => `${adminSeasonHref(label)}/new`;
export const adminTeamsHref = '#/admin/teams';
export const adminCoachesHref = '#/admin/coaches';
export const adminPlayersHref = '#/admin/players';
export const adminPlayerHref = (id: number) => `#/admin/player/${id}`;

const isId = (s: string) => /^\d+$/.test(s);

function parseAdminRoute(parts: string[]): Route {
  const [page, param, extra] = parts;
  const admin = (r: AdminRoute): Route => ({ page: 'admin', admin: r });
  if (parts.length === 0) return admin({ page: 'home' });
  if (parts.length === 1 && (page === 'teams' || page === 'coaches' || page === 'players')) return admin({ page });
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
  if (parts.length === 1 && parts[0] === 'history') return { page: 'history' };
  if (parts.length === 1 && parts[0] === 'leaders') {
    return { page: 'leaders', scope: new URLSearchParams(query).get('scope') === 'league' ? 'league' : 'all' };
  }
  if (parts.length !== 2) return { page: 'not-found' };

  const [page, param] = parts;
  if (page === 'season') return { page: 'season', label: labelFromPart(param) };
  if (!isId(param)) return { page: 'not-found' };
  if (page === 'match') return { page: 'match', id: Number(param) };
  if (page === 'player') return { page: 'player', id: Number(param) };
  return { page: 'not-found' };
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Текущий hash; компонент перерисовывается при переходе по ссылке. */
export function useHash() {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
