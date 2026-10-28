// Ошибки базы по-русски. Имена ограничений — те, что Postgres дал им по миграциям из supabase/migrations;
// тест tests/dbErrors.test.ts следит, чтобы у каждого ограничения было объяснение.

/** Ошибка записи в базу: код Postgres или PostgREST и исходный текст. */
export class DbError extends Error {
  code?: string;
  details?: string | null;
  hint?: string | null;
  constructor(e: { message: string; code?: string; details?: string | null; hint?: string | null }) {
    super(e.message);
    this.name = 'DbError';
    this.code = e.code;
    this.details = e.details;
    this.hint = e.hint;
  }
}

export const CONSTRAINT_MESSAGES: Record<string, string> = {
  // матч
  match_pkey: 'Матч с таким номером записи уже есть.',
  match_check: 'Укажите соперника.',
  match_check1: 'Счёт заполняется целиком: голы обеих команд или ничего.',
  match_check2: 'Серия пенальти заполняется целиком: обе команды или ничего.',
  match_check3: 'Серия пенальти бывает только после ничьей, и в ней должен быть победитель.',
  match_check4: 'Результат не сходится со счётом.',
  match_check5: 'Результат не сходится с серией пенальти: можно «ничья» или итог серии.',
  match_awarded_has_result: 'У технического результата должен быть указан результат: победа, ничья или поражение.',
  match_season_id_seq_key: 'В сезоне уже есть матч с таким номером.',
  match_seq_check: 'Номер матча в сезоне — больше нуля.',
  match_goals_for_check: 'Голы не могут быть отрицательными.',
  match_goals_against_check: 'Голы не могут быть отрицательными.',
  match_pens_for_check: 'Пенальти не могут быть отрицательными.',
  match_pens_against_check: 'Пенальти не могут быть отрицательными.',
  match_result_check: 'Результат — победа, ничья или поражение.',
  match_venue_check: 'Место матча — дома, в гостях или на нейтральном поле.',
  match_season_id_fkey: 'Такого сезона нет.',
  match_competition_id_fkey: 'Такого турнира нет.',
  match_opponent_id_fkey: 'Такого соперника нет в справочнике.',
  match_coach_id_fkey: 'Такого тренера нет в справочнике.',
  match_attendance_check: 'Зрителей не может быть меньше нуля.',

  // состав на матч
  appearance_pkey: 'Игрок уже есть в составе на этот матч.',
  appearance_check: 'У игрока в запасе не может быть минут на поле.',
  appearance_check1: 'Минута выхода и «кого заменил» бывают только у вышедших на замену.',
  appearance_check2: 'Игрок не может заменить сам себя.',
  appearance_check3: 'Минута ухода не может быть раньше минуты выхода.',
  appearance_minutes_check: 'Минуты на поле — от 0 до 130.',
  appearance_minute_on_check: 'Минута выхода — от 1 до 130.',
  appearance_minute_off_check: 'Минута ухода — от 1 до 130.',
  appearance_role_check: 'Роль в составе — старт, замена или запас.',
  appearance_match_id_fkey: 'Матча нет в базе — возможно, его удалили.',
  appearance_player_id_fkey: 'Такого игрока нет в базе.',
  appearance_match_id_replaced_player_id_fkey: 'Заменённого игрока нет в составе на этот матч.',

  // пропуски матча
  absence_pkey: 'Пропуск этого игрока уже записан.',
  absence_reason_check: 'Причина пропуска — травма, дисквалификация или сборная.',
  absence_match_id_fkey: 'Матча нет в базе — возможно, его удалили.',
  absence_player_id_fkey: 'Такого игрока нет в базе.',

  // голы
  goal_pkey: 'Такой гол уже записан.',
  goal_check: 'У гола один автор: игрок из списка или имя текстом.',
  goal_check1: 'Игрок «Амкара» бывает автором нашего гола или автогола в наши ворота.',
  goal_check2: 'Игрок соперника (текстом) бывает автором пропущенного гола или автогола в ворота соперника.',
  goal_check3: 'Голевая передача бывает только у гола «Амкара», не у автогола.',
  goal_check4: 'Добавленное время бывает только после 45, 90, 105 или 120 минуты.',
  goal_minute_check: 'Минута гола — от 1 до 130.',
  goal_added_time_check: 'Добавленное время — от 1 до 30 минут.',
  goal_side_check: 'Гол забит «Амкаром» или соперником.',
  goal_kind_check: 'Гол — с игры, с пенальти или автогол.',
  goal_match_id_fkey: 'Матча нет в базе — возможно, его удалили.',
  goal_scorer_id_fkey: 'Автора гола нет в базе.',
  goal_assist_id_fkey: 'Ассистента нет в базе.',

  // видео матча
  match_video_pkey: 'Такое видео уже записано.',
  match_video_match_id_fkey: 'Матча нет в базе — возможно, его удалили.',
  match_video_kind_check: 'Видео — полный матч или обзор.',
  match_video_url_check: 'Ссылка на видео должна начинаться с https://',
  match_video_youtube_or_vk: 'Видео — только ссылкой на YouTube или ВК.',
  match_video_title_check: 'Подпись к видео не может состоять из одних пробелов.',
  match_video_match_id_url_key: 'Эта ссылка у матча уже есть.',

  // справочники
  team_pkey: 'Такой соперник уже есть.',
  team_name_key: 'Соперник с таким названием уже есть в справочнике.',
  team_name_pkey: 'Такое название клуба уже записано.',
  team_name_team_id_fkey: 'Клуба нет в справочнике — возможно, его удалили.',
  team_name_name_check: 'Название клуба не может быть пустым.',
  team_name_from_year_check: 'Год — четыре цифры, например 1996.',
  team_name_to_year_check: 'Год — четыре цифры, например 2002.',
  team_name_check: 'Год начала названия не может быть позже года конца.',
  coach_pkey: 'Такой тренер уже есть.',
  coach_tenure_pkey: 'Такой срок тренера уже записан.',
  coach_tenure_coach_id_fkey: 'Тренера нет в справочнике — возможно, его удалили.',
  coach_tenure_check: 'Дата увольнения не может быть раньше даты назначения.',
  competition_pkey: 'Такой турнир уже есть.',
  competition_name_key: 'Турнир с таким названием уже есть.',
  competition_kind_check: 'Неизвестный вид турнира.',
  player_pkey: 'Такой игрок уже есть.',

  // сезон и заявка
  season_pkey: 'Такой сезон уже есть.',
  season_label_key: 'Сезон с таким названием уже есть.',
  season_check: 'Сезон заканчивается в год начала или в следующий.',
  season_check1: 'Место в таблице не может быть больше числа команд.',
  season_final_place_check: 'Место в таблице — больше нуля.',
  season_teams_count_check: 'Число команд — больше нуля.',
  season_tier_check: 'Уровень лиги — от 1 до 4.',
  season_league_group_check: 'Группа — «Золото» или «Серебро».',
  squad_member_pkey: 'Игрок уже есть в заявке этого сезона.',
  squad_member_shirt_number_check: 'Номер на футболке — от 1 до 99.',
  squad_member_position_check: 'Позиция — вратарь, защитник, полузащитник или нападающий.',
  squad_member_squad_group_check: 'Группа заявки — основа или молодёжь.',
  squad_member_starts_check: 'Выходы в старте не могут быть отрицательными.',
  squad_member_season_id_fkey: 'Такого сезона нет.',
  squad_member_player_id_fkey: 'Такого игрока нет в базе.',
  player_season_totals_pkey: 'Итоги игрока за этот сезон и турнир уже записаны.',
  player_season_totals_goals_check: 'Голы не могут быть отрицательными.',
  player_season_totals_assists_check: 'Передачи не могут быть отрицательными.',
  player_season_totals_goals_conceded_check: 'Пропущенные мячи не могут быть отрицательными.',
  player_season_totals_competition_id_fkey: 'Такого турнира нет.',
  player_season_totals_season_id_player_id_fkey: 'Игрока нет в заявке этого сезона.',
  season_best_xi_pkey: 'Это место в сборной сезона уже занято.',
  season_best_xi_slot_check: 'Неизвестная позиция в сборной сезона.',
  season_best_xi_formation_check: 'Схема сборной — цифры через дефис, например 4-4-2 или 4-1-2-1-2.',
  season_best_xi_season_id_fkey: 'Такого сезона нет.',
  season_best_xi_player_id_fkey: 'Такого игрока нет в базе.',

  // трансферы
  transfer_pkey: 'Такой трансфер уже есть.',
  transfer_direction_check: 'Трансфер — приход или уход.',
  transfer_transfer_window_check: 'Трансферное окно — зимнее или летнее.',
  transfer_kind_check: 'Вид трансфера — переход, аренда или конец аренды.',
  transfer_player_id_fkey: 'Такого игрока нет в базе.',
  transfer_season_id_fkey: 'Такого сезона нет.',
  transfer_other_team_id_fkey: 'Такого клуба нет в справочнике.',

  // карточки: позиция и ссылки
  player_position_check: 'Позиция — вратарь, защитник, полузащитник или нападающий.',
  player_photo_url_check: 'Ссылка на фото должна начинаться с https://',
  player_link_pkey: 'Ссылка на этот сайт у игрока уже есть.',
  player_link_site_check: 'Ссылки бывают на Transfermarkt, Википедию и Чемпионат.',
  player_link_url_check: 'Адрес ссылки должен начинаться с https://',
  player_link_player_id_fkey: 'Такого игрока нет в базе.',
  season_link_pkey: 'Ссылка на этот сайт у сезона уже есть.',
  season_link_site_check: 'Ссылки бывают на Transfermarkt, Википедию и Чемпионат.',
  season_link_url_check: 'Адрес ссылки должен начинаться с https://',
  season_link_season_id_fkey: 'Такого сезона нет.',

  // очки сезона: формула, ожидания, ручные поправки
  points_settings_pkey: 'Настройки формулы уже есть — правьте существующие.',
  points_settings_single_row: 'Настройки формулы — одна строка.',
  points_settings_weights: 'Веса очков — от 0 до 20.',
  points_settings_shares: 'Доли — от 0 до 1 (от 0 до 100 %).',
  points_settings_tier_rates: 'Курс уровня лиги — больше 0 и не больше 2.',
  points_settings_place: 'Множитель за место: оба больше нуля, за первое место — не меньше, чем за последнее, и не больше 3.',
  points_settings_peak: 'Лучших сезонов — от 0 до 10, их вес — от 0 до 5.',
  points_settings_tiers: 'Пороги ярусов — по убыванию: «Пантеон» выше «Легенд», те выше «Топа» и так далее; от 0 до 10 000.',
  season_expected_place_check: 'Ожидаемое место — от 1.',
  season_expected_place_teams: 'Ожидаемое место не может быть больше числа команд.',
  player_season_adjustment_pkey: 'Поправка этому игроку в этом сезоне уже есть.',
  player_season_adjustment_points_check: 'Поправка — от −5 до +5 и не ноль.',
  player_season_adjustment_comment_check: 'У поправки нужен комментарий: за что она.',
  player_season_adjustment_season_id_player_id_fkey: 'Игрока нет в заявке этого сезона.',

  // ключи повтора сохранения: совпасть могут только у той же строки формы — значит, она уже записана
  match_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  goal_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  match_video_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  team_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  coach_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  player_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  transfer_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  team_name_client_key_key: 'Эта запись уже сохранена — обновите страницу.',
  coach_tenure_client_key_key: 'Эта запись уже сохранена — обновите страницу.',

  // проверка данных: «так и есть»
  data_check_ok_pkey: 'Этот случай уже отмечен как верный.',
  data_check_ok_check_key_check: 'Не указана проверка.',
  data_check_ok_item_key_check: 'Не указан случай проверки.',
};

/** Что за записи ссылаются на удаляемую — для «удалить нельзя». */
const REFERENCING_TABLE: Record<string, string> = {
  match: 'матчи',
  appearance: 'составы на матчи',
  absence: 'пропуски матчей',
  goal: 'голы',
  squad_member: 'заявки сезонов',
  transfer: 'трансферы',
  season_best_xi: 'сборные сезонов',
  player_season_totals: 'итоги сезонов',
  player_season_adjustment: 'ручные поправки очков сезона',
};

const COLUMN_LABEL: Record<string, string> = {
  seq: 'номер матча',
  competition_id: 'турнир',
  season_id: 'сезон',
  name: 'название',
  full_name: 'полное имя',
  short_name: 'короткое имя',
  side: 'чей гол',
  kind: 'тип',
  reason: 'причина',
  player_id: 'игрок',
  display_name: 'имя',
  last_name: 'фамилия',
};

export function dbErrorMessage(e: unknown): string {
  if (!(e instanceof Error) && (typeof e !== 'object' || e === null)) return String(e);
  const { message = '', code } = e as { message?: string; code?: string };
  // Сообщения самого приложения уже по-русски
  if (code === 'app') return message;

  if (/row-level security|permission denied/i.test(message) || code === '42501') {
    return 'Нет прав на запись. Войдите заново под аккаунтом админа.';
  }
  if (code === 'PGRST301' || code === 'PGRST303' || /JWT expired/i.test(message)) {
    return 'Сессия истекла — войдите заново.';
  }
  // Запрос ушёл, ответа нет: могло и записаться. Повтор безопасен — новые строки идут с ключом client_key
  if (/failed to fetch|networkerror|load failed|timed out|timeout|aborted/i.test(message)) {
    return 'Нет связи с базой: неизвестно, успело ли записаться. Проверьте интернет и нажмите «Сохранить» ещё раз — записанное не задвоится.';
  }

  const constraint = /constraint "([^"]+)"/.exec(message)?.[1];
  if (code === '23503' || /foreign key constraint/.test(message)) {
    // Удаление записи, на которую ссылаются другие: «update or delete on table "team" … on table "match"»
    const referencing = /^update or delete on table "[^"]+" violates foreign key constraint "[^"]+" on table "([^"]+)"/.exec(
      message,
    )?.[1];
    if (referencing) {
      return `Удалить нельзя: на эту запись ссылаются ${REFERENCING_TABLE[referencing] ?? referencing}.`;
    }
  }
  if (constraint && CONSTRAINT_MESSAGES[constraint]) return CONSTRAINT_MESSAGES[constraint];

  const notNull = /null value in column "([^"]+)"/.exec(message)?.[1];
  if (notNull) return `Не заполнено обязательное поле: ${COLUMN_LABEL[notNull] ?? notNull}.`;
  if (code === '22P02' || code === '22007' || code === '22008') return `Неверный формат значения: ${message}`;
  if (code === '22003') return 'Число слишком большое.';
  return `Ошибка базы: ${message}`;
}
