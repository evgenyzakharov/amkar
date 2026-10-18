import { describe, expect, it } from 'vitest';
import { adminMatchHref, adminNewMatchHref, adminSeasonHref, parseRoute } from '../src/router';

describe('маршруты', () => {
  it('публичные страницы', () => {
    expect(parseRoute('')).toEqual({ page: 'seasons' });
    expect(parseRoute('#/season/2011-12')).toEqual({ page: 'season', label: '2011/12' });
    expect(parseRoute('#/match/12')).toEqual({ page: 'match', id: 12 });
    expect(parseRoute('#/player/x')).toEqual({ page: 'not-found' });
    expect(parseRoute('#/players')).toEqual({ page: 'players' });
    expect(parseRoute('#/players/1')).toEqual({ page: 'not-found' });
  });

  it('админка', () => {
    expect(parseRoute('#/admin')).toEqual({ page: 'admin', admin: { page: 'home' } });
    expect(parseRoute(adminSeasonHref('2011/12'))).toEqual({ page: 'admin', admin: { page: 'season', label: '2011/12', tab: 'matches' } });
    expect(parseRoute(adminSeasonHref('2011/12', 'grid'))).toEqual({
      page: 'admin',
      admin: { page: 'season', label: '2011/12', tab: 'grid' },
    });
    expect(parseRoute(adminSeasonHref('2008', 'squad'))).toEqual({ page: 'admin', admin: { page: 'season', label: '2008', tab: 'squad' } });
    expect(parseRoute(adminSeasonHref('2008', 'transfers'))).toEqual({
      page: 'admin',
      admin: { page: 'season', label: '2008', tab: 'transfers' },
    });
    expect(parseRoute(adminMatchHref(7))).toEqual({ page: 'admin', admin: { page: 'match', id: 7 } });
    expect(parseRoute(adminNewMatchHref('2008'))).toEqual({ page: 'admin', admin: { page: 'new-match', label: '2008' } });
    expect(parseRoute('#/admin/match/abc')).toEqual({ page: 'not-found' });
    expect(parseRoute('#/admin/season/2008/old')).toEqual({ page: 'not-found' });
  });
});
