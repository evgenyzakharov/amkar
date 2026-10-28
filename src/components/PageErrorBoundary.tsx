// Ошибка при показе страницы: вместо белого экрана — сообщение, шапка сайта остаётся
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isStaleChunkError } from '../load';

const RELOADED_AT = 'stale-chunk-reload-at';

/** Перезагрузить страницу один раз: если и после этого файла нет, дело не в обновлении сайта — не зацикливаемся. */
function reloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT));
    if (last && Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

interface Props {
  /** Адрес страницы: ушли на другую — ошибка прежней больше не показывается. */
  resetKey: string;
  children: ReactNode;
}

export class PageErrorBoundary extends Component<Props, { failed: boolean; stale: boolean }> {
  state = { failed: false, stale: false };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, stale: isStaleChunkError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isStaleChunkError(error)) reloadOnce();
    else console.error(error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false, stale: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div>
        <h2>Не удалось открыть страницу</h2>
        <p>
          {this.state.stale
            ? 'Сайт обновился, пока страница была открыта.'
            : 'При показе этой страницы что-то пошло не так.'}{' '}
          Обновите страницу.
        </p>
        <p>
          <button type="button" onClick={() => window.location.reload()}>
            Обновить
          </button>
        </p>
      </div>
    );
  }
}
