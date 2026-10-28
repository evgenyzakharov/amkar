// «Проверка данных»: сверки, которые раньше гонялись скриптом. Ничего не меняют — только находят случаи.
// Случаи в проверках «стоит посмотреть» автор может отметить «Так и есть» (таблица data_check_ok) — тогда они не всплывают.
import type { AbsenceReason, CompetitionKind } from '../db/types';

export interface CheckData {
  seasons: { id: number; label: string; start_year: number; end_year: number }[];
  matches: {
    id: number;
    season_id: number;
    seq: number;
    match_date: string | null;
    goals_for: number | null;
    goals_against: number | null;
    awarded: boolean;
    coach_id: number | null;
    opponent_name: string | null;
    competition: { kind: CompetitionKind };
  }[];
  appearances: { match_id: number; player_id: number; role: 'start' | 'sub' | 'bench' | null; minutes: number | null; replaced_player_id: number | null }[];
  absences: { match_id: number; player_id: number; reason: AbsenceReason }[];
  goals: { match_id: number; side: 'amkar' | 'opponent'; minute: number | null }[];
  squad: { season_id: number; player_id: number }[];
  players: { id: number; display_name: string; birth_date: string | null }[];
  tenures: { coach_id: number; from_date: string; to_date: string | null }[];
  /** Пропущенные вратарей по сезонам — из player_season_stats. */
  conceded: { season_id: number; goals_conceded: number | null }[];
  /** Отмеченные «Так и есть». */
  ok: { check_key: string; item_key: string }[];
}

/** ok — всё в порядке; warn — стоит посмотреть; info — известно и на статистику не влияет. */
export type CheckLevel = 'ok' | 'warn' | 'info';

export interface CheckItem {
  key: string;
  text: string;
  matchId?: number;
  playerId?: number;
  /** Отмечено «Так и есть». */
  accepted: boolean;
}

export interface CheckResult {
  key: string;
  title: string;
  level: CheckLevel;
  /** Пояснение к проверке целиком: «1995–1998: …». */
  summary?: string;
  items: CheckItem[];
  /** Случаи можно отметить «Так и есть». */
  acceptable: boolean;
}

const played = (a: CheckData['appearances'][number]) => (a.minutes ?? 0) > 0 || a.role === 'start' || a.role === 'sub';

export function runChecks(d: CheckData): CheckResult[] {
  const seasonOf = new Map(d.seasons.map((s) => [s.id, s]));
  const matchOf = new Map(d.matches.map((m) => [m.id, m]));
  const nameOf = new Map(d.players.map((p) => [p.id, p.display_name]));
  const accepted = new Set(d.ok.map((o) => `${o.check_key}|${o.item_key}`));
  const official = (m: CheckData['matches'][number]) => m.competition.kind !== 'friendly';
  const matchLabel = (m: CheckData['matches'][number]) =>
    `${seasonOf.get(m.season_id)?.label ?? '?'}, №${m.seq} «${m.opponent_name ?? '?'}»`;

  const results: CheckResult[] = [];
  const add = (key: string, title: string, acceptable: boolean, items: Omit<CheckItem, 'accepted'>[], summary?: string) => {
    const list = items.map((i) => ({ ...i, accepted: acceptable && accepted.has(`${key}|${i.key}`) }));
    const open = list.filter((i) => !i.accepted).length;
    const level: CheckLevel = list.length === 0 ? 'ok' : acceptable && open > 0 ? 'warn' : 'info';
    results.push({ key, title, level, summary, items: list, acceptable });
  };

  // Голы матча — со счётом. Технический результат голов не имеет, матч без счёта не с чем сверить
  const goalsOf = new Map<number, { a: number; o: number }>();
  for (const g of d.goals) {
    const c = goalsOf.get(g.match_id) ?? { a: 0, o: 0 };
    if (g.side === 'amkar') c.a++;
    else c.o++;
    goalsOf.set(g.match_id, c);
  }
  const scoreItems = (friendly: boolean) =>
    d.matches
      .filter((m) => official(m) !== friendly && !m.awarded && m.goals_for != null && m.goals_against != null)
      .flatMap((m) => {
        const c = goalsOf.get(m.id) ?? { a: 0, o: 0 };
        if (c.a === m.goals_for && c.o === m.goals_against) return [];
        return [{ key: String(m.id), matchId: m.id, text: `${matchLabel(m)} ${m.goals_for}:${m.goals_against}, записано голов ${c.a}:${c.o}` }];
      });
  add('score-official', 'Голы официальных матчей сходятся со счётом', true, scoreItems(false));
  add('score-friendly', 'Голы товарищеских матчей сходятся со счётом', true, scoreItems(true));

  // Пропущенные вратарей за сезон — столько же, сколько забил соперник в официальных матчах
  const gk = new Map<number, number>();
  for (const c of d.conceded) if (c.goals_conceded != null) gk.set(c.season_id, (gk.get(c.season_id) ?? 0) + c.goals_conceded);
  const against = new Map<number, number>();
  for (const m of d.matches) if (official(m) && m.goals_against != null) against.set(m.season_id, (against.get(m.season_id) ?? 0) + m.goals_against);
  add(
    'gk-conceded',
    'Пропущенные вратарей равны голам соперника',
    true,
    d.seasons
      .filter((s) => (gk.get(s.id) ?? 0) !== (against.get(s.id) ?? 0))
      .map((s) => ({ key: String(s.id), text: `${s.label}: у вратарей ${gk.get(s.id) ?? 0}, соперник забил ${against.get(s.id) ?? 0}` })),
  );

  // Номера матчей идут по датам
  const seqItems: Omit<CheckItem, 'accepted'>[] = [];
  for (const s of d.seasons) {
    const ms = d.matches.filter((m) => m.season_id === s.id && m.match_date).sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < ms.length; i++) {
      if (ms[i].match_date! < ms[i - 1].match_date!) {
        seqItems.push({
          key: String(ms[i].id),
          matchId: ms[i].id,
          text: `${s.label}: №${ms[i - 1].seq} — ${ms[i - 1].match_date}, а №${ms[i].seq} — ${ms[i].match_date}`,
        });
      }
    }
  }
  add('seq-date', 'Номера матчей идут по датам', true, seqItems);

  // Вышел на поле, а в заявке сезона его нет
  const inSquad = new Set(d.squad.map((x) => `${x.season_id}:${x.player_id}`));
  add(
    'appearance-squad',
    'Выходы на поле без заявки сезона',
    true,
    d.appearances
      .filter((a) => {
        const m = matchOf.get(a.match_id);
        return m && played(a) && !inSquad.has(`${m.season_id}:${a.player_id}`);
      })
      .map((a) => ({
        key: `${a.match_id}:${a.player_id}`,
        matchId: a.match_id,
        playerId: a.player_id,
        text: `${matchLabel(matchOf.get(a.match_id)!)}: ${nameOf.get(a.player_id) ?? a.player_id}`,
      })),
  );

  // Тренер матча — в своих сроках (если сроки внесены)
  const tenuresOf = new Map<number, CheckData['tenures']>();
  for (const t of d.tenures) tenuresOf.set(t.coach_id, [...(tenuresOf.get(t.coach_id) ?? []), t]);
  add(
    'coach-tenure',
    'Тренер матча вне своих сроков работы',
    true,
    d.matches
      .filter((m) => {
        const ts = m.coach_id ? tenuresOf.get(m.coach_id) : undefined;
        return ts && m.match_date && !ts.some((t) => t.from_date <= m.match_date! && (t.to_date ?? '9999') >= m.match_date!);
      })
      .map((m) => ({ key: String(m.id), matchId: m.id, text: `${matchLabel(m)}, ${m.match_date}` })),
  );

  // Один игрок — и в составе, и в пропусках одного матча
  const appKey = new Set(d.appearances.map((a) => `${a.match_id}:${a.player_id}`));
  add(
    'lineup-absence',
    'Один игрок и в составе, и в пропусках матча',
    true,
    d.absences
      .filter((x) => appKey.has(`${x.match_id}:${x.player_id}`) && matchOf.has(x.match_id))
      .map((x) => ({
        key: `${x.match_id}:${x.player_id}`,
        matchId: x.match_id,
        playerId: x.player_id,
        text: `${matchLabel(matchOf.get(x.match_id)!)}: ${nameOf.get(x.player_id) ?? x.player_id}`,
      })),
  );

  // Известное и на статистику не влияющее
  const unpaired = d.appearances.filter((a) => a.role === 'sub' && !a.replaced_player_id && matchOf.has(a.match_id));
  const bySeason = new Map<string, number>();
  for (const a of unpaired) {
    const label = seasonOf.get(matchOf.get(a.match_id)!.season_id)?.label ?? '?';
    bySeason.set(label, (bySeason.get(label) ?? 0) + 1);
  }
  add(
    'subs-unpaired',
    'Замены без «кого заменил»',
    false,
    unpaired.map((a) => ({
      key: `${a.match_id}:${a.player_id}`,
      matchId: a.match_id,
      text: `${matchLabel(matchOf.get(a.match_id)!)}: ${nameOf.get(a.player_id) ?? a.player_id}`,
    })),
    unpaired.length ? `${[...bySeason].map(([s, n]) => `${s} — ${n}`).join(', ')}. На статистику не влияет: видно только на странице матча.` : undefined,
  );

  const noMinute = d.goals.filter((g) => g.minute == null && matchOf.has(g.match_id));
  const noMinuteOfficial = noMinute.filter((g) => official(matchOf.get(g.match_id)!)).length;
  add(
    'goals-no-minute',
    'Голы без минуты',
    false,
    [...new Set(noMinute.map((g) => g.match_id))].map((id) => {
      const n = noMinute.filter((g) => g.match_id === id).length;
      return { key: String(id), matchId: id, text: `${matchLabel(matchOf.get(id)!)}: ${n}` };
    }),
    // число у проверки — матчи, а голов в них — в пояснении
    noMinute.length
      ? `Голов — ${noMinute.length}. ` +
          (noMinuteOfficial === 0
            ? 'Все в товарищеских — в статистику не идут.'
            : `В официальных — ${noMinuteOfficial}: не попадают в «Голы по минутам».`)
      : undefined,
  );

  const playedIds = new Set(d.appearances.filter(played).map((a) => a.player_id));
  const noBirth = d.players.filter((p) => !p.birth_date);
  const noBirthPlayed = noBirth.filter((p) => playedIds.has(p.id)).length;
  add(
    'players-no-birth',
    'Игроки без даты рождения',
    false,
    noBirth.map((p) => ({ key: String(p.id), playerId: p.id, text: p.display_name })),
    noBirth.length
      ? noBirthPlayed === 0
        ? 'Ни один не выходил на поле.'
        : `Выходили на поле — ${noBirthPlayed}: их нет в возрастных рекордах и среднем возрасте.`
      : undefined,
  );

  return results;
}
