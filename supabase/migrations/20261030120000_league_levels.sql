-- Уровни лиги по новой схеме автора (28.10.2026): 1 — Премьер-лига, 2 — Первая, 3 — Вторая и её дивизион «А»,
-- 4 — Третья и дивизион «Б» второй лиги; уровня 5 больше нет.
-- «Золото» и «Серебро» дивизиона «А» — отдельным полем сезона: на графике «Уровень лиги» «Золото» — места 1–10,
-- «Серебро» — 11–20; переход из «Серебра» в «Золото» — «Повышение в классе».
-- Как записывать два этапа одного сезона (осенью «Серебро», весной «Золото»), пока не решено — BACKLOG.md;
-- группа у сезона одна: та, в которой сезон закончили.

alter table season add column league_group text check (league_group in ('gold', 'silver'));

comment on column season.league_group is
  'Группа дивизиона «А» второй лиги, где закончили сезон: gold — «Золото» (места 1–10), silver — «Серебро» (11–20).';

-- Сезоны «Амкара» во второй лиге «А» («Серебро») и «Б» — по новой схеме. На пустой базе тестов строк нет.
update season set tier = 3, league_group = 'silver' where label in ('2023', '2025/26', '2026/27') and tier = 4;
update season set tier = 4 where label in ('2024', '2025') and tier = 5;

do $$
begin
  if exists (select 1 from season where tier = 5) then
    raise exception 'остались сезоны с уровнем 5: %', (select string_agg(label, ', ') from season where tier = 5);
  end if;
end
$$;

alter table season drop constraint season_tier_check;
alter table season add constraint season_tier_check check (tier between 1 and 4);

comment on column season.tier is
  'Уровень лиги по схеме автора: 1 — Премьер-лига, 2 — Первая, 3 — Вторая и её дивизион «А», 4 — Третья и дивизион «Б».';
comment on column points_settings.tier_rate_5 is 'Не используется: уровня 5 больше нет (миграция 20261030120000).';

-- season_summary — та же, что в 20261029120000_base_views.sql, плюс league_group в конце (права на view сохраняются)
create or replace view season_summary with (security_invoker = true) as
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
  coalesce(mi.academy_minutes, 0) as academy_minutes,
  s.league_group
from season s
left join results r on r.season_id = s.id
left join minutes mi on mi.season_id = s.id;
