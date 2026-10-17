-- Пропуск матча из-за вызова в сборную и результат, присуждённый без игры.

alter table absence drop constraint absence_reason_check;
alter table absence add constraint absence_reason_check
  check (reason in ('injury', 'suspension', 'national_team'));
comment on table absence is 'Пропуск матча: травма (injury), дисквалификация (suspension) или вызов в сборную (national_team).';

alter table match add column awarded boolean not null default false;
alter table match add constraint match_awarded_has_result check (not awarded or result is not null);
comment on column match.awarded is 'Результат присуждён без игры: техническая победа или поражение. Счёт можно не заполнять.';
