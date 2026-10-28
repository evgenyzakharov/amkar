-- Повтор сохранения после потерянного ответа не задваивает записи.
--
-- Админка пишет карточку по частям. Если вставка дошла до базы, а ответ потерялся в сети, админка не знает id новой
-- строки, и повторное «Сохранить» вставило бы её ещё раз: у голов, трансферов, новых игроков, сроков тренеров и прежних
-- названий клубов уникальности нет. Теперь у каждой новой строки из формы — постоянный ключ client_key (вкладка + строка
-- формы): вставка идёт как upsert по нему, и повтор возвращает уже записанную строку, а не заводит вторую.
-- У старых строк ключа нет (null) — уникальности это не мешает.

do $$
declare
  t text;
begin
  foreach t in array array['match', 'goal', 'match_video', 'team', 'coach', 'player', 'transfer', 'team_name', 'coach_tenure'] loop
    execute format('alter table %I add column client_key text', t);
    execute format('alter table %I add constraint %I unique (client_key)', t, t || '_client_key_key');
    execute format('comment on column %I.client_key is %L', t,
      'Ключ строки формы админки: повтор сохранения после потерянного ответа не заводит строку второй раз.');
  end loop;
end
$$;
