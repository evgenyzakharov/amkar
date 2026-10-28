// Состояние страницы, которое переживает «Назад»: поиск, сортировка, переключатели, раскрытые блоки.
// Живёт в памяти вкладки по адресу страницы. Переход по ссылке открывает страницу заново — с начальным состоянием,
// как и прокрутку сверху (router.ts забывает состояние страницы, на которую ведёт ссылка).
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { shownHash } from './router';

const store = new Map<string, unknown>();
const pathOf = (hash: string) => hash.split('?')[0];

/** Забыть состояние страницы: на неё перешли по ссылке. */
export function forgetPageState(hash: string) {
  const prefix = `${pathOf(hash)}|`;
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}

/** Как useState, но значение помнится для этой страницы, пока открыта вкладка. key — имя состояния на странице. */
export function usePageState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const id = `${pathOf(shownHash())}|${key}`;
  const [value, setValue] = useState<T>(() => (store.has(id) ? (store.get(id) as T) : initial));
  useEffect(() => {
    store.set(id, value);
  }, [id, value]);
  return [value, setValue];
}
