-- Карточки игрока и сезона: ссылки на внешние сайты, фото и основная позиция игрока.

-- ===========================================================================
-- Игрок: основная позиция и фото
-- ===========================================================================

alter table player add column position text check (position in ('GK', 'DF', 'MF', 'FW'));
comment on column player.position is 'Основная позиция для карточки игрока. Позиция в конкретном сезоне — squad_member.position.';

-- Перенос из заявок: самая частая позиция, при равенстве — из последнего сезона.
-- В заявках позиция есть не во всех сезонах, поэтому у части игроков останется пустой.
update player p set position = (
  select sm.position
  from squad_member sm
  join season s on s.id = sm.season_id
  where sm.player_id = p.id and sm.position is not null
  group by sm.position
  order by count(*) desc, max(s.start_year) desc
  limit 1
);

alter table player add column photo_path text;
alter table player add column photo_credit text;
comment on column player.photo_path is 'Путь к фото в хранилище Supabase, бакет player-photos.';
comment on column player.photo_credit is 'Автор и лицензия фото для подписи, например «Фото: И. Иванов, CC BY-SA 4.0».';

-- ===========================================================================
-- Ссылки на внешние сайты
-- ===========================================================================

create table player_link (
  player_id int not null references player on delete cascade,
  site      text not null check (site in ('transfermarkt', 'wikipedia', 'championat')),
  url       text not null check (url ~ '^https://'),
  primary key (player_id, site)
);
comment on table player_link is 'Профиль игрока на внешних сайтах. Новый сайт — новая миграция, расширяющая проверку site.';

create table season_link (
  season_id int not null references season on delete cascade,
  site      text not null check (site in ('transfermarkt', 'wikipedia', 'championat')),
  url       text not null check (url ~ '^https://'),
  primary key (season_id, site)
);
comment on table season_link is 'Страница сезона на внешних сайтах: Transfermarkt, Википедия, Чемпионат.';

do $$
declare
  t text;
begin
  foreach t in array array['player_link', 'season_link'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
    execute format('create policy "admin insert" on %I for insert to authenticated with check ((select is_admin()))', t);
    execute format('create policy "admin update" on %I for update to authenticated using ((select is_admin())) with check ((select is_admin()))', t);
    execute format('create policy "admin delete" on %I for delete to authenticated using ((select is_admin()))', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to anon, authenticated', t);
    execute format('grant insert, update, delete on %I to authenticated', t);
  end loop;
end
$$;

-- ===========================================================================
-- Хранилище фото: публичный бакет, загружает и меняет только админ
-- ===========================================================================

-- Публичный бакет: фото открываются по прямой ссылке без политик на чтение.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Список файлов и перезапись (upsert) требуют и select, поэтому он тоже только для админа
create policy "player photos: admin select" on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and (select public.is_admin()));
create policy "player photos: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and (select public.is_admin()));
create policy "player photos: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and (select public.is_admin()))
  with check (bucket_id = 'player-photos' and (select public.is_admin()));
create policy "player photos: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and (select public.is_admin()));
