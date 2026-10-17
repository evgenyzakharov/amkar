-- Право вызывать is_admin() из политик RLS.
-- Если в проекте выключено «Automatically expose new tables», Supabase может не выдавать
-- ролям API права на новые функции — тогда любая запись падала бы на проверке админа.

revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;
