import { useEffect, useState } from 'react';
import { markUnsaved } from '../leaveGuard';

/**
 * Несохранённое не теряем: ни при закрытии вкладки, ни при уходе со страницы — ссылкой, «Назад» или «Выйти» (leaveGuard.ts).
 * scope 'nested' — вложенный редактор в строке справочника: про него спрашивают и когда строку закрывают.
 */
export function useUnsavedGuard(dirty: boolean, scope?: 'nested') {
  const [owner] = useState(() => ({}));
  useEffect(() => {
    markUnsaved(owner, dirty, scope);
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      markUnsaved(owner, false);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [owner, dirty, scope]);
}
