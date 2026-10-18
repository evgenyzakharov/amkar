// Мелкие общие компоненты страниц
import type { ReactNode } from 'react';
import type { Result } from '../db/types';
import { RESULT_LABEL, RESULT_TITLE } from '../format';
import type { Loaded } from '../load';

export function NotFound({ message }: { message: string }) {
  return (
    <div>
      <h2>Не найдено</h2>
      <p>{message}</p>
      <p>
        <a href="#/">К списку сезонов</a>
      </p>
    </div>
  );
}

/** Состояние загрузки страницы, пока данных нет. */
export function LoadStatus({ state }: { state: Exclude<Loaded<unknown>, { status: 'ready' }> }) {
  if (state.status === 'loading') return <p className="muted">Загрузка…</p>;
  if (state.notFound) return <NotFound message={state.message} />;
  return <p className="error">Не удалось загрузить данные: {state.message}</p>;
}

export function ResultBadge({ result }: { result: Result | null }) {
  if (!result) return <span className="result result-unknown" title="результат неизвестен">?</span>;
  return (
    <span className={`result result-${result}`} title={RESULT_TITLE[result]}>
      {RESULT_LABEL[result]}
    </span>
  );
}

export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="tag" title={title}>
      {children}
    </span>
  );
}

/** Строка навигации: ссылка наверх и соседние страницы. */
export function PageNav({ up, prev, next }: { up: ReactNode; prev?: ReactNode; next?: ReactNode }) {
  return (
    <nav className="page-nav">
      <span>{up}</span>
      <span className="page-nav-siblings">
        {prev}
        {next}
      </span>
    </nav>
  );
}
