-- Схема сборной сезона и новые места на поле.
--
-- Схема (4-4-2, 4-1-2-1-2, 5-3-2…) хранится у сезона, а линии каждой схемы — в коде сайта (src/format.ts):
-- новая схема — правка кода без миграции. Пустая схема — 13 мест как в Excel, так у всех импортированных сезонов.
-- Новые места: фланговые защитники (ЛФЗ, ПФЗ), опорные (ОП ×2), атакующий полузащитник (ЦАП), вингеры (ЛВ, ПВ).

alter table season add column best_xi_formation text
  constraint season_best_xi_formation_check check (best_xi_formation ~ '^[1-5](-[1-5]){2,4}$');
comment on column season.best_xi_formation is
  'Схема сборной сезона: «4-4-2», «4-1-2-1-2»… Пусто — 13 мест как в Excel.';

alter table season_best_xi drop constraint season_best_xi_slot_check;
alter table season_best_xi add constraint season_best_xi_slot_check check (slot in (
  'GK',
  'LB', 'CB1', 'CB2', 'CB3', 'RB', 'LWB', 'RWB',
  'DM1', 'DM2', 'LM', 'CM1', 'CM2', 'CM3', 'RM', 'AM',
  'LW', 'RW', 'ST1', 'ST2'
));
comment on table season_best_xi is
  'Сборная сезона по местам схемы season.best_xi_formation. Места из Excel: ВР, ПЗ, ЦЗ1–3, ЛЗ, ЦП1–3 (ЦП3 — он же ЦАП), ПП, ЛП, Ф1–2 (Ф2 — он же ЦАП). Новые: ЛФЗ, ПФЗ, ОП1–2, ЦАП, ЛВ, ПВ.';
