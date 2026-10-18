// Подписи и форматирование для страниц
import type { AbsenceReason, CompetitionKind, LinkSite, MatchRow, Position, Result, Transfer } from './db/types';

export const RESULT_LABEL: Record<Result, string> = { W: 'В', D: 'Н', L: 'П' };
export const RESULT_TITLE: Record<Result, string> = { W: 'победа', D: 'ничья', L: 'поражение' };
export const AWARDED_LABEL: Record<Result, string> = {
  W: 'техническая победа',
  D: 'техническая ничья',
  L: 'техническое поражение',
};

export const POSITION_LABEL: Record<Position, string> = { GK: 'ВР', DF: 'ЗЩ', MF: 'ПЗ', FW: 'НП' };
export const POSITION_TITLE: Record<Position, string> = {
  GK: 'вратарь',
  DF: 'защитник',
  MF: 'полузащитник',
  FW: 'нападающий',
};
export const POSITION_ORDER: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
export const POSITION_NAME: Record<Position, string> = {
  GK: 'Вратарь',
  DF: 'Защитник',
  MF: 'Полузащитник',
  FW: 'Нападающий',
};

/** Внешние сайты в порядке кнопок. */
export const LINK_SITES: { site: LinkSite; label: string }[] = [
  { site: 'transfermarkt', label: 'Transfermarkt' },
  { site: 'championat', label: 'Чемпионат' },
  { site: 'wikipedia', label: 'Википедия' },
];

/** Склонение по числу: plural(5, ['сезон', 'сезона', 'сезонов']) → «сезонов». */
export function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

/** 38671 → «38 671». */
export const formatInt = (n: number) => n.toLocaleString('ru-RU');

/** 0.4 → «0,40». */
export const formatRatio = (n: number) => n.toFixed(2).replace('.', ',');

export const COMPETITION_SHORT: Record<CompetitionKind, string> = {
  league: 'чемп.',
  cup: 'кубок',
  europe: 'ЛЕ',
  playoff: 'стыки',
  friendly: 'тов.',
};

export const VENUE_LABEL = { home: 'дома', away: 'в гостях', neutral: 'на нейтральном поле' } as const;

export const ABSENCE_LABEL: Record<AbsenceReason, string> = {
  injury: 'Травма',
  suspension: 'Дисквалификация',
  national_team: 'Сборная',
};

export const WINDOW_LABEL = { winter: 'зима', summer: 'лето' } as const;
export const DIRECTION_LABEL = { in: 'пришёл', out: 'ушёл' } as const;
export const TRANSFER_KIND_LABEL: Record<NonNullable<Transfer['kind']>, string> = {
  permanent: 'трансфер',
  loan: 'аренда',
  loan_end: 'конец аренды',
};

/** Слоты сборной сезона по линиям, от нападения к вратарю и слева направо. */
export const BEST_XI_LINES = [
  ['ST1', 'ST2'],
  ['LM', 'CM1', 'CM2', 'CM3', 'RM'],
  ['LB', 'CB1', 'CB2', 'CB3', 'RB'],
  ['GK'],
];
export const SLOT_LABEL: Record<string, string> = {
  GK: 'ВР',
  RB: 'ПЗ',
  CB1: 'ЦЗ',
  CB2: 'ЦЗ',
  CB3: 'ЦЗ',
  LB: 'ЛЗ',
  CM1: 'ЦП',
  CM2: 'ЦП',
  CM3: 'ЦП',
  RM: 'ПП',
  LM: 'ЛП',
  ST1: 'Ф',
  ST2: 'Ф',
};

export const opponentName = (m: Pick<MatchRow, 'team' | 'opponent_raw'>) =>
  m.team?.name ?? m.opponent_raw ?? 'соперник не указан';

/** «2:1», «1:1 д.в. (пен. 4:3)», «д.в.», если счёт ещё не внесён. Счёт — со стороны «Амкара». */
export function formatScore(m: MatchRow): string {
  let s = m.goals_for != null && m.goals_against != null ? `${m.goals_for}:${m.goals_against}` : '';
  if (m.extra_time) s += ' д.в.';
  if (m.pens_for != null && m.pens_against != null) s += ` (пен. ${m.pens_for}:${m.pens_against})`;
  return s.trim();
}

/** «2008-05-17» → «17.05.2008» без участия часового пояса. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Пустая ячейка для неизвестного значения, иначе число. */
export const num = (n: number | null | undefined) => (n == null ? '' : String(n));

/** Сумма известных значений; null, если неизвестны все. */
export function sumKnown(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}
