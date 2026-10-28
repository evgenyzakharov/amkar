-- Правила в одном месте и без веток «итоги из Excel».
--
-- 1. Базовые представления — единственное место правил:
--    official_match      — официальный матч (без товарищеских) с сезоном и эпохой клуба (era: 1 — до 2018, 2 — с 2021/22, NEW_CLUB_FROM);
--    official_appearance — выход в официальном матче и played: «сыграл» = минуты больше нуля или роль start/sub;
--    official_goal       — гол официального матча и amkar_scorer_id: автор гола «Амкара» (без автоголов соперника).
--    Все представления статистики строятся на них.
-- 2. Голы, передачи и пропущенные — только по матчам. У всех 30 сезонов флажок goals_from_matches включён и голы сходятся
--    со счётом (28.10.2026): итоги Excel (player_season_totals) остаются архивом, но представления их больше не читают.
--    Убраны столбцы goals_source (player_season_stats) и precision (player_milestones) — рубеж голов теперь всегда в матче.
-- 3. player_season_age: minutes_dated — минуты матчей с датой, знаменатель среднего возраста (возраст есть только у них).
-- Остальные столбцы и значения — как были; сверка снимками всех представлений до и после.

drop view if exists player_career_points, player_season_points, player_career_stats, player_season_stats, season_summary,
  team_streaks, player_milestones, player_debut, coach_player_stats, goal_minutes, player_season_age, player_first_goal;

-- ===========================================================================
-- Базовые представления
-- ===========================================================================

create view official_match with (security_invoker = true) as
select
  m.id,
  m.season_id,
  m.seq,
  m.match_date,
  m.result,
  m.goals_for,
  m.goals_against,
  m.awarded,
  m.coach_id,
  m.opponent_id,
  c.kind as competition_kind,
  s.label as season_label,
  s.start_year,
  s.end_year,
  -- нынешний «Амкар» — новый клуб: серии и история через перерыв 2018–2021 не тянутся (NEW_CLUB_FROM в src/format.ts)
  case when s.start_year >= 2021 then 2 else 1 end as era
from match m
join competition c on c.id = m.competition_id
join season s on s.id = m.season_id
where c.kind <> 'friendly';

comment on view official_match is 'Официальный матч (без товарищеских) с сезоном и эпохой клуба: era 2 — нынешний «Амкар», с 2021/22.';

create view official_appearance with (security_invoker = true) as
select
  ap.match_id,
  ap.player_id,
  ap.role,
  ap.minutes,
  ap.minute_on,
  ap.minute_off,
  -- «сыграл»: есть минуты или известно, что вышел в старте или на замену
  coalesce(ap.minutes > 0 or ap.role in ('start', 'sub'), false) as played,
  om.season_id,
  om.seq,
  om.match_date,
  om.result,
  om.goals_against,
  om.coach_id,
  om.competition_kind,
  om.season_label,
  om.start_year,
  om.end_year,
  om.era
from appearance ap
join official_match om on om.id = ap.match_id;

comment on view official_appearance is 'Игрок в заявке официального матча; played — вышел на поле (минуты больше нуля или роль start/sub).';

create view official_goal with (security_invoker = true) as
select
  g.id,
  g.match_id,
  g.side,
  g.minute,
  g.added_time,
  g.kind,
  g.scorer_id,
  g.assist_id,
  -- автор гола «Амкара»: автогол соперника в его ворота — не в счёт игроку
  case when g.side = 'amkar' and g.kind <> 'own_goal' then g.scorer_id end as amkar_scorer_id,
  om.season_id,
  om.seq,
  om.match_date,
  om.coach_id,
  om.competition_kind,
  om.season_label,
  om.start_year,
  om.end_year
from goal g
join official_match om on om.id = g.match_id;

comment on view official_goal is 'Гол официального матча; amkar_scorer_id — автор гола «Амкара» без автоголов соперника.';

-- ===========================================================================
-- Игрок за сезон и за карьеру
-- ===========================================================================

create view player_season_stats with (security_invoker = true) as
with apps as (
  select season_id, player_id,
         (count(*) filter (where played))::int as games,
         sum(minutes)::int as minutes,
         (count(*) filter (where played and competition_kind = 'league'))::int as games_league,
         (sum(minutes) filter (where competition_kind = 'league'))::int as minutes_league
  from official_appearance
  group by season_id, player_id
),
scored as (
  select season_id, player_id,
         (count(*) filter (where what = 'goal'))::int as goals,
         (count(*) filter (where what = 'assist'))::int as assists,
         (count(*) filter (where what = 'goal' and competition_kind = 'league'))::int as goals_league,
         (count(*) filter (where what = 'assist' and competition_kind = 'league'))::int as assists_league
  from (
    select season_id, competition_kind, amkar_scorer_id as player_id, 'goal' as what from official_goal where amkar_scorer_id is not null
    union all
    select season_id, competition_kind, assist_id, 'assist' from official_goal where assist_id is not null
  ) x
  group by season_id, player_id
),
conceded as (
  -- пропущенные: голы соперника (и автоголы в наши ворота), пока игрок был на поле; гол без минуты — на начавшего матч.
  -- Гол на минуте замены — обоим, кроме замены в перерыве: вышедший на 45-й голы 45-й минуты не пропускал
  select a.season_id, a.player_id, count(*)::int as conceded,
         (count(*) filter (where a.competition_kind = 'league'))::int as conceded_league
  from official_appearance a
  join goal gl on gl.match_id = a.match_id and gl.side = 'opponent'
  where a.played
    and case
          when gl.minute is null then a.role is distinct from 'sub'
          else coalesce(a.minute_on, 0) <= gl.minute and (a.minute_off is null or gl.minute <= a.minute_off)
               and not (a.minute_on is not distinct from 45 and gl.minute = 45)
        end
  group by a.season_id, a.player_id
)
select
  sm.season_id,
  sm.player_id,
  s.label as season_label,
  s.start_year,
  s.end_year,
  s.division,
  p.display_name,
  p.academy,
  sm.shirt_number,
  sm.position,
  sm.squad_group,
  sm.on_loan,
  sm.sort_order,
  coalesce(a.games, 0) as games,
  coalesce(a.minutes, 0) as minutes,
  coalesce(g.goals, 0) as goals,
  coalesce(g.assists, 0) as assists,
  -- пропущенные — только у вратарей (позиция в заявке сезона, иначе основная позиция игрока)
  case when coalesce(sm.position, p.position) = 'GK' then coalesce(c.conceded, 0) end as goals_conceded,
  coalesce(a.games_league, 0) as games_league,
  coalesce(a.minutes_league, 0) as minutes_league,
  coalesce(g.goals_league, 0) as goals_league,
  coalesce(g.assists_league, 0) as assists_league,
  case when coalesce(sm.position, p.position) = 'GK' then coalesce(c.conceded_league, 0) end as goals_conceded_league
from squad_member sm
join season s on s.id = sm.season_id
join player p on p.id = sm.player_id
left join apps a on a.season_id = sm.season_id and a.player_id = sm.player_id
left join scored g on g.season_id = sm.season_id and g.player_id = sm.player_id
left join conceded c on c.season_id = sm.season_id and c.player_id = sm.player_id;

comment on view player_season_stats is
  'Игрок в заявке сезона с итогами официальных матчей: игры, минуты, голы, передачи, пропущенные (вратари); всё и только чемпионат.';
comment on column player_season_stats.games is 'Выходы на поле: минуты больше нуля или роль start/sub. Запас и «в заявке, минуты неизвестны» не считаются.';
comment on column player_season_stats.goals_conceded is 'Пропущенные мячи вратаря, пока он был на поле.';

-- Карьера — сумма сезонов в заявке: так она по определению сходится с player_season_stats
create view player_career_stats with (security_invoker = true) as
select
  p.id as player_id,
  p.display_name,
  p.last_name,
  count(*)::int as seasons,
  (array_agg(ps.season_label order by ps.start_year, ps.end_year))[1] as first_season,
  (array_agg(ps.season_label order by ps.start_year desc, ps.end_year desc))[1] as last_season,
  min(ps.start_year)::int as first_year,
  max(ps.end_year)::int as last_year,
  sum(ps.games)::int as games,
  sum(ps.games_league)::int as games_league,
  sum(ps.goals)::int as goals,
  sum(ps.goals_league)::int as goals_league
from player_season_stats ps
join player p on p.id = ps.player_id
group by p.id;

comment on view player_career_stats is
  'Игрок «Амкара» за все сезоны в заявке: игры и голы во всех турнирах и только в чемпионате. Сумма player_season_stats.';

-- ===========================================================================
-- Дашборды: история, серии, рубежи
-- ===========================================================================

create view season_summary with (security_invoker = true) as
with results as (
  select season_id,
         (count(*) filter (where competition_kind = 'league' and result is not null))::int as league_played,
         (count(*) filter (where competition_kind = 'league' and result = 'W'))::int as league_wins,
         (count(*) filter (where competition_kind = 'league' and result = 'D'))::int as league_draws,
         (count(*) filter (where competition_kind = 'league' and result = 'L'))::int as league_losses,
         (count(*) filter (where competition_kind = 'league' and result is null))::int as league_unknown,
         (count(*) filter (where result is not null))::int as played,
         (count(*) filter (where result = 'W'))::int as wins,
         (count(*) filter (where result = 'D'))::int as draws,
         (count(*) filter (where result = 'L'))::int as losses
  from official_match
  group by season_id
),
minutes as (
  select a.season_id,
         coalesce(sum(a.minutes), 0)::int as minutes,
         coalesce(sum(a.minutes) filter (where p.academy), 0)::int as academy_minutes
  from official_appearance a
  join player p on p.id = a.player_id
  group by a.season_id
)
select
  s.id as season_id,
  s.label,
  s.start_year,
  s.end_year,
  s.division,
  s.tier,
  s.final_place,
  s.teams_count,
  coalesce(r.league_played, 0) as league_played,
  coalesce(r.league_wins, 0) as league_wins,
  coalesce(r.league_draws, 0) as league_draws,
  coalesce(r.league_losses, 0) as league_losses,
  coalesce(r.league_unknown, 0) as league_unknown,
  -- три очка за победу, техническую тоже
  coalesce(3 * r.league_wins + r.league_draws, 0) as league_points,
  coalesce(r.played, 0) as played,
  coalesce(r.wins, 0) as wins,
  coalesce(r.draws, 0) as draws,
  coalesce(r.losses, 0) as losses,
  coalesce(mi.minutes, 0) as minutes,
  coalesce(mi.academy_minutes, 0) as academy_minutes
from season s
left join results r on r.season_id = s.id
left join minutes mi on mi.season_id = s.id;

comment on view season_summary is
  'Сезон одной строкой для истории клуба: уровень и место, результаты в чемпионате (league_*) и во всех официальных турнирах, минуты воспитанников.';

create view team_streaks with (security_invoker = true) as
with ordered as (
  -- матчи по порядку: все официальные (scope = all) и только чемпионат (scope = league)
  select sc.scope, om.id as match_id, om.season_id, om.season_label, om.seq, om.match_date, om.result, om.era,
         row_number() over (partition by sc.scope order by om.start_year, om.end_year, om.season_id, om.seq) as n
  from official_match om
  cross join (values ('all'), ('league')) as sc(scope)
  where sc.scope = 'all' or om.competition_kind = 'league'
),
fits as (
  -- матч продолжает серию; неизвестный результат не подходит ни одной — серия рвётся
  select o.*, k.kind
  from ordered o
  cross join (values ('win'), ('unbeaten'), ('loss'), ('winless')) as k(kind)
  where case k.kind
          when 'win' then o.result = 'W'
          when 'unbeaten' then o.result in ('W', 'D')
          when 'loss' then o.result = 'L'
          else o.result in ('D', 'L')
        end
),
islands as (
  -- подряд идущие номера дают одинаковую разность: это и есть серия
  select f.*,
         f.n - row_number() over (partition by f.scope, f.kind, f.era order by f.n) as grp_history,
         f.n - row_number() over (partition by f.scope, f.kind, f.season_id order by f.n) as grp_season
  from fits f
),
streaks as (
  select 'history' as span, scope, kind, null::int as season_id, count(*)::int as length, min(n) as first_n, max(n) as last_n,
         (count(*) filter (where result = 'W'))::int as wins,
         (count(*) filter (where result = 'D'))::int as draws,
         (count(*) filter (where result = 'L'))::int as losses
  from islands
  group by scope, kind, era, grp_history
  union all
  select 'season', scope, kind, season_id, count(*)::int, min(n), max(n),
         (count(*) filter (where result = 'W'))::int,
         (count(*) filter (where result = 'D'))::int,
         (count(*) filter (where result = 'L'))::int
  from islands
  group by scope, kind, season_id, grp_season
),
ranked as (
  select st.*,
         rank() over (partition by span, scope, kind order by length desc) as rank_history,
         row_number() over (partition by span, scope, kind, season_id order by length desc, first_n) as best_in_season
  from streaks st
)
select
  r.span, r.scope, r.kind, r.season_id, r.length, r.wins, r.draws, r.losses,
  case when r.span = 'history' then r.rank_history::int end as rank,
  f.match_id as first_match_id, f.season_label as first_season_label, f.seq as first_seq, f.match_date as first_date,
  l.match_id as last_match_id, l.season_label as last_season_label, l.seq as last_seq, l.match_date as last_date
from ranked r
join ordered f on f.scope = r.scope and f.n = r.first_n
join ordered l on l.scope = r.scope and l.n = r.last_n
-- за всю историю — пять первых мест (с равными), в сезоне — одна самая длинная, при равенстве первая
where (r.span = 'history' and r.rank_history <= 5) or (r.span = 'season' and r.best_in_season = 1);

comment on view team_streaks is
  'Серии результатов: span = history — пять самых длинных за историю (рвутся на перерыве 2018–2021), season — лучшая в каждом сезоне. '
  'scope: all — все официальные матчи, league — только чемпионат. kind: win, unbeaten, loss, winless.';

create view player_milestones with (security_invoker = true) as
with apps as (
  -- выходы на поле по порядку — как в player_career_stats, только сезоны в заявке
  select a.player_id, a.match_id,
         row_number() over (partition by a.player_id order by a.start_year, a.end_year, a.season_id, a.seq) as n
  from official_appearance a
  join squad_member sm on sm.season_id = a.season_id and sm.player_id = a.player_id
  where a.played
),
goals as (
  -- голы по порядку за карьеру — тоже только сезоны в заявке
  select g.amkar_scorer_id as player_id, g.match_id,
         row_number() over (partition by g.amkar_scorer_id
                            order by g.start_year, g.end_year, g.season_id, g.seq, g.minute nulls last, g.added_time nulls first, g.id) as n
  from official_goal g
  join squad_member sm on sm.season_id = g.season_id and sm.player_id = g.amkar_scorer_id
  where g.amkar_scorer_id is not null
),
reached as (
  select player_id, 'games' as stat, n::int as milestone, match_id from apps where n % 100 = 0
  union all
  select player_id, 'goals', n::int, match_id from goals where n % 50 = 0
)
-- название соперника считается только для строк с рубежом
select r.player_id, p.display_name, r.stat, r.milestone,
       m.season_id, s.label as season_label, m.id as match_id, m.seq, m.match_date, opponent_name(m) as opponent
from reached r
join player p on p.id = r.player_id
join match m on m.id = r.match_id
join season s on s.id = m.season_id;

comment on view player_milestones is
  'Рубежи игрока за «Амкар»: stat = games — каждые 100 матчей, goals — каждые 50 голов; в каком матче.';

-- ===========================================================================
-- Дебюты, первые голы, игроки при тренере, голы по минутам, возраст
-- ===========================================================================

create view player_debut with (security_invoker = true) as
select distinct on (a.player_id)
  a.player_id,
  p.display_name,
  p.academy,
  a.match_id,
  a.match_date,
  a.season_id,
  a.season_label,
  a.start_year,
  a.coach_id,
  opponent_name(m) as opponent,
  p.birth_date
from official_appearance a
join player p on p.id = a.player_id
join match m on m.id = a.match_id
where a.played
order by a.player_id, a.start_year, a.end_year, a.match_date nulls last, a.seq;

comment on view player_debut is
  'Первый официальный матч игрока за «Амкар» (дебют), тренер и соперник того матча. Порядок — сезон, дата, номер матча в сезоне.';

create view player_first_goal with (security_invoker = true) as
select distinct on (g.amkar_scorer_id)
  g.amkar_scorer_id as player_id,
  g.match_id,
  g.match_date,
  g.season_id,
  g.season_label,
  g.start_year,
  opponent_name(m) as opponent,
  g.minute
from official_goal g
join match m on m.id = g.match_id
where g.amkar_scorer_id is not null
order by g.amkar_scorer_id, g.start_year, g.end_year, g.match_date nulls last, g.seq, g.minute nulls last;

comment on view player_first_goal is 'Первый официальный гол игрока за «Амкар» по протоколам матчей.';

create view coach_player_stats with (security_invoker = true) as
with apps as (
  select coach_id, player_id, count(*)::int as games, coalesce(sum(minutes), 0)::int as minutes
  from official_appearance
  where coach_id is not null and played
  group by coach_id, player_id
),
goals as (
  select coach_id, amkar_scorer_id as player_id, count(*)::int as goals
  from official_goal
  where coach_id is not null and amkar_scorer_id is not null
  group by coach_id, amkar_scorer_id
)
select
  coalesce(a.coach_id, g.coach_id) as coach_id,
  coalesce(a.player_id, g.player_id) as player_id,
  p.display_name,
  coalesce(a.games, 0) as games,
  coalesce(a.minutes, 0) as minutes,
  coalesce(g.goals, 0) as goals
from apps a
full join goals g on g.coach_id = a.coach_id and g.player_id = a.player_id
join player p on p.id = coalesce(a.player_id, g.player_id);

comment on view coach_player_stats is
  'Игрок при тренере: официальные матчи, минуты и голы (без автоголов). Для «Его игроки» и «Его бомбардиры».';

create view goal_minutes with (security_invoker = true) as
select side, minute, added_time is not null as added, competition_kind, count(*)::int as goals
from official_goal
where minute is not null
group by side, minute, added_time is not null, competition_kind;

comment on view goal_minutes is
  'Голы по минутам: side = amkar — забитые (и автоголы соперника), opponent — пропущенные. added — гол в добавленное время. Голы без минуты не входят.';

create view player_season_age with (security_invoker = true) as
with seasons as (
  select
    a.season_id,
    a.player_id,
    p.display_name,
    p.academy,
    p.birth_date,
    count(*)::int as games,
    coalesce(sum(a.minutes), 0)::int as minutes,
    -- для среднего возраста по минутам: сумма «минуты × возраст на день матча» и минуты матчей с датой
    round(sum(coalesce(a.minutes, 0) * (a.match_date - p.birth_date) / 365.25), 2) as age_minutes,
    coalesce(sum(a.minutes) filter (where a.match_date is not null), 0)::int as minutes_dated,
    round((min(a.match_date) - p.birth_date) / 365.25, 2) as age_first,
    round((max(a.match_date) - p.birth_date) / 365.25, 2) as age_last,
    (array_agg(a.match_id order by a.match_date desc nulls last, a.seq desc))[1] as last_match_id,
    max(a.match_date) as last_match_date
  from official_appearance a
  join player p on p.id = a.player_id
  where a.played
  group by a.season_id, a.player_id, p.display_name, p.academy, p.birth_date
)
-- соперник последнего матча — один раз на строку, а не на каждый выход на поле
select s.*, opponent_name(lm) as last_opponent
from seasons s
join match lm on lm.id = s.last_match_id;

comment on view player_season_age is
  'Игрок в сезоне: матчи, минуты и возраст — в первом и последнем матче сезона. age_minutes — сумма «минуты × возраст», '
  'minutes_dated — минуты матчей с датой: средний возраст = age_minutes / minutes_dated. Без даты рождения возраст пустой.';

-- ===========================================================================
-- Очки сезона и ценность за карьеру — как в 20261020200000 и 20261020210000, выходы — из official_appearance
-- ===========================================================================

create view player_season_points with (security_invoker = true) as
with st as (
  select * from points_settings where id = 1
),
apps as (
  select season_id, player_id,
         coalesce(sum(minutes), 0)::int as minutes,
         (count(*) filter (where role = 'start'))::int as starts,
         (count(*) filter (where minutes >= 45 and goals_against = 0))::int as clean_sheets,
         (count(*) filter (where minutes >= 45 and result = 'W'))::int as wins,
         (count(*) filter (where minutes >= 45 and result = 'D'))::int as draws
  from official_appearance
  where played
  group by season_id, player_id
),
base as (
  select sm.season_id, sm.player_id,
         coalesce(sm.position, p.position, 'MF') as position,
         coalesce(a.minutes, 0) as minutes,
         coalesce(a.starts, 0) as starts,
         coalesce(ps.goals, 0) as goals,
         coalesce(ps.assists, 0) as assists,
         coalesce(a.clean_sheets, 0) as clean_sheets,
         coalesce(a.wins, 0) as wins,
         coalesce(a.draws, 0) as draws
  from squad_member sm
  join player p on p.id = sm.player_id
  left join apps a on a.season_id = sm.season_id and a.player_id = sm.player_id
  left join player_season_stats ps on ps.season_id = sm.season_id and ps.player_id = sm.player_id
),
raw as (
  select b.*,
         (b.minutes / 90.0 * st.per_90
          + b.starts * st.per_start
          + b.goals * case b.position when 'GK' then st.goal_gk when 'DF' then st.goal_df when 'MF' then st.goal_mf else st.goal_fw end
          + b.assists * st.per_assist
          + b.clean_sheets * case b.position when 'GK' then st.clean_gk when 'DF' then st.clean_df when 'MF' then st.clean_mf else st.clean_fw end
          + b.wins * st.per_win
          + b.draws * st.per_draw)::float8 as raw_points
  from base b cross join st
),
seasons as (
  select s.id as season_id, s.label, s.start_year,
         lm.league_matches,
         (case
            when coalesce(lm.league_matches, 0) = 0 then 1
            when st.long_season_full and lm.league_matches > 30 then 30.0 / lm.league_matches
            else power(30.0 / lm.league_matches, st.short_season_power)
          end
          * case s.tier when 2 then st.tier_rate_2 when 3 then st.tier_rate_3 when 4 then st.tier_rate_4
                        when 5 then st.tier_rate_5 else st.tier_rate_1 end)::float8 as absolute_rate,
         (case when s.final_place is null or coalesce(s.teams_count, 0) < 2 then 1
               else st.place_last + (st.place_first - st.place_last) * (s.teams_count - s.final_place) / (s.teams_count - 1.0) end
          * case when s.expected_place is null or s.final_place is null or coalesce(s.teams_count, 0) < 2 then 1
                 else 1 + st.expect_range * (s.expected_place - s.final_place) / (s.teams_count - 1.0) end)::float8 as team_factor
  from season s
  cross join st
  left join (
    select season_id, count(*)::int as league_matches
    from official_match
    where competition_kind = 'league'
    group by season_id
  ) lm on lm.season_id = s.id
),
best as (
  select season_id, max(raw_points) as best from raw group by season_id
),
leader as (
  select avg(b.best * se.absolute_rate) as leader
  from best b join seasons se using (season_id)
  where b.best > 0
),
scored as (
  select r.*, se.label as season_label, se.start_year, se.league_matches, se.team_factor,
         case when l.leader > 0 then r.raw_points * se.absolute_rate / l.leader * 100 else 0 end as absolute_points,
         case when b.best > 0 then r.raw_points / b.best * 100 else 0 end as relative_points,
         st.absolute_share,
         adj.points as adjustment,
         adj.comment as adjustment_comment
  from raw r
  join seasons se using (season_id)
  join best b using (season_id)
  cross join leader l
  cross join st
  left join player_season_adjustment adj on adj.season_id = r.season_id and adj.player_id = r.player_id
),
final as (
  select s.*,
         ((s.absolute_share * s.absolute_points + (1 - s.absolute_share) * s.relative_points) * s.team_factor
          + coalesce(s.adjustment, 0))::float8 as points
  from scored s
)
select
  f.season_id,
  f.player_id,
  f.season_label,
  f.start_year,
  p.display_name,
  f.position,
  f.minutes,
  f.starts,
  f.goals,
  f.assists,
  f.clean_sheets,
  f.wins,
  f.draws,
  round(f.raw_points::numeric, 2)::float8 as raw_points,
  round(f.team_factor::numeric, 3)::float8 as team_factor,
  f.adjustment::float8 as adjustment,
  f.adjustment_comment,
  f.points,
  rank() over (partition by f.season_id order by f.points desc)::int as season_rank,
  rank() over (order by f.points desc)::int as overall_rank
from final f
join player p on p.id = f.player_id;

comment on view player_season_points is
  'Очки сезона игрока по формуле из points_settings: сырые очки, множитель команды, ручная поправка, итог, место в сезоне и среди всех сезонов.';

create view player_career_points with (security_invoker = true) as
with st as (
  select peak_seasons, peak_weight, tier_1_from, tier_2_from, tier_3_from, tier_4_from, tier_5_from from points_settings where id = 1
),
ranked as (
  select sp.*, row_number() over (partition by sp.player_id order by sp.points desc, sp.start_year) as n
  from player_season_points sp
),
agg as (
  select r.player_id,
         (count(*) filter (where r.minutes > 0))::int as seasons,
         min(r.start_year) filter (where r.minutes > 0) as first_year,
         max(r.start_year) filter (where r.minutes > 0) as last_year,
         sum(r.points) as total,
         coalesce(sum(r.points) filter (where r.n <= st.peak_seasons), 0) as peak,
         max(st.peak_weight) as peak_weight,
         (array_agg(r.season_label order by r.start_year, r.season_label) filter (where r.minutes > 0))[1] as first_season,
         (array_agg(r.season_label order by r.start_year desc, r.season_label desc) filter (where r.minutes > 0))[1] as last_season
  from ranked r cross join st
  group by r.player_id
),
valued as (
  select a.*, a.total + a.peak_weight * a.peak as value,
         round((a.total + a.peak_weight * a.peak)::numeric, 1) as shown
  from agg a
)
select
  v.player_id,
  p.display_name,
  p.position,
  v.seasons,
  v.first_year,
  v.last_year,
  round(v.total::numeric, 1)::float8 as total,
  round(v.peak::numeric, 1)::float8 as peak,
  v.shown::float8 as value,
  rank() over (order by v.value desc)::int as career_rank,
  v.first_season,
  v.last_season,
  (case when v.shown >= st.tier_1_from then 1
        when v.shown >= st.tier_2_from then 2
        when v.shown >= st.tier_3_from then 3
        when v.shown >= st.tier_4_from then 4
        when v.shown >= st.tier_5_from then 5 end)::smallint as tier
from valued v
join player p on p.id = v.player_id
cross join st;

comment on view player_career_points is
  'Ценность игрока за карьеру: сумма очков всех сезонов + лучшие сезоны (points_settings.peak_seasons) ещё раз с весом peak_weight; '
  'ярус пирамиды по порогам points_settings.tier_*_from (пусто — вне пирамиды).';

-- ===========================================================================
-- Только чтение
-- ===========================================================================

do $$
declare
  v text;
begin
  foreach v in array array[
    'official_match', 'official_appearance', 'official_goal',
    'player_season_stats', 'player_career_stats', 'season_summary', 'team_streaks', 'player_milestones',
    'player_debut', 'player_first_goal', 'coach_player_stats', 'goal_minutes', 'player_season_age',
    'player_season_points', 'player_career_points'
  ] loop
    execute format('revoke all on %I from anon, authenticated', v);
    execute format('grant select on %I to anon, authenticated', v);
  end loop;
end
$$;
