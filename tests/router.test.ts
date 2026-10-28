import { describe, expect, it } from 'vitest';
import {
  adminChecksHref,
  adminMatchHref,
  adminNewMatchHref,
  adminPlayerHref,
  adminPointsHref,
  adminSeasonHref,
  pyramidHref,
  coachHref,
  coachesHref,
  compareHref,
  academyHref,
  cupHref,
  opponentHref,
  opponentsHref,
  historyHref,
  leadersHref,
  parseRoute,
  playerHref,
  seasonHref,
} from '../src/router';

describe('маршруты', () => {
  it('публичные страницы', () => {
    expect(parseRoute('')).toEqual({ page: 'seasons' });
    expect(parseRoute('#/season/2011-12')).toEqual({ page: 'season', label: '2011/12', scope: 'all' });
    // «только чемпионат» у сезона и игрока — в адресе, как у лидеров
    expect(parseRoute(seasonHref('2011/12', 'league'))).toEqual({ page: 'season', label: '2011/12', scope: 'league' });
    expect(parseRoute(playerHref(27, 'league'))).toEqual({ page: 'player', id: 27, scope: 'league' });
    expect(parseRoute(playerHref(27))).toEqual({ page: 'player', id: 27, scope: 'all' });
    // сравнение: двое игроков или два сезона — ссылкой можно поделиться
    expect(parseRoute(compareHref({ mode: 'players', a: 27, b: 33 }))).toEqual({ page: 'compare', compare: { mode: 'players', a: 27, b: 33 } });
    expect(parseRoute('#/compare?a=27')).toEqual({ page: 'compare', compare: { mode: 'players', a: 27, b: null } });
    expect(compareHref({ mode: 'seasons', s: '2011/12', t: '2024' })).toBe('#/compare?mode=seasons&s=2011-12&t=2024');
    expect(parseRoute('#/compare?mode=seasons&s=2011-12&t=2024')).toEqual({ page: 'compare', compare: { mode: 'seasons', s: '2011/12', t: '2024' } });
    expect(parseRoute('#/match/12')).toEqual({ page: 'match', id: 12 });
    expect(parseRoute('#/player/x')).toEqual({ page: 'not-found' });
    expect(parseRoute('#/players')).toEqual({ page: 'players' });
    expect(parseRoute('#/players/1')).toEqual({ page: 'not-found' });
    expect(parseRoute(leadersHref())).toEqual({ page: 'leaders', scope: 'all', tab: 'tables' });
    expect(parseRoute(leadersHref('all', 'clubs'))).toEqual({ page: 'leaders', scope: 'all', tab: 'clubs' });
    expect(parseRoute(leadersHref('league'))).toEqual({ page: 'leaders', scope: 'league', tab: 'tables' });
    expect(parseRoute('#/leaders?scope=junk')).toEqual({ page: 'leaders', scope: 'all', tab: 'tables' });
    expect(parseRoute(historyHref())).toEqual({ page: 'history', scope: 'all' });
    expect(parseRoute(historyHref('league'))).toEqual({ page: 'history', scope: 'league' });
    expect(parseRoute(coachesHref())).toEqual({ page: 'coaches', scope: 'all' });
    expect(parseRoute(coachesHref('league'))).toEqual({ page: 'coaches', scope: 'league' });
    expect(parseRoute(coachHref(14))).toEqual({ page: 'coach', id: 14 });
    expect(parseRoute(opponentsHref('league'))).toEqual({ page: 'opponents', scope: 'league' });
    expect(parseRoute(opponentHref(7))).toEqual({ page: 'opponent', id: 7 });
    expect(parseRoute(academyHref)).toEqual({ page: 'academy' });
    expect(parseRoute(cupHref)).toEqual({ page: 'cup' });
    expect(parseRoute('#/coach/oborin')).toEqual({ page: 'not-found' });
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
    expect(parseRoute('#/admin/teams')).toEqual({ page: 'admin', admin: { page: 'teams' } });
    expect(parseRoute('#/admin/coaches')).toEqual({ page: 'admin', admin: { page: 'coaches' } });
    expect(parseRoute('#/admin/players')).toEqual({ page: 'admin', admin: { page: 'players' } });
    expect(parseRoute(adminPlayerHref(27))).toEqual({ page: 'admin', admin: { page: 'player', id: 27 } });
    expect(parseRoute(adminPointsHref)).toEqual({ page: 'admin', admin: { page: 'points' } });
    expect(parseRoute(adminChecksHref)).toEqual({ page: 'admin', admin: { page: 'checks' } });
    expect(parseRoute(pyramidHref)).toEqual({ page: 'pyramid' });
    expect(parseRoute(adminSeasonHref('2008', 'best'))).toEqual({ page: 'admin', admin: { page: 'season', label: '2008', tab: 'best' } });
    expect(parseRoute(adminSeasonHref('2008', 'info'))).toEqual({ page: 'admin', admin: { page: 'season', label: '2008', tab: 'info' } });
    expect(parseRoute('#/admin/match/abc')).toEqual({ page: 'not-found' });
    expect(parseRoute('#/admin/season/2008/old')).toEqual({ page: 'not-found' });
  });
});
