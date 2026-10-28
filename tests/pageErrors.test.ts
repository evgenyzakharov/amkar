import { describe, expect, it } from 'vitest';
import { isStaleChunkError } from '../src/load';

describe('ошибка показа страницы', () => {
  it('пропавший после деплоя файл страницы узнаётся в Chrome, Firefox и Safari', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/HistoryPage-abc.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('прочие ошибки — не устаревшие файлы', () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isStaleChunkError('что-то')).toBe(false);
  });
});
