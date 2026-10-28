// Несохранённые правки админки: прежде чем уйти со страницы, спрашиваем.
// Уход — ссылка, «Назад» и «Вперёд» браузера (их ловит useHash в router.ts), «Выйти»;
// закрытие вкладки ловит beforeunload в useUnsavedGuard.

const QUESTION = 'Есть несохранённые изменения. Уйти без сохранения?';

/** Редакторы с несохранённым: владелец → область ('nested' — вложенный редактор в строке справочника). */
const unsaved = new Map<object, string | undefined>();
/** Адрес, на который можно перейти без вопроса: админ уже согласился или правки только что сохранены. */
let allowed: string | null = null;

export function markUnsaved(owner: object, dirty: boolean, scope?: string) {
  if (dirty) unsaved.set(owner, scope);
  else unsaved.delete(owner);
  syncClickListener();
}

/** Несохранённого нет или админ согласился его бросить; scope — спросить только про редакторы этой области. */
export function confirmLeave(question = QUESTION, scope?: string): boolean {
  const any = scope ? [...unsaved.values()].includes(scope) : unsaved.size > 0;
  return !any || window.confirm(question);
}

/** Переход без вопроса: после сохранения или удаления, пока редактор ещё считает правки несохранёнными. */
export function goWithoutAsking(hash: string) {
  allowed = hash;
  window.location.hash = hash;
}

/** Для router.ts: адрес сменился — принять переход или вернуть прежний адрес. */
export function leaveAllowed(): boolean {
  const ok = allowed === window.location.hash;
  allowed = null;
  return ok || confirmLeave();
}

// Ссылку спрашиваем до перехода: при отказе адрес не меняется и в истории браузера не остаётся лишней записи
function onClick(e: MouseEvent) {
  const link = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
  if (!link || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const href = link.getAttribute('href');
  if (href === window.location.hash) return;
  if (confirmLeave()) allowed = href;
  else e.preventDefault();
}

let listening = false;
function syncClickListener() {
  if (listening === unsaved.size > 0) return;
  listening = unsaved.size > 0;
  if (listening) document.addEventListener('click', onClick, true);
  else document.removeEventListener('click', onClick, true);
}
