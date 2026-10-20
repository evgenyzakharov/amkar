-- Очки сезона и ценность за карьеру — для пирамиды игроков и сборной сезона по формуле.
--
-- Формула — версия 1, согласована с автором 20.10.2026 (BACKLOG.md, раздел «Пирамида и баллы за сезон»):
--   1. Сырые очки сезона по всем официальным матчам: минуты, старты, голы и передачи, «сухие» матчи и результат
--      в матчах, где игрок провёл 45+ минут; веса голов и «сухих» — по позиции.
--   2. Шкала: доля абсолютных очков (с поправкой на длину сезона и курсом уровня лиги; средний лидер сезона = 100)
--      плюс остальное — «лучший в сезоне = 100».
--   3. Множитель команды: место в лиге (у версии 1 выключено — ×1) и ожидания автора (season.expected_place).
--   4. Ручная поправка автора к сезону игрока с комментарием: «яркий момент» или «провал».
--   5. Карьера: сумма очков всех сезонов + лучшие сезоны ещё раз.
-- Все числа формулы — в единственной строке points_settings: автор правит их в админке, view пересчитываются сами.

-- ===========================================================================
-- Настройки формулы
-- ===========================================================================

create table points_settings (
  id                 smallint primary key default 1,
  -- сырые очки: за 90 минут, за старт, за гол и «сухой» матч по позиции, за передачу, за победу и ничью
  per_90             numeric(5, 2) not null default 1,
  per_start          numeric(5, 2) not null default 0.2,
  goal_gk            numeric(5, 2) not null default 5,
  goal_df            numeric(5, 2) not null default 5,
  goal_mf            numeric(5, 2) not null default 4,
  goal_fw            numeric(5, 2) not null default 3,
  per_assist         numeric(5, 2) not null default 2,
  clean_gk           numeric(5, 2) not null default 2,
  clean_df           numeric(5, 2) not null default 1,
  clean_mf           numeric(5, 2) not null default 0.5,
  clean_fw           numeric(5, 2) not null default 0,
  per_win            numeric(5, 2) not null default 1,
  per_draw           numeric(5, 2) not null default 0.33,
  -- шкала
  absolute_share     numeric(4, 3) not null default 0.7,
  tier_rate_1        numeric(4, 3) not null default 1,
  tier_rate_2        numeric(4, 3) not null default 0.8,
  tier_rate_3        numeric(4, 3) not null default 0.8,
  tier_rate_4        numeric(4, 3) not null default 0.8,
  tier_rate_5        numeric(4, 3) not null default 0.8,
  short_season_power numeric(4, 3) not null default 0.5,
  long_season_full   boolean not null default true,
  -- множитель команды
  place_last         numeric(4, 3) not null default 1,
  place_first        numeric(4, 3) not null default 1,
  expect_range       numeric(4, 3) not null default 0.25,
  -- карьера
  peak_seasons       smallint not null default 3,
  peak_weight        numeric(4, 2) not null default 1,
  updated_at         timestamptz not null default now(),
  constraint points_settings_single_row check (id = 1),
  constraint points_settings_weights check (
    least(per_90, per_start, goal_gk, goal_df, goal_mf, goal_fw, per_assist,
          clean_gk, clean_df, clean_mf, clean_fw, per_win, per_draw) >= 0
    and greatest(per_90, per_start, goal_gk, goal_df, goal_mf, goal_fw, per_assist,
                 clean_gk, clean_df, clean_mf, clean_fw, per_win, per_draw) <= 20),
  constraint points_settings_shares check (
    absolute_share between 0 and 1 and short_season_power between 0 and 1 and expect_range between 0 and 1),
  constraint points_settings_tier_rates check (
    least(tier_rate_1, tier_rate_2, tier_rate_3, tier_rate_4, tier_rate_5) > 0
    and greatest(tier_rate_1, tier_rate_2, tier_rate_3, tier_rate_4, tier_rate_5) <= 2),
  constraint points_settings_place check (place_last > 0 and place_first >= place_last and place_first <= 3),
  constraint points_settings_peak check (peak_seasons between 0 and 10 and peak_weight between 0 and 5)
);
comment on table points_settings is
  'Числа формулы очков сезона — одна строка (id = 1). Значения по умолчанию — версия 1, согласованная с автором 20.10.2026.';
comment on column points_settings.absolute_share is 'Доля абсолютных очков в шкале сезона; остальное — «лучший в сезоне = 100».';
comment on column points_settings.tier_rate_1 is 'Курс уровня лиги (season.tier) для абсолютной части: очки в слабой лиге «дешевле».';
comment on column points_settings.short_season_power is
  'Сезон короче 30 туров чемпионата тянется к 30 турам множителем (30 / туров) в этой степени: 0 — не тянуть, 1 — полностью.';
comment on column points_settings.long_season_full is 'Сезон длиннее 30 туров приводится к 30 турам полностью (30 / туров).';
comment on column points_settings.place_last is 'Множитель команды за последнее место в лиге; за первое — place_first, между ними — по месту.';
comment on column points_settings.expect_range is
  'Множитель ожиданий: ± эта доля, если команда финишировала на всю таблицу выше или ниже ожидаемого места.';
comment on column points_settings.peak_seasons is 'Ценность за карьеру: сколько лучших сезонов посчитать ещё раз (с весом peak_weight).';

insert into points_settings default values;

create trigger points_settings_updated_at before update on points_settings for each row execute function set_updated_at();

alter table points_settings enable row level security;
create policy "public read" on points_settings for select to anon, authenticated using (true);
create policy "admin update" on points_settings for update to authenticated using ((select is_admin())) with check ((select is_admin()));
grant select on points_settings to anon, authenticated;
grant update on points_settings to authenticated;

-- ===========================================================================
-- Ожидаемое место команды в сезоне
-- ===========================================================================

alter table season add column expected_place numeric(4, 1)
  constraint season_expected_place_check check (expected_place >= 1);
alter table season add constraint season_expected_place_teams
  check (expected_place is null or teams_count is null or expected_place <= teams_count);
comment on column season.expected_place is
  'На какое место команду ждали перед сезоном, по мнению автора; 2,5 — «между 2-м и 3-м». Для множителя ожиданий в очках сезона.';

-- ===========================================================================
-- Ручная поправка автора к сезону игрока
-- ===========================================================================

create table player_season_adjustment (
  season_id int not null,
  player_id int not null,
  points    numeric(3, 1) not null,
  comment   text not null,
  primary key (season_id, player_id),
  -- без каскада: убрать игрока из заявки с поправкой нельзя, комментарий автора не пропадёт молча
  foreign key (season_id, player_id) references squad_member (season_id, player_id),
  constraint player_season_adjustment_points_check check (points between -5 and 5 and points <> 0),
  constraint player_season_adjustment_comment_check check (btrim(comment) <> '')
);
comment on table player_season_adjustment is
  'Ручная поправка к очкам сезона игрока: «яркий момент» до +5 (в одиночку вытащил матч), «провал» −5 (неудачное приобретение).';

alter table player_season_adjustment enable row level security;
create policy "public read" on player_season_adjustment for select to anon, authenticated using (true);
create policy "admin insert" on player_season_adjustment for insert to authenticated with check ((select is_admin()));
create policy "admin update" on player_season_adjustment for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "admin delete" on player_season_adjustment for delete to authenticated using ((select is_admin()));
grant select on player_season_adjustment to anon, authenticated;
grant insert, update, delete on player_season_adjustment to authenticated;

-- ===========================================================================
-- Очки сезона игрока
-- ===========================================================================

create view player_season_points with (security_invoker = true) as
with st as (
  select * from points_settings where id = 1
),
-- выходы в официальных матчах; «сыграл» — как в player_season_stats
apps as (
  select m.season_id, ap.player_id,
         coalesce(sum(ap.minutes), 0)::int as minutes,
         (count(*) filter (where ap.role = 'start'))::int as starts,
         (count(*) filter (where ap.minutes >= 45 and m.goals_against = 0))::int as clean_sheets,
         (count(*) filter (where ap.minutes >= 45 and m.result = 'W'))::int as wins,
         (count(*) filter (where ap.minutes >= 45 and m.result = 'D'))::int as draws
  from appearance ap
  join match m on m.id = ap.match_id
  join competition c on c.id = m.competition_id
  where c.kind <> 'friendly'
    and (ap.minutes > 0 or ap.role in ('start', 'sub'))
  group by m.season_id, ap.player_id
),
base as (
  select sm.season_id, sm.player_id,
         coalesce(sm.position, p.position, 'MF') as position,
         coalesce(a.minutes, 0) as minutes,
         coalesce(a.starts, 0) as starts,
         -- голы и передачи — как на сайте: по матчам или из таблицы автора, по флажку сезона
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
-- сезон: туров чемпионата, курс абсолютных очков, множитель команды
seasons as (
  select s.id as season_id, s.label, s.start_year,
         lm.league_matches,
         -- поправка на длину сезона × курс уровня лиги
         (case
            when coalesce(lm.league_matches, 0) = 0 then 1
            when st.long_season_full and lm.league_matches > 30 then 30.0 / lm.league_matches
            else power(30.0 / lm.league_matches, st.short_season_power)
          end
          * case s.tier when 2 then st.tier_rate_2 when 3 then st.tier_rate_3 when 4 then st.tier_rate_4
                        when 5 then st.tier_rate_5 else st.tier_rate_1 end)::float8 as absolute_rate,
         -- место в лиге: от place_last у последнего до place_first у первого
         (case when s.final_place is null or coalesce(s.teams_count, 0) < 2 then 1
               else st.place_last + (st.place_first - st.place_last) * (s.teams_count - s.final_place) / (s.teams_count - 1.0) end
          -- ожидания: лучше ожидаемого места — больше
          * case when s.expected_place is null or s.final_place is null or coalesce(s.teams_count, 0) < 2 then 1
                 else 1 + st.expect_range * (s.expected_place - s.final_place) / (s.teams_count - 1.0) end)::float8 as team_factor
  from season s
  cross join st
  left join (
    select m.season_id, count(*)::int as league_matches
    from match m join competition c on c.id = m.competition_id
    where c.kind = 'league'
    group by m.season_id
  ) lm on lm.season_id = s.id
),
best as (
  select season_id, max(raw_points) as best from raw group by season_id
),
-- средний лидер сезона в абсолютных очках — это 100; сезоны без единого очка не в счёт
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
  -- без округления: из этих чисел складывается карьера, округляет сайт
  f.points,
  rank() over (partition by f.season_id order by f.points desc)::int as season_rank,
  rank() over (order by f.points desc)::int as overall_rank
from final f
join player p on p.id = f.player_id;

comment on view player_season_points is
  'Очки сезона игрока по формуле из points_settings: сырые очки, множитель команды, ручная поправка, итог, место в сезоне и среди всех сезонов.';

-- ===========================================================================
-- Ценность за карьеру
-- ===========================================================================

create view player_career_points with (security_invoker = true) as
with st as (
  select peak_seasons, peak_weight from points_settings where id = 1
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
         max(st.peak_weight) as peak_weight
  from ranked r cross join st
  group by r.player_id
)
select
  a.player_id,
  p.display_name,
  p.position,
  a.seasons,
  a.first_year,
  a.last_year,
  round(a.total::numeric, 1)::float8 as total,
  round(a.peak::numeric, 1)::float8 as peak,
  round((a.total + a.peak_weight * a.peak)::numeric, 1)::float8 as value,
  rank() over (order by a.total + a.peak_weight * a.peak desc)::int as career_rank
from agg a
join player p on p.id = a.player_id;

comment on view player_career_points is
  'Ценность игрока за карьеру: сумма очков всех сезонов + лучшие сезоны (points_settings.peak_seasons) ещё раз с весом peak_weight.';

-- ===========================================================================
-- Только чтение
-- ===========================================================================

do $$
declare
  v text;
begin
  foreach v in array array['player_season_points', 'player_career_points'] loop
    execute format('revoke all on %I from anon, authenticated', v);
    execute format('grant select on %I to anon, authenticated', v);
  end loop;
end
$$;
