-- Действующие игроки — по последнему сезону, в котором уже есть заявка.
--
-- Раньше брался просто последний сезон. Если завести следующий сезон заранее, пустым, действующих становилось ноль
-- и на сайте у всех пропадало «н. в.». Теперь пустой сезон пропускается, пока в его заявке никого нет.

create or replace view current_player with (security_invoker = true) as
with last_season as (
  select s.id from season s
  where exists (select 1 from squad_member sm where sm.season_id = s.id)
  order by s.start_year desc, s.end_year desc
  limit 1
)
select sm.player_id
from squad_member sm
join last_season ls on ls.id = sm.season_id
where not exists (
  select 1 from transfer t
  where t.player_id = sm.player_id and t.season_id = ls.id and t.direction = 'out'
);

comment on view current_player is
  'Действующие игроки: в заявке последнего сезона с заявкой и без трансфера «ушёл» в этом сезоне. На сайте — «2026 — н. в.» и подсветка.';

revoke all on current_player from anon, authenticated;
grant select on current_player to anon, authenticated;
