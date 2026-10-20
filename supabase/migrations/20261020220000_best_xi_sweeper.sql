-- Сборная сезона: место либеро — последний защитник за линией центральных (SW), для схемы 1-3-4-2.
-- Схема и её линии — в FORMATIONS (src/format.ts); здесь только новое место в списке, который принимает база.

alter table season_best_xi drop constraint season_best_xi_slot_check;
alter table season_best_xi add constraint season_best_xi_slot_check check (slot in (
  'GK', 'SW',
  'LB', 'CB1', 'CB2', 'CB3', 'RB', 'LWB', 'RWB',
  'DM1', 'DM2', 'LM', 'CM1', 'CM2', 'CM3', 'RM', 'AM',
  'LW', 'RW', 'ST1', 'ST2'
));
comment on table season_best_xi is
  'Сборная сезона по местам схемы season.best_xi_formation. Места из Excel: ВР, ПЗ, ЦЗ1–3, ЛЗ, ЦП1–3 (ЦП3 — он же ЦАП), ПП, ЛП, Ф1–2 (Ф2 — он же ЦАП). Новые: ЛФЗ, ПФЗ, ОП1–2, ЦАП, ЛВ, ПВ, либеро (SW).';
