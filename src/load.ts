import { useEffect, useState } from 'react';

/** Записи нет в базе: страница показывает «не найдено», а не ошибку. */
export class NotFoundError extends Error {}

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; notFound: boolean }
  | { status: 'ready'; data: T };

/** Часть страницы, которая может не загрузиться, не роняя остальное. */
export type Part<T> = { data: T } | { error: string };

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Файла страницы уже нет: сайт обновили, пока вкладка была открыта (старые файлы с хэшами удаляются при деплое). */
export const isStaleChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed/i.test(errorMessage(e));

export async function part<T>(promise: Promise<T>): Promise<Part<T>> {
  try {
    return { data: await promise };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/**
 * Загружает данные страницы по ключу (id, метка сезона) и перезагружает, когда ключ меняется.
 * load должна быть стабильной — функция модуля, а не замыкание в компоненте.
 */
export function useLoad<K, T>(key: K, load: (key: K) => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<{ key: K; state: Loaded<T> }>();

  useEffect(() => {
    let current = true;
    load(key).then(
      (data) => {
        if (current) setResult({ key, state: { status: 'ready', data } });
      },
      (e: unknown) => {
        if (current) {
          setResult({ key, state: { status: 'error', message: errorMessage(e), notFound: e instanceof NotFoundError } });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [key, load]);

  // Пока грузится новый ключ, старые данные не показываем
  return result && result.key === key ? result.state : { status: 'loading' };
}

/** Заголовок вкладки браузера. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} — Амкар` : 'Амкар — история в цифрах';
  }, [title]);
}
