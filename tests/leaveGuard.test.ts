import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Окно браузера без DOM: адрес, история и события hashchange — ровно то, чем пользуются router.ts и leaveGuard.ts
const handlers = new Map<string, Set<() => void>>();
const confirm = vi.fn(() => false);
const fakeWindow = {
  location: { hash: '#/admin/match/1', pathname: '/amkar/', search: '' },
  history: {
    pushState: (_state: unknown, _title: string, url: string) => {
      fakeWindow.location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    },
  },
  addEventListener: (type: string, f: () => void) => handlers.set(type, (handlers.get(type) ?? new Set()).add(f)),
  removeEventListener: (type: string, f: () => void) => handlers.get(type)?.delete(f),
  confirm,
};
/** Адрес сменился: ссылка, «Назад» или «Вперёд». */
function go(hash: string) {
  fakeWindow.location.hash = hash;
  handlers.get('hashchange')?.forEach((f) => f());
}

beforeAll(() => {
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {} });
});
afterAll(() => vi.unstubAllGlobals());

describe('уход со страницы с несохранёнными правками', async () => {
  const { shownHash, subscribeHash } = await import('../src/router');
  const { confirmLeave, goWithoutAsking, markUnsaved } = await import('../src/leaveGuard');
  const changed = vi.fn();
  const editor = {};

  it('без правок — переход без вопроса', () => {
    subscribeHash(changed);
    go('#/admin/match/2');
    expect(confirm).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(shownHash()).toBe('#/admin/match/2');
  });

  it('«Назад» с правками и отказ — адрес возвращается, страница прежняя', () => {
    markUnsaved(editor, true);
    go('#/admin/match/1');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fakeWindow.location.hash).toBe('#/admin/match/2');
    expect(shownHash()).toBe('#/admin/match/2');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('согласие — переход', () => {
    confirm.mockReturnValueOnce(true);
    go('#/admin/match/1');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(shownHash()).toBe('#/admin/match/1');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('после сохранения — переход без вопроса, хотя редактор ещё не перерисовался', () => {
    goWithoutAsking('#/admin/season/2024');
    handlers.get('hashchange')?.forEach((f) => f());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(shownHash()).toBe('#/admin/season/2024');
    // разрешение разовое: следующий уход — снова с вопросом
    go('#/players');
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(shownHash()).toBe('#/admin/season/2024');
  });

  it('вопрос про вложенный редактор — только если правки в нём', () => {
    expect(confirmLeave('?', 'nested')).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(3);
    const nested = {};
    markUnsaved(nested, true, 'nested');
    expect(confirmLeave('?', 'nested')).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(4);
    markUnsaved(nested, false);
    markUnsaved(editor, false);
    expect(confirmLeave()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(4);
  });
});
