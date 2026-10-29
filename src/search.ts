// Общий поиск в шапке: игроки, соперники (и их прежние названия), тренеры, сезоны — одним полем.
import { plural } from './format';
import { coachHref, opponentHref, playerHref, seasonHref } from './router';

export interface SearchIndex {
  players: { id: number; name: string; last: string; first: string | null; years: string | null; games: number }[];
  teams: { id: number; name: string; city: string | null; names: string[] }[];
  coaches: { id: number; name: string; short: string; years: string | null }[];
  seasons: { label: string; division: string | null }[];
}

export interface SearchHit {
  group: 'Игроки' | 'Соперники' | 'Тренеры' | 'Сезоны';
  href: string;
  title: string;
  detail: string;
}

const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
/** Совпадение с началом слова: «поп» находит «А. Попов», но не «Липопов». */
const starts = (text: string, q: string) => norm(text).split(/[\s.«»"()-]+/).some((w) => w.startsWith(q)) || norm(text).startsWith(q);

const LIMIT = { Игроки: 6, Соперники: 4, Тренеры: 3, Сезоны: 3 } as const;

export function search(index: SearchIndex, query: string): SearchHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const players = index.players
    .filter((p) => [p.name, p.last, p.first ?? '', p.first ? `${p.first} ${p.last}` : ''].some((t) => t && starts(t, q)))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'ru'))
    .slice(0, LIMIT.Игроки)
    .map((p): SearchHit => ({
      group: 'Игроки',
      href: playerHref(p.id),
      // в результатах — имя и фамилия: так тёзок различить проще
      title: p.first ? `${p.first} ${p.last}` : p.name,
      detail: [p.years, p.games ? `${p.games} ${plural(p.games, ['матч', 'матча', 'матчей'])}` : 'без матчей'].filter(Boolean).join(' · '),
    }));
  const teams = index.teams
    .filter((t) => [t.name, t.city ?? '', ...t.names].some((x) => x && starts(x, q)))
    .slice(0, LIMIT.Соперники)
    .map((t): SearchHit => {
      // нашли по прежнему названию — покажем его: «Урал · был «Уралмаш»»
      const old = !starts(t.name, q) && t.names.find((n) => starts(n, q) && norm(n) !== norm(t.name));
      return { group: 'Соперники', href: opponentHref(t.id), title: t.name, detail: [t.city, old && `был «${old}»`].filter(Boolean).join(' · ') };
    });
  const coaches = index.coaches
    .filter((c) => starts(c.name, q) || starts(c.short, q))
    .slice(0, LIMIT.Тренеры)
    .map((c): SearchHit => ({ group: 'Тренеры', href: coachHref(c.id), title: c.name, detail: c.years ?? '' }));
  // сезон — по началу метки: «2011» находит «2011/12», «08» — «2008»
  const seasons = index.seasons
    .filter((s) => s.label.startsWith(q) || s.label.slice(2).startsWith(q))
    .slice(-LIMIT.Сезоны)
    .reverse()
    .map((s): SearchHit => ({ group: 'Сезоны', href: seasonHref(s.label), title: `Сезон ${s.label}`, detail: s.division ?? '' }));
  return [...players, ...teams, ...coaches, ...seasons];
}
