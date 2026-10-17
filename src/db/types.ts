// Строки таблиц из supabase/migrations. Добавляем по мере того, как страницы начинают их читать.

export interface Season {
  id: number;
  label: string;
  start_year: number;
  end_year: number;
  division: string | null;
  tier: number | null;
  final_place: number | null;
  teams_count: number | null;
}
