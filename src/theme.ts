// Светлая и тёмная тема: атрибут data-theme у <html>. Первый раз его ставит скрипт в index.html — по выбору
// посетителя из localStorage, иначе как в системе; пока посетитель сам не выбрал, тема следует за системой.

export type Theme = 'light' | 'dark';

const KEY = 'theme';

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function chosen(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

/** Выбор посетителя: запоминается в браузере. */
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* приватный режим — тема до перезагрузки */
  }
}

/** Пока посетитель не выбирал тему — следовать за системой. Возвращает отписку. */
export function followSystem(onChange: (theme: Theme) => void): () => void {
  if (!window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (chosen()) return;
    const theme: Theme = query.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    onChange(theme);
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Логотип клуба для шапки: его выбрал скрипт в index.html, он же иконка вкладки. */
export const logoSrc = () => document.documentElement.dataset.logo ?? null;
