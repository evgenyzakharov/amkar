import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type AuthState } from '../auth';
import { supabase } from '../db/supabase';

interface AdminCheck {
  userId: string;
  role: 'admin' | 'not-admin' | 'error';
  error?: string;
}

/** Следит за сессией Supabase и проверяет, есть ли у вошедшего права админа. */
export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined — сессия ещё не прочитана из localStorage
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [check, setCheck] = useState<AdminCheck>();

  useEffect(() => {
    if (!supabase) return;
    // Первым событием приходит INITIAL_SESSION — сохранённая сессия или null
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    // Запрос к базе — не внутри onAuthStateChange: так supabase-js может зависнуть
    if (!supabase || !userId) return;
    let current = true;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (!current) return;
      if (error) setCheck({ userId, role: 'error', error: error.message });
      else setCheck({ userId, role: data === true ? 'admin' : 'not-admin' });
    });
    return () => {
      current = false;
    };
  }, [userId]);

  let state: AuthState;
  if (session === undefined) state = { status: 'loading' };
  else if (session === null) state = { status: 'signed-out' };
  else {
    const known = check && check.userId === session.user.id ? check : null;
    state = {
      status: 'signed-in',
      email: session.user.email ?? '',
      role: known?.role ?? 'checking',
      adminError: known?.error,
    };
  }

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
