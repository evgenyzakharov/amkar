// Вход в админку: почта и пароль через Supabase Auth. Сессию supabase-js хранит в localStorage сам.
import { createContext, useContext } from 'react';
import { supabase } from './db/supabase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'signed-in';
      email: string;
      /** checking — ждём ответа is_admin(); error — проверка не удалась, текст в adminError. */
      role: 'checking' | 'admin' | 'not-admin' | 'error';
      adminError?: string;
    };

export const AuthContext = createContext<AuthState>({ status: 'loading' });

export const useAuth = () => useContext(AuthContext);

/** Вошёл админ: показывать ссылки на правку. */
export function useIsAdmin() {
  const auth = useAuth();
  return auth.status === 'signed-in' && auth.role === 'admin';
}

// Коды ошибок Supabase Auth, которые встречаются при входе по паролю
const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'Неверная почта или пароль.',
  email_not_confirmed: 'Почта не подтверждена.',
  user_banned: 'Аккаунт заблокирован.',
  over_request_rate_limit: 'Слишком много попыток входа. Подождите несколько минут.',
  validation_failed: 'Введите почту и пароль.',
};

export function authErrorMessage(error: { code?: string; message: string; name?: string }): string {
  if (error.code && AUTH_ERRORS[error.code]) return AUTH_ERRORS[error.code];
  if (error.name === 'AuthRetryableFetchError' || /fetch/i.test(error.message)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
  }
  return `Не удалось войти: ${error.message}`;
}

/** Вход по почте и паролю. Возвращает текст ошибки или null. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase не настроен: заполните .env';
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? authErrorMessage(error) : null;
}

export async function signOut(): Promise<void> {
  // scope local: выйти на этом устройстве, даже если сервер недоступен
  await supabase?.auth.signOut({ scope: 'local' });
}
