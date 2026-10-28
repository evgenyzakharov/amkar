// Прокрутка между страницами: по ссылке страница открывается сверху, «Назад» и «Вперёд» возвращают туда, где её оставили.
// Позиция запоминается в момент ухода (router.ts), а восстанавливается, когда страница догрузилась до нужной высоты.

const positions = new Map<string, number>();
/** Последний переход — по ссылке внутри сайта. Первая страница визита — тоже «сверху». */
let byLink = true;

const pathOf = (hash: string) => hash.split('?')[0];

/** Идёт переход по ссылке (а не «Назад» или «Вперёд»): новая страница — сверху и с начальным состоянием. */
export const isLinkNavigation = () => byLink;

/** Ушли со страницы: запомнить, докуда она была прокручена. */
export function rememberScroll(hash: string) {
  positions.set(pathOf(hash), window.scrollY);
}

/** Один раз при запуске: прокруткой управляем сами, браузер её не восстанавливает. */
export function startScrollMemory() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // Отменённый клик (вопрос о несохранённом, leaveGuard.ts), ссылка в новой вкладке и переключатель ?scope=… — не переход
  document.addEventListener('click', (e) => {
    const href = e.target instanceof Element ? e.target.closest('a[href^="#"]')?.getAttribute('href') : null;
    if (!href || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (pathOf(href) !== pathOf(window.location.hash)) byLink = true;
  });
}

/**
 * Страница сменилась: по ссылке — наверх, иначе — на запомненное место, как только страница до него догрузится
 * (не дольше 4 секунд и пока посетитель не начал прокручивать сам). Возвращает отмену ожидания.
 */
export function restoreScroll(hash: string): () => void {
  const y = byLink ? 0 : (positions.get(pathOf(hash)) ?? 0);
  byLink = false;
  window.scrollTo(0, 0);
  if (y === 0) return () => {};
  const started = Date.now();
  const stop = () => {
    clearInterval(timer);
    for (const type of ['wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(type, stop);
  };
  const timer = setInterval(() => {
    if (document.documentElement.scrollHeight - window.innerHeight >= y) {
      window.scrollTo(0, y);
      stop();
    } else if (Date.now() - started > 4000) stop();
  }, 50);
  for (const type of ['wheel', 'touchstart', 'keydown'] as const) window.addEventListener(type, stop, { passive: true });
  return stop;
}
