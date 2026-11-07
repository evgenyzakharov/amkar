// Страница «Трансферы»: откуда приходили и куда уходили игроки «Амкара» — считается на сайте из таблицы transfer.
// Считаются переходы и аренды; возврат из аренды (kind = loan_end) — не новый трансфер, в итоги не идёт.
import type { Season } from './db/types';

export type TransferDirection = 'in' | 'out';

/** Трансфер со всем, что нужно странице. */
export interface TransferRow {
  id: number;
  player_id: number;
  direction: TransferDirection;
  kind: 'permanent' | 'loan' | 'loan_end' | null;
  other_team_id: number | null;
  /** Клуб так, как он назывался в сезон трансфера (вычисляемый столбец). */
  other_team_name: string | null;
  season: { label: string; start_year: number; end_year: number };
  team: { name: string; crest_url: string | null } | null;
  player: { display_name: string };
}

/** Свои команды — академия и вторая команда: переход оттуда — не трансфер из другого клуба, в топ не идёт. */
export const OWN_CLUBS = ['Академия «Амкар»', 'Амкар-2'];

export interface ClubMove {
  transferId: number;
  playerId: number;
  player: string;
  season: string;
  loan: boolean;
  /** Название клуба в год трансфера, если оно не нынешнее («Терек» у «Ахмата»). */
  then: string | null;
}

export interface ClubTally {
  teamId: number;
  name: string;
  crest: string | null;
  n: number;
  loans: number;
  moves: ClubMove[];
}

export interface Partner {
  teamId: number;
  name: string;
  crest: string | null;
  in: number;
  out: number;
}

export interface SeasonMoves {
  season: Season;
  in: number;
  out: number;
}

export interface TransferStats {
  in: number;
  out: number;
  loansIn: number;
  loansOut: number;
  /** Клубов, с которыми был обмен (без своих команд). */
  clubs: number;
  /** Пришли из своей академии и «Амкара-2». */
  own: number;
  /** Клуб не записан или записан текстом («Медиалига»). */
  noClub: number;
  /** Возвраты из аренды — не считаются. */
  returns: number;
  top: Record<TransferDirection, ClubTally[]>;
  partners: Partner[];
  bySeason: SeasonMoves[];
}

const counted = (t: TransferRow) => t.kind !== 'loan_end';
const isOwn = (t: TransferRow) => !!t.team && OWN_CLUBS.includes(t.team.name);

function tally(rows: TransferRow[], direction: TransferDirection): ClubTally[] {
  const byTeam = new Map<number, ClubTally>();
  for (const t of rows) {
    if (t.direction !== direction || t.other_team_id == null || !t.team) continue;
    const x = byTeam.get(t.other_team_id) ?? {
      teamId: t.other_team_id,
      name: t.team.name,
      crest: t.team.crest_url,
      n: 0,
      loans: 0,
      moves: [],
    };
    x.n++;
    if (t.kind === 'loan') x.loans++;
    x.moves.push({
      transferId: t.id,
      playerId: t.player_id,
      player: t.player.display_name,
      season: t.season.label,
      loan: t.kind === 'loan',
      then: t.other_team_name && t.other_team_name !== t.team.name ? t.other_team_name : null,
    });
    byTeam.set(t.other_team_id, x);
  }
  return [...byTeam.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
}

export function transferStats(rows0: TransferRow[], seasons: Season[]): TransferStats {
  const rows = rows0.filter(counted);
  const clubRows = rows.filter((t) => t.other_team_id != null && !isOwn(t));
  const bothWays = new Map<number, Partner>();
  for (const t of clubRows) {
    const x = bothWays.get(t.other_team_id!) ?? {
      teamId: t.other_team_id!,
      name: t.team!.name,
      crest: t.team!.crest_url,
      in: 0,
      out: 0,
    };
    x[t.direction]++;
    bothWays.set(t.other_team_id!, x);
  }
  const bySeason = [...seasons]
    .sort((a, b) => a.start_year - b.start_year || a.end_year - b.end_year)
    .map((season) => {
      const of = rows.filter((t) => t.season.label === season.label);
      return {
        season,
        in: of.filter((t) => t.direction === 'in').length,
        out: of.filter((t) => t.direction === 'out').length,
      };
    });
  return {
    in: rows.filter((t) => t.direction === 'in').length,
    out: rows.filter((t) => t.direction === 'out').length,
    loansIn: rows.filter((t) => t.direction === 'in' && t.kind === 'loan').length,
    loansOut: rows.filter((t) => t.direction === 'out' && t.kind === 'loan').length,
    clubs: bothWays.size,
    own: rows.filter((t) => t.direction === 'in' && isOwn(t)).length,
    noClub: rows.filter((t) => t.other_team_id == null).length,
    returns: rows0.length - rows.length,
    top: { in: tally(clubRows, 'in'), out: tally(clubRows, 'out') },
    partners: [...bothWays.values()]
      .filter((p) => p.in > 0 && p.out > 0)
      .sort((a, b) => b.in + b.out - (a.in + a.out) || a.name.localeCompare(b.name, 'ru')),
    bySeason,
  };
}

/**
 * Первые top мест и все, кто делит последнее; если делящих слишком много (больше top + extra) — только те, кто выше,
 * а про остальных — строкой под списком (как бомбардиры кубка).
 */
export function topWithTies<T>(list: T[], value: (x: T) => number, top = 10, extra = 5): { shown: T[]; cut: number; rest: number } {
  if (list.length <= top) return { shown: list, cut: 0, rest: 0 };
  const cut = value(list[top - 1]);
  const tied = list.filter((x) => value(x) >= cut);
  const shown = tied.length > top + extra && list.some((x) => value(x) > cut) ? list.filter((x) => value(x) > cut) : tied;
  return { shown, cut, rest: tied.length - shown.length };
}

/** Место в списке, отсортированном по убыванию: у равных — одно место. */
export const placeOf = <T>(list: T[], value: (x: T) => number, i: number) => list.findIndex((x) => value(x) === value(list[i])) + 1;
