-- Фото игрока по ссылке: сайт показывает картинку прямо с источника, без загрузки файла в хранилище.
-- Загруженное фото (photo_path) важнее ссылки. Подпись photo_credit — для обоих вариантов.

alter table player add column photo_url text check (photo_url ~ '^https://');
comment on column player.photo_url is
  'Адрес фото на внешнем сайте (только https://). Показывается, если фото не загружено в хранилище (photo_path).';
