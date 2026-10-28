// Широкая таблица на телефоне прокручивается вбок внутри .table-wrap. Чтобы это было видно,
// у такой обёртки — атрибут data-scroll: start / middle / end; по нему CSS рисует затухание справа и «листайте →».

function mark(wrap: HTMLElement) {
  const room = wrap.scrollWidth - wrap.clientWidth;
  if (room <= 1) {
    delete wrap.dataset.scroll;
    return;
  }
  wrap.dataset.scroll = wrap.scrollLeft <= 1 ? 'start' : wrap.scrollLeft >= room - 1 ? 'end' : 'middle';
}

/** Один раз при запуске: следить за всеми таблицами страницы — появились, изменили ширину, прокрутили. */
export function startTableScrollHints() {
  let queued = false;
  const markAll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      document.querySelectorAll<HTMLElement>('.table-wrap').forEach(mark);
    });
  };
  new MutationObserver(markAll).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', markAll);
  // scroll не всплывает, но ловится на погружении
  document.addEventListener(
    'scroll',
    (e) => {
      if (e.target instanceof HTMLElement && e.target.classList.contains('table-wrap')) mark(e.target);
    },
    { capture: true, passive: true },
  );
  markAll();
}
