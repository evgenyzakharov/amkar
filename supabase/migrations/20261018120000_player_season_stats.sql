-- Статистика игрока за сезон: для таблицы заявки на странице сезона и карьеры на странице игрока.
--
-- Строка — каждый игрок заявки сезона (squad_member), даже без единого выхода.
-- Игры и минуты считаются по appearance, голы, передачи и пропущенные берутся из
-- player_season_totals: по матчам их пока нет. Товарищеские матчи не считаются нигде.
--
-- security_invoker: view читает таблицы с правами того, кто спрашивает, и RLS таблиц действует как обычно.

create view player_season_stats with (security_invoker = true) as
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
  t.goals,
  t.assists,
  t.goals_conceded
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
) t on t.season_id = sm.season_id and t.player_id = sm.player_id;

comment on view player_season_stats is 'Игрок в заявке сезона с итогами: игры и минуты из appearance, голы и передачи из player_season_totals. Без товарищеских матчей.';
comment on column player_season_stats.games is 'Выходы на поле: минуты больше нуля или роль start/sub. Запас и «в заявке, минуты неизвестны» не считаются.';
comment on column player_season_stats.minutes is 'Сумма известных минут.';
comment on column player_season_stats.goals is 'Голы за сезон; пусто — в Excel не было данных.';
comment on column player_season_stats.goals_conceded is 'Пропущенные мячи вратаря.';

-- Только чтение: при включённом «Automatically expose new tables» Supabase выдал бы ролям API все права
revoke all on player_season_stats from anon, authenticated;
grant select on player_season_stats to anon, authenticated;
