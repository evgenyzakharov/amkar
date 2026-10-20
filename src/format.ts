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

/** Места сборной сезона: код в базе → подпись на поле. */
export const SLOT_LABEL: Record<string, string> = {
  GK: 'ВР',
  LB: 'ЛЗ',
  CB1: 'ЦЗ',
  CB2: 'ЦЗ',
  CB3: 'ЦЗ',
  RB: 'ПЗ',
  LWB: 'ЛФЗ',
  RWB: 'ПФЗ',
  DM1: 'ОП',
  DM2: 'ОП',
  LM: 'ЛП',
  CM1: 'ЦП',
  CM2: 'ЦП',
  CM3: 'ЦП',
  RM: 'ПП',
  AM: 'ЦАП',
  LW: 'ЛВ',
  RW: 'ПВ',
  ST1: 'Ф',
  ST2: 'Ф',
};
/** Подпись места → позиция словами, для подсказки. */
export const SLOT_TITLE: Record<string, string> = {
  ВР: 'вратарь',
  ЛЗ: 'левый защитник',
  ЦЗ: 'центральный защитник',
  ПЗ: 'правый защитник',
  ЛФЗ: 'левый фланговый защитник',
  ПФЗ: 'правый фланговый защитник',
  ОП: 'опорный полузащитник',
  ЛП: 'левый полузащитник',
  ЦП: 'центральный полузащитник',
  ПП: 'правый полузащитник',
  ЦАП: 'центральный атакующий полузащитник',
  ЛВ: 'левый вингер',
  ПВ: 'правый вингер',
  Ф: 'нападающий',
};

/** Схема сборной: линии от нападения к вратарю, в линии — слева направо. */
export interface Formation {
  /** Как в season.best_xi_formation; '' — без схемы. */
  key: string;
  name: string;
  lines: string[][];
}

const BACK4 = ['LB', 'CB1', 'CB2', 'RB'];
const BACK3 = ['CB1', 'CB2', 'CB3'];
const BACK5 = ['LWB', 'CB1', 'CB2', 'CB3', 'RWB'];
const scheme = (key: string, lines: string[][], name = key): Formation => ({ key, name, lines });

/** Схемы на выбор. Новая схема — строка здесь, база принимает любую «цифры через дефис». */
export const FORMATIONS: Formation[] = [
  scheme('', [['ST1', 'ST2'], ['LM', 'CM1', 'CM2', 'CM3', 'RM'], ['LB', 'CB1', 'CB2', 'CB3', 'RB'], ['GK']], 'Без схемы (13 мест, как в Excel)'),
  scheme('4-4-2', [['ST1', 'ST2'], ['LM', 'CM1', 'CM2', 'RM'], BACK4, ['GK']]),
  scheme('4-1-2-1-2', [['ST1', 'ST2'], ['AM'], ['CM1', 'CM2'], ['DM1'], BACK4, ['GK']], '4-1-2-1-2 (ромб)'),
  scheme('4-3-1-2', [['ST1', 'ST2'], ['AM'], ['CM1', 'CM2', 'CM3'], BACK4, ['GK']]),
  scheme('4-3-3', [['LW', 'ST1', 'RW'], ['CM1', 'CM2', 'CM3'], BACK4, ['GK']]),
  scheme('4-2-3-1', [['ST1'], ['LM', 'AM', 'RM'], ['DM1', 'DM2'], BACK4, ['GK']]),
  scheme('4-1-4-1', [['ST1'], ['LM', 'CM1', 'CM2', 'RM'], ['DM1'], BACK4, ['GK']]),
  scheme('4-4-1-1', [['ST1'], ['AM'], ['LM', 'CM1', 'CM2', 'RM'], BACK4, ['GK']]),
  scheme('4-5-1', [['ST1'], ['LM', 'CM1', 'CM2', 'CM3', 'RM'], BACK4, ['GK']]),
  scheme('3-5-2', [['ST1', 'ST2'], ['LM', 'CM1', 'CM2', 'CM3', 'RM'], BACK3, ['GK']]),
  scheme('3-4-3', [['LW', 'ST1', 'RW'], ['LM', 'CM1', 'CM2', 'RM'], BACK3, ['GK']]),
  scheme('5-3-2', [['ST1', 'ST2'], ['CM1', 'CM2', 'CM3'], BACK5, ['GK']]),
  scheme('5-4-1', [['ST1'], ['LM', 'CM1', 'CM2', 'RM'], BACK5, ['GK']]),
];

/** Все места по линиям — для сборной, у которой в базе есть места не из её схемы. */
export const ALL_SLOT_LINES = [
  ['LW', 'ST1', 'ST2', 'RW'],
  ['AM'],
  ['LM', 'CM1', 'CM2', 'CM3', 'RM'],
  ['DM1', 'DM2'],
  ['LWB', 'LB', 'CB1', 'CB2', 'CB3', 'RB', 'RWB'],
  ['GK'],
];

/** Схема по значению из базы; пустая или незнакомая — без схемы. */
export const formationOf = (key: string | null | undefined) => FORMATIONS.find((f) => f.key === (key ?? '')) ?? FORMATIONS[0];

/** Линии для показа сборной: по схеме, а если в базе есть места не из неё — все места. Пустые места и линии убраны. */
export function bestXiLines(key: string | null | undefined, filled: string[]): string[][] {
  const { lines } = formationOf(key);
  const fits = filled.every((slot) => lines.some((line) => line.includes(slot)));
  return (fits ? lines : ALL_SLOT_LINES)
    .map((line) => line.filter((slot) => filled.includes(slot)))
    .filter((line) => line.length > 0);
}

/** Соперник так, как он назывался в сезон матча; без названия по годам — по справочнику или тексту из Excel. */
export const opponentName = (m: Pick<MatchRow, 'team' | 'opponent_raw' | 'opponent_name'>) =>
  m.opponent_name ?? m.team?.name ?? m.opponent_raw ?? 'соперник не указан';

/** «2:1», «1:1 д.в. (пен. 4:3)», «д.в.», если счёт ещё не внесён. Счёт — со стороны «Амкара». */
export function formatScore(m: Pick<MatchRow, 'goals_for' | 'goals_against' | 'extra_time' | 'pens_for' | 'pens_against'>): string {
  let s = m.goals_for != null && m.goals_against != null ? `${m.goals_for}:${m.goals_against}` : '';
  if (m.extra_time) s += ' д.в.';
  if (m.pens_for != null && m.pens_against != null) s += ` (пен. ${m.pens_for}:${m.pens_against})`;
  return s.trim();
}

/** Счёт со стороны хозяев, как в заголовке «хозяева — гости»: в гостях «Амкар» справа — «2:0», а не «0:2». */
export function formatHomeScore(
  m: Pick<MatchRow, 'venue' | 'goals_for' | 'goals_against' | 'extra_time' | 'pens_for' | 'pens_against'>,
): string {
  if (m.venue !== 'away') return formatScore(m);
  return formatScore({ ...m, goals_for: m.goals_against, goals_against: m.goals_for, pens_for: m.pens_against, pens_against: m.pens_for });
}

/** Возраст в годах на дату: «1990-01-01», «2008-03-15» → 18,2. Даты — без часового пояса. */
export function ageYears(birth: string, on: string): number {
  return (Date.parse(`${on}T00:00:00Z`) - Date.parse(`${birth}T00:00:00Z`)) / (365.25 * 86_400_000);
}

/** 18.2 → «18,2» */
export const formatAge = (years: number) => years.toFixed(1).replace('.', ',');

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

/** Эпохи клуба: колонки списка сезонов и разделы истории. Сезон попадает в эпоху по году начала. */
export const SEASON_EPOCHS: { title: string; until: number }[] = [
  { title: '1995–2003', until: 2003 },
  { title: '2004–2018', until: 2018 },
  { title: 'с 2021', until: Infinity },
];

/** Нынешний «Амкар» — новый клуб: с этого года начала сезона серии и история идут заново. */
export const NEW_CLUB_FROM = 2021;
