-- Пропущенные вратаря на минуте замены: правка 20261028120000_review_fixes.sql оказалась неверной.
--
-- Там гол на минуте замены отдавался только ушедшему. Но в единственном таком случае в базе («Волга НН» 13.05.2012)
-- вратаря Нарубина удалили на 11-й, а Герус вышел на 13-й вместо полевого и пропустил гол на 13-й — гол остался
-- ни за кем (за 2011/12 у вратарей 53 пропущенных при 54 голах соперника). Возвращаем прежнее правило — гол на минуте
-- замены засчитан обоим, кто был на поле, — с одним исключением: вратарь, вышедший в перерыве (на 45-й), не пропускал
-- голы 45-й минуты, в том числе в добавленное время первого тайма.

create or replace view player_season_stats with (security_invoker = true) as
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
  case when s.goals_from_matches then coalesce(g.goals, 0) else t.goals end as goals,
  case when s.goals_from_matches then coalesce(g.assists, 0) else t.assists end as assists,
  -- пропущенные — только у вратарей (позиция в заявке сезона, иначе основная позиция игрока)
  case
    when not s.goals_from_matches then t.goals_conceded
    when coalesce(sm.position, p.position) = 'GK' then coalesce(c.conceded, 0)
  end as goals_conceded,
  case when s.goals_from_matches then 'matches' else 'excel' end as goals_source,
  -- то же только по чемпионату
  coalesce(a.games_league, 0) as games_league,
  coalesce(a.minutes_league, 0) as minutes_league,
  case when s.goals_from_matches then coalesce(g.goals_league, 0) else t.goals_league end as goals_league,
  case when s.goals_from_matches then coalesce(g.assists_league, 0) else t.assists_league end as assists_league,
  case
    when not s.goals_from_matches then t.goals_conceded_league
    when coalesce(sm.position, p.position) = 'GK' then coalesce(c.conceded_league, 0)
  end as goals_conceded_league
from squad_member sm
join season s on s.id = sm.season_id
join player p on p.id = sm.player_id
left join (
  select m.season_id, ap.player_id,
         -- вышел на поле: есть минуты или известно, что был в старте или вышел на замену
         (count(*) filter (where ap.minutes > 0 or ap.role in ('start', 'sub')))::int as games,
         sum(ap.minutes)::int as minutes,
         (count(*) filter (where (ap.minutes > 0 or ap.role in ('start', 'sub')) and c.kind = 'league'))::int as games_league,
         (sum(ap.minutes) filter (where c.kind = 'league'))::int as minutes_league
  from appearance ap
  join match m on m.id = ap.match_id
  join competition c on c.id = m.competition_id
  where c.kind <> 'friendly'
  group by m.season_id, ap.player_id
) a on a.season_id = sm.season_id and a.player_id = sm.player_id
left join (
  -- sum по null даёт null: «не известно» не превращается в ноль
  select pst.season_id, pst.player_id,
         sum(pst.goals)::int as goals,
         sum(pst.assists)::int as assists,
         sum(pst.goals_conceded)::int as goals_conceded,
         (sum(pst.goals) filter (where c.kind = 'league'))::int as goals_league,
         (sum(pst.assists) filter (where c.kind = 'league'))::int as assists_league,
         (sum(pst.goals_conceded) filter (where c.kind = 'league'))::int as goals_conceded_league
  from player_season_totals pst
  join competition c on c.id = pst.competition_id
  where c.kind <> 'friendly'
  group by pst.season_id, pst.player_id
) t on t.season_id = sm.season_id and t.player_id = sm.player_id
left join (
  -- голы «Амкара» без автоголов соперника и передачи по матчам
  select m.season_id, x.player_id,
         (count(*) filter (where x.what = 'goal'))::int as goals,
         (count(*) filter (where x.what = 'assist'))::int as assists,
         (count(*) filter (where x.what = 'goal' and c.kind = 'league'))::int as goals_league,
         (count(*) filter (where x.what = 'assist' and c.kind = 'league'))::int as assists_league
  from (
    select match_id, scorer_id as player_id, 'goal' as what from goal
    where side = 'amkar' and kind <> 'own_goal' and scorer_id is not null
    union all
    select match_id, assist_id, 'assist' from goal where assist_id is not null
  ) x
  join match m on m.id = x.match_id
  join competition c on c.id = m.competition_id
  where c.kind <> 'friendly'
  group by m.season_id, x.player_id
) g on g.season_id = sm.season_id and g.player_id = sm.player_id
left join (
  -- пропущенные: голы соперника (и автоголы в наши ворота), пока игрок был на поле.
  -- Гол без минуты — на того, кто начал матч.
  select m.season_id, ap.player_id, count(*)::int as conceded,
         (count(*) filter (where c.kind = 'league'))::int as conceded_league
  from appearance ap
  join match m on m.id = ap.match_id
  join competition c on c.id = m.competition_id
  join goal gl on gl.match_id = ap.match_id and gl.side = 'opponent'
  where c.kind <> 'friendly'
    and (ap.minutes > 0 or ap.role in ('start', 'sub'))
    -- гол на минуте замены — и ушедшему, и вышедшему: кто стоял в воротах, по минутам не понять
    -- (вратаря удалили на 11-й, сменщик вышел на 13-й и пропустил с пенальти). Кроме замены в перерыве:
    -- вышедший на 45-й голы 45-й минуты (45, 45+2) не пропускал
    and case
          when gl.minute is null then ap.role is distinct from 'sub'
          else coalesce(ap.minute_on, 0) <= gl.minute and (ap.minute_off is null or gl.minute <= ap.minute_off)
               and not (ap.minute_on is not distinct from 45 and gl.minute = 45)
        end
  group by m.season_id, ap.player_id
) c on c.season_id = sm.season_id and c.player_id = sm.player_id;

revoke all on player_season_stats from anon, authenticated;
grant select on player_season_stats to anon, authenticated;
