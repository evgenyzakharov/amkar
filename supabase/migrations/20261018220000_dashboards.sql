-- Дашборды: история клуба по сезонам, серии результатов, рубежи игроков.
--
-- Общие правила: товарищеские матчи не считаются; матч с неизвестным результатом не даёт очков и рвёт серию;
-- нынешний «Амкар» (сезоны с 2021) — другой клуб, серии через перерыв 2018–2021 не тянутся.
-- Все view — security_invoker и только чтение для ролей API.

-- ===========================================================================
-- Сезон одной строкой: уровень, место, результаты в чемпионате и во всех турнирах, минуты воспитанников
-- ===========================================================================

create view season_summary with (security_invoker = true) as
with results as (
  select m.season_id,
         (count(*) filter (where c.kind = 'league' and m.result is not null))::int as league_played,
         (count(*) filter (where c.kind = 'league' and m.result = 'W'))::int as league_wins,
         (count(*) filter (where c.kind = 'league' and m.result = 'D'))::int as league_draws,
         (count(*) filter (where c.kind = 'league' and m.result = 'L'))::int as league_losses,
         (count(*) filter (where c.kind = 'league' and m.result is null))::int as league_unknown,
         (count(*) filter (where m.result is not null))::int as played,
         (count(*) filter (where m.result = 'W'))::int as wins,
         (count(*) filter (where m.result = 'D'))::int as draws,
         (count(*) filter (where m.result = 'L'))::int as losses
  from match m
  join competition c on c.id = m.competition_id
  where c.kind <> 'friendly'
  group by m.season_id
),
minutes as (
  select m.season_id,
         coalesce(sum(ap.minutes), 0)::int as minutes,
         coalesce(sum(ap.minutes) filter (where p.academy), 0)::int as academy_minutes
  from appearance ap
  join match m on m.id = ap.match_id
  join competition c on c.id = m.competition_id
  join player p on p.id = ap.player_id
  where c.kind <> 'friendly'
  group by m.season_id
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
comment on column season_summary.league_played is 'Матчи чемпионата с известным результатом — знаменатель очков за матч.';
comment on column season_summary.league_points is 'Очки в чемпионате по результатам: 3 за победу (и техническую), 1 за ничью.';
comment on column season_summary.academy_minutes is 'Минуты игроков с отметкой «воспитанник» (player.academy) в официальных матчах.';

-- ===========================================================================
-- Серии: победная, беспроигрышная, проигрышная, без побед
-- ===========================================================================

create view team_streaks with (security_invoker = true) as
with ordered as (
  -- матчи по порядку: все официальные (scope = all) и только чемпионат (scope = league)
  select sc.scope, m.id as match_id, m.season_id, s.label as season_label, m.seq, m.match_date, m.result,
         case when s.start_year >= 2021 then 2 else 1 end as era,
         row_number() over (partition by sc.scope order by s.start_year, s.end_year, s.id, m.seq) as n
  from match m
  join season s on s.id = m.season_id
  join competition c on c.id = m.competition_id
  cross join (values ('all'), ('league')) as sc(scope)
  where c.kind <> 'friendly' and (sc.scope = 'all' or c.kind = 'league')
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

-- ===========================================================================
-- Рубежи: 100, 200, 300… матчей и 50, 100… голов за «Амкар»
-- ===========================================================================

create view player_milestones with (security_invoker = true) as
with apps as (
  -- выходы на поле в официальных матчах по порядку, как в player_career_stats — только сезоны в заявке
  select ap.player_id, m.id as match_id,
         row_number() over (partition by ap.player_id order by s.start_year, s.end_year, s.id, m.seq) as n
  from appearance ap
  join match m on m.id = ap.match_id
  join season s on s.id = m.season_id
  join competition c on c.id = m.competition_id
  join squad_member sm on sm.season_id = m.season_id and sm.player_id = ap.player_id
  where c.kind <> 'friendly' and (ap.minutes > 0 or ap.role in ('start', 'sub'))
),
match_goals as (
  -- голы по карточкам матчей: без автоголов соперника, по порядку внутри сезона
  select gl.scorer_id as player_id, m.season_id, m.id as match_id,
         row_number() over (partition by gl.scorer_id, m.season_id
                            order by m.seq, gl.minute nulls last, gl.added_time nulls first, gl.id) as k
  from goal gl
  join match m on m.id = gl.match_id
  join competition c on c.id = m.competition_id
  where c.kind <> 'friendly' and gl.side = 'amkar' and gl.kind <> 'own_goal' and gl.scorer_id is not null
),
match_goals_season as (
  select player_id, season_id, count(*)::int as goals from match_goals group by player_id, season_id
),
excel_goals_season as (
  select pst.player_id, pst.season_id, coalesce(sum(pst.goals), 0)::int as goals
  from player_season_totals pst
  join competition c on c.id = pst.competition_id
  where c.kind <> 'friendly'
  group by pst.player_id, pst.season_id
),
season_goals as (
  -- голы за сезон по тому же правилу, что в player_season_stats
  select sm.player_id, s.id as season_id, s.start_year, s.end_year, s.goals_from_matches,
         case when s.goals_from_matches then coalesce(mg.goals, 0) else coalesce(eg.goals, 0) end as goals
  from squad_member sm
  join season s on s.id = sm.season_id
  left join match_goals_season mg on mg.player_id = sm.player_id and mg.season_id = sm.season_id
  left join excel_goals_season eg on eg.player_id = sm.player_id and eg.season_id = sm.season_id
),
goal_crossings as (
  select c.player_id, c.season_id, c.goals_from_matches, t.milestone, t.milestone - (c.total - c.goals) as k
  from (
    select sg.*, sum(sg.goals) over (partition by sg.player_id order by sg.start_year, sg.end_year, sg.season_id)::int as total
    from season_goals sg
  ) c
  join generate_series(50, 1000, 50) as t(milestone) on c.total - c.goals < t.milestone and c.total >= t.milestone
),
reached as (
  select a.player_id, 'games' as stat, a.n::int as milestone, a.match_id, null::int as season_id
  from apps a
  where a.n % 100 = 0
  union all
  -- рубеж голов: в сезоне по матчам — точный матч, в сезоне с итогом из таблицы автора — только сезон
  select x.player_id, 'goals', x.milestone, g.match_id, x.season_id
  from goal_crossings x
  left join match_goals g on x.goals_from_matches and g.player_id = x.player_id and g.season_id = x.season_id and g.k = x.k
)
-- название соперника считается только для строк с рубежом
select r.player_id, p.display_name, r.stat, r.milestone,
       case when r.match_id is null then 'season' else 'match' end as precision,
       s.id as season_id, s.label as season_label, m.id as match_id, m.seq, m.match_date,
       case when m.id is not null then opponent_name(m) end as opponent
from reached r
join player p on p.id = r.player_id
left join match m on m.id = r.match_id
join season s on s.id = coalesce(m.season_id, r.season_id);

comment on view player_milestones is
  'Рубежи игрока за «Амкар»: stat = games — каждые 100 матчей (в каком матче), goals — каждые 50 голов. '
  'precision = season, если голы того сезона известны только итогом из таблицы автора.';

-- ===========================================================================
-- Только чтение
-- ===========================================================================

do $$
declare
  v text;
begin
  foreach v in array array['season_summary', 'team_streaks', 'player_milestones'] loop
    execute format('revoke all on %I from anon, authenticated', v);
    execute format('grant select on %I to anon, authenticated', v);
  end loop;
end
$$;
