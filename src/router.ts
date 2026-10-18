import { useSyncExternalStore } from 'react';

// Маршруты на hash: сайт лежит на GitHub Pages в подпапке, а серверной маршрутизации там нет

export type Route =
  | { page: 'seasons' }
  | { page: 'season'; label: string }
  | { page: 'match'; id: number }
  | { page: 'player'; id: number }
  | { page: 'not-found' };

// «2011/12» в адресе — «2011-12»: косая черта разделяет части маршрута
export const seasonHref = (label: string) => `#/season/${label.replace('/', '-')}`;
export const matchHref = (id: number) => `#/match/${id}`;
export const playerHref = (id: number) => `#/player/${id}`;

export function parseRoute(hash: string): Route {
  let parts: string[];
  try {
    parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { page: 'not-found' };
  }
  if (parts.length === 0) return { page: 'seasons' };
  if (parts.length !== 2) return { page: 'not-found' };

  const [page, param] = parts;
  if (page === 'season') return { page: 'season', label: param.replace('-', '/') };
  if (!/^\d+$/.test(param)) return { page: 'not-found' };
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
