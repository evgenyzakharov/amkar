-- Голы и передачи за сезон — по карточкам матчей, когда автор внёс все голы сезона.
--
-- У сезона переключатель goals_from_matches. Выключен (по умолчанию) — итоги, как раньше, из таблицы автора
-- (player_season_totals). Включён — голы и передачи считаются по таблице goal, пропущенные вратаря — по голам
-- соперника, забитым, пока он был на поле. Товарищеские матчи не считаются нигде.

alter table season add column goals_from_matches boolean not null default false;
comment on column season.goals_from_matches is
  'Голы, передачи и пропущенные за сезон считать по матчам (goal), а не по итогам из таблицы автора (player_season_totals).';

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
  case when s.goals_from_matches then 'matches' else 'excel' end as goals_source
from squad_member sm
join season s on s.id = sm.season_id
join player p on p.id = sm.player_id
left join (
  select m.season_id, ap.player_id,
         -- вышел на поле: есть минуты или известно, что был в старте или вышел на замену
         (count(*) filter (where ap.minutes > 0 or ap.role in ('start', 'sub')))::int as games,
         sum(ap.minutes)::int as minutes
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
         sum(pst.goals_conceded)::int as goals_conceded
  from player_season_totals pst
  join competition c on c.id = pst.competition_id
  where c.kind <> 'friendly'
  group by pst.season_id, pst.player_id
) t on t.season_id = sm.season_id and t.player_id = sm.player_id
left join (
  -- голы «Амкара» без автоголов соперника и передачи по матчам
  select m.season_id, x.player_id,
         (count(*) filter (where x.what = 'goal'))::int as goals,
         (count(*) filter (where x.what = 'assist'))::int as assists
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
  select m.season_id, ap.player_id, count(*)::int as conceded
  from appearance ap
  join match m on m.id = ap.match_id
  join competition c on c.id = m.competition_id
  join goal gl on gl.match_id = ap.match_id and gl.side = 'opponent'
  where c.kind <> 'friendly'
    and (ap.minutes > 0 or ap.role in ('start', 'sub'))
    and case
          when gl.minute is null then ap.role is distinct from 'sub'
          else coalesce(ap.minute_on, 0) <= gl.minute and (ap.minute_off is null or gl.minute <= ap.minute_off)
        end
  group by m.season_id, ap.player_id
) c on c.season_id = sm.season_id and c.player_id = sm.player_id;

comment on view player_season_stats is
  'Игрок в заявке сезона с итогами: игры и минуты из appearance; голы, передачи и пропущенные — из player_season_totals '
  'или, если у сезона goals_from_matches, по матчам. Без товарищеских матчей.';
comment on column player_season_stats.goals is 'Голы за сезон; пусто — данных нет (только для итогов из таблицы автора).';
comment on column player_season_stats.goals_conceded is 'Пропущенные мячи вратаря.';
comment on column player_season_stats.goals_source is 'Откуда голы и передачи: matches — по матчам, excel — итоги из таблицы автора.';

-- Только чтение, как и было
revoke all on player_season_stats from anon, authenticated;
grant select on player_season_stats to anon, authenticated;
