-- «Проверка данных» в админке: случаи, которые автор отметил «Так и есть», больше не всплывают.
--
-- Строка — одна проверка и один её случай: check_key — какая проверка (lineup-and-absence…),
-- item_key — какой случай (у матча — «матч:игрок» или id матча). Видит и меняет только админ: посетителям это не нужно.

create table data_check_ok (
  check_key  text not null constraint data_check_ok_check_key_check check (btrim(check_key) <> ''),
  item_key   text not null constraint data_check_ok_item_key_check check (btrim(item_key) <> ''),
  created_at timestamptz not null default now(),
  constraint data_check_ok_pkey primary key (check_key, item_key)
);
comment on table data_check_ok is 'Проверка данных: случаи, которые автор признал верными («Так и есть»).';

alter table data_check_ok enable row level security;
create policy "admin select" on data_check_ok for select to authenticated using ((select is_admin()));
create policy "admin insert" on data_check_ok for insert to authenticated with check ((select is_admin()));
create policy "admin delete" on data_check_ok for delete to authenticated using ((select is_admin()));
revoke all on data_check_ok from anon, authenticated;
grant select, insert, delete on data_check_ok to authenticated;
