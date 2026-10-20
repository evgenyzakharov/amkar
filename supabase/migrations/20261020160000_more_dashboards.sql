-- Дашборды: голы по минутам, возраст состава, выпускники академии. Соперники считаются на сайте из матчей.
--
-- Везде — официальные матчи без товарищеских; «сыграл» — вышел в старте, на замену или есть минуты.

-- ===========================================================================
-- Голы по минутам: сколько голов забито и пропущено на каждой минуте
-- ===========================================================================

create view goal_minutes with (security_invoker = true) as
select
  gl.side,
  gl.minute,
  gl.added_time is not null as added,
  c.kind as competition_kind,
  count(*)::int as goals
from goal gl
join match m on m.id = gl.match_id
join competition c on c.id = m.competition_id
where c.kind <> 'friendly' and gl.minute is not null
group by gl.side, gl.minute, gl.added_time is not null, c.kind;

comment on view goal_minutes is
  'Голы по минутам: side = amkar — забитые (и автоголы соперника), opponent — пропущенные. added — гол в добавленное время '
  '(45+, 90+…). Голы без минуты не входят.';

-- ===========================================================================
-- Возраст игрока в сезоне
-- ===========================================================================

create view player_season_age with (security_invoker = true) as
select
  m.season_id,
  ap.player_id,
  p.display_name,
  p.academy,
  p.birth_date,
  count(*)::int as games,
  coalesce(sum(ap.minutes), 0)::int as minutes,
  -- для среднего возраста по минутам: сумма «минуты × возраст на день матча»
  round(sum(coalesce(ap.minutes, 0) * (m.match_date - p.birth_date) / 365.25), 2) as age_minutes,
  round((min(m.match_date) - p.birth_date) / 365.25, 2) as age_first,
  round((max(m.match_date) - p.birth_date) / 365.25, 2) as age_last
from appearance ap
join match m on m.id = ap.match_id
join competition c on c.id = m.competition_id
join player p on p.id = ap.player_id
where c.kind <> 'friendly'
  and (ap.minutes > 0 or ap.role in ('start', 'sub'))
group by m.season_id, ap.player_id, p.display_name, p.academy, p.birth_date;

comment on view player_season_age is
  'Игрок в сезоне: матчи, минуты и возраст в годах — в первом и последнем матче сезона. age_minutes — сумма «минуты × возраст» '
  'для среднего возраста по минутам. Без даты рождения возраст пустой.';

-- ===========================================================================
-- Первый гол игрока за «Амкар»
-- ===========================================================================

create view player_first_goal with (security_invoker = true) as
select distinct on (gl.scorer_id)
  gl.scorer_id as player_id,
  m.id as match_id,
  m.match_date,
  m.season_id,
  s.label as season_label,
  s.start_year,
  opponent_name(m) as opponent,
  gl.minute
from goal gl
join match m on m.id = gl.match_id
join competition c on c.id = m.competition_id
join season s on s.id = m.season_id
where c.kind <> 'friendly'
  and gl.side = 'amkar' and gl.kind <> 'own_goal' and gl.scorer_id is not null
order by gl.scorer_id, s.start_year, s.end_year, m.match_date nulls last, m.seq, gl.minute nulls last;

comment on view player_first_goal is 'Первый официальный гол игрока за «Амкар» по протоколам матчей (таблица goal).';

-- ===========================================================================
-- Дебют: добавляем соперника и дату рождения (для возраста дебютанта)
-- ===========================================================================

create or replace view player_debut with (security_invoker = true) as
select distinct on (ap.player_id)
  ap.player_id,
  p.display_name,
  p.academy,
  m.id as match_id,
  m.match_date,
  m.season_id,
  s.label as season_label,
  s.start_year,
  m.coach_id,
  opponent_name(m) as opponent,
  p.birth_date
from appearance ap
join match m on m.id = ap.match_id
join competition c on c.id = m.competition_id
join season s on s.id = m.season_id
join player p on p.id = ap.player_id
where c.kind <> 'friendly'
  and (ap.minutes > 0 or ap.role in ('start', 'sub'))
order by ap.player_id, s.start_year, s.end_year, m.match_date nulls last, m.seq;

-- ===========================================================================
-- Только чтение
-- ===========================================================================

do $$
declare
  v text;
begin
  foreach v in array array['goal_minutes', 'player_season_age', 'player_first_goal', 'player_debut'] loop
    execute format('revoke all on %I from anon, authenticated', v);
    execute format('grant select on %I to anon, authenticated', v);
  end loop;
end
$$;
