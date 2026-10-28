// Мелкие общие компоненты страниц
import type { ReactNode } from 'react';
import { useIsAdmin } from '../auth';
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

/** Сеть или таймаут — а не ошибка в самой базе. */
const isNetworkError = (message: string) => /failed to fetch|networkerror|load failed|timed out|timeout|aborted/i.test(message);

/** Состояние загрузки страницы, пока данных нет: «Загрузка…», «не найдено» или ошибка с кнопкой «Повторить». */
export function LoadStatus({ state }: { state: Exclude<Loaded<unknown>, { status: 'ready' }> }) {
  if (state.status === 'loading') return <p className="muted">Загрузка…</p>;
  if (state.notFound) return <NotFound message={state.message} />;
  return (
    <div className="load-error" role="alert">
      <h2>Не удалось загрузить страницу</h2>
      <p>
        {isNetworkError(state.message)
          ? 'Нет связи с базой данных. Проверьте интернет и попробуйте ещё раз.'
          : 'База данных ответила ошибкой. Попробуйте ещё раз чуть позже.'}
      </p>
      {state.retry && (
        <p>
          <button type="button" className="primary" onClick={state.retry}>
            Повторить
          </button>
        </p>
      )}
      <details>
        <summary>Подробности</summary>
        <code>{state.message}</code>
      </details>
    </div>
  );
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

/** Ссылка на правку в админке — только для вошедшего админа. */
export function EditLink({ href }: { href: string }) {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return null;
  return (
    <a className="edit-link" href={href}>
      ✎ изменить
    </a>
  );
}
