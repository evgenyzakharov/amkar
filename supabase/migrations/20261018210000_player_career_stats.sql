-- Итоги игрока за всё время в «Амкаре»: для страницы лидеров по играм и голам.
--
-- Правила те же, что в player_season_stats, и считаются по тем же парам «сезон — игрок из заявки»,
-- поэтому сумма по сезонам и итог за карьеру сходятся:
--   игры — выходы на поле (минуты больше нуля или роль start/sub);
--   голы — по матчам (goal), если у сезона goals_from_matches, иначе из итогов таблицы автора (player_season_totals).
-- Товарищеские матчи не считаются. «Только чемпионат» — турниры вида league; кубок, еврокубки и стыковые
-- матчи входят только во «все турниры».

create view player_career_stats with (security_invoker = true) as
with apps as (
  select m.season_id, ap.player_id,
         (count(*) filter (where ap.minutes > 0 or ap.role in ('start', 'sub')))::int as games,
         (count(*) filter (where (ap.minutes > 0 or ap.role in ('start', 'sub')) and c.kind = 'league'))::int as games_league
  from appearance ap
  join match m on m.id = ap.match_id
  join competition c on c.id = m.competition_id
  where c.kind <> 'friendly'
  group by m.season_id, ap.player_id
),
match_goals as (
  -- голы «Амкара» без автоголов соперника
  select m.season_id, gl.scorer_id as player_id,
         count(*)::int as goals,
         (count(*) filter (where c.kind = 'league'))::int as goals_league
  from goal gl
  join match m on m.id = gl.match_id
  join competition c on c.id = m.competition_id
  where c.kind <> 'friendly' and gl.side = 'amkar' and gl.kind <> 'own_goal' and gl.scorer_id is not null
  group by m.season_id, gl.scorer_id
),
excel_goals as (
  -- sum по null даёт null: «не известно» не превращается в ноль
  select pst.season_id, pst.player_id,
         sum(pst.goals)::int as goals,
         (sum(pst.goals) filter (where c.kind = 'league'))::int as goals_league
  from player_season_totals pst
  join competition c on c.id = pst.competition_id
  where c.kind <> 'friendly'
  group by pst.season_id, pst.player_id
),
per_season as (
  select sm.player_id, s.label, s.start_year, s.end_year,
         coalesce(a.games, 0) as games,
         coalesce(a.games_league, 0) as games_league,
         case when s.goals_from_matches then coalesce(mg.goals, 0) else eg.goals end as goals,
         case when s.goals_from_matches then coalesce(mg.goals_league, 0) else eg.goals_league end as goals_league
  from squad_member sm
  join season s on s.id = sm.season_id
  left join apps a on a.season_id = sm.season_id and a.player_id = sm.player_id
  left join match_goals mg on mg.season_id = sm.season_id and mg.player_id = sm.player_id
  left join excel_goals eg on eg.season_id = sm.season_id and eg.player_id = sm.player_id
)
select
  p.id as player_id,
  p.display_name,
  p.last_name,
  count(*)::int as seasons,
  (array_agg(ps.label order by ps.start_year, ps.end_year))[1] as first_season,
  (array_agg(ps.label order by ps.start_year desc, ps.end_year desc))[1] as last_season,
  min(ps.start_year)::int as first_year,
  max(ps.end_year)::int as last_year,
  sum(ps.games)::int as games,
  sum(ps.games_league)::int as games_league,
  sum(ps.goals)::int as goals,
  sum(ps.goals_league)::int as goals_league
from per_season ps
join player p on p.id = ps.player_id
group by p.id;

comment on view player_career_stats is
  'Игрок «Амкара» за все сезоны в заявке: игры и голы во всех турнирах и только в чемпионате. Без товарищеских матчей.';
comment on column player_career_stats.games is 'Выходы на поле во всех турнирах.';
comment on column player_career_stats.games_league is 'Выходы на поле в чемпионате.';
comment on column player_career_stats.goals is 'Голы во всех турнирах; пусто — данных нет ни за один сезон.';
comment on column player_career_stats.goals_league is 'Голы в чемпионате; пусто — данных нет ни за один сезон.';
comment on column player_career_stats.first_year is 'Год начала первого сезона в заявке.';
comment on column player_career_stats.last_year is 'Год окончания последнего сезона в заявке.';

-- Только чтение: при включённом «Automatically expose new tables» Supabase выдал бы ролям API все права
revoke all on player_career_stats from anon, authenticated;
grant select on player_career_stats to anon, authenticated;
