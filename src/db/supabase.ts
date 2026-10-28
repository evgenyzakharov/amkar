import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Сколько ждать ответа базы: подвисшая сеть — ошибка с кнопкой «Повторить», а не «Загрузка…» навсегда. */
const TIMEOUT_MS = 15_000;

// Предел — только у запросов к таблицам: загрузка фото в хранилище на медленной сети может идти дольше
const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  // старые браузеры без AbortSignal.timeout / any — без предела, как раньше
  if (!url.includes('/rest/v1/') || typeof AbortSignal.timeout !== 'function') return fetch(input, init);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  if (!init?.signal) return fetch(input, { ...init, signal: timeout });
  if (typeof AbortSignal.any !== 'function') return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.any([init.signal, timeout]) });
};

// Без ключей клиент не создаём: createClient падает на пустом URL, а сайт должен хотя бы открыться
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchWithTimeout } }) : null;

if (!supabase) {
  console.warn(
    'Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
  );
}
