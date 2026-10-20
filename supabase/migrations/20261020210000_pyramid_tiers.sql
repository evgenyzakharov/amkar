-- Ярусы пирамиды: пороги ценности за карьеру и ярус игрока в player_career_points.
--
-- Решение автора 20.10.2026: ярус — по ценности за карьеру, а не по числу игроков. «Пантеон» — от 1000,
-- «Легенды» — 650–1000, «Топ» — 500–650, «Основа» — 350–500, «Свои» — 250–350; ниже 250 — вне пирамиды.
-- Названия ярусов — на сайте (src/pyramid.ts), пороги — в points_settings: автор правит их в «Формуле очков».
--
-- Ещё два столбца карьеры — первый и последний сезон подписью: по году начала их не различить
-- («2025» и «2025/26» начинаются в 2025-м).

alter table points_settings
  add column tier_1_from numeric(6, 1) not null default 1000,
  add column tier_2_from numeric(6, 1) not null default 650,
  add column tier_3_from numeric(6, 1) not null default 500,
  add column tier_4_from numeric(6, 1) not null default 350,
  add column tier_5_from numeric(6, 1) not null default 250,
  add constraint points_settings_tiers check (
    tier_5_from >= 0 and tier_5_from < tier_4_from and tier_4_from < tier_3_from
    and tier_3_from < tier_2_from and tier_2_from < tier_1_from and tier_1_from <= 10000);
comment on column points_settings.tier_1_from is 'Ярусы пирамиды: с какой ценности за карьеру начинается ярус 1 («Пантеон») … 5 («Свои»); ниже tier_5_from — вне пирамиды.';

create or replace view player_career_points with (security_invoker = true) as
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
         -- «2025» раньше «2025/26»: при одном годе начала подпись короче
         (array_agg(r.season_label order by r.start_year, r.season_label) filter (where r.minutes > 0))[1] as first_season,
         (array_agg(r.season_label order by r.start_year desc, r.season_label desc) filter (where r.minutes > 0))[1] as last_season
  from ranked r cross join st
  group by r.player_id
),
valued as (
  select a.*, a.total + a.peak_weight * a.peak as value,
         -- ярус — по той же ценности, что видна на сайте: до десятых
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

revoke all on player_career_points from anon, authenticated;
grant select on player_career_points to anon, authenticated;
