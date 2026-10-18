import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkPhoto, photoErrorMessage, photoPath, removePhoto, replacePhoto, type PhotoStore } from '../src/admin/photos';
import type { Writer } from '../src/admin/writer';
import { migratedDb, pgliteWriter } from './db';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`insert into player (id, display_name, last_name, photo_path) values (1, 'Галлямов', 'Галлямов', '1-100.jpg')`);
}, 60_000);

/** Хранилище в памяти: какие файлы лежат. */
function memoryStore(files = new Set<string>(['1-100.jpg'])): PhotoStore & { files: Set<string> } {
  return {
    files,
    async upload(path) {
      if (files.has(path)) throw new Error('The resource already exists');
      files.add(path);
    },
    async remove(path) {
      files.delete(path);
    },
    publicUrl: (path) => `https://example.supabase.co/storage/v1/object/public/player-photos/${path}`,
  };
}

// размер подделываем: в тесте не нужен настоящий файл на несколько мегабайт
const file = (type: string, size: number) => Object.defineProperty(new Blob(['x'], { type }), 'size', { value: size }) as Blob;
const photo = async () => (await db.query<{ photo_path: string | null }>('select photo_path from player where id = 1')).rows[0].photo_path;

describe('фото игрока', () => {
  it('формат и размер — как в бакете, имя — с id игрока и временем', () => {
    expect(checkPhoto({ type: 'image/gif', size: 10 })).toBe('Фото — в формате JPEG, PNG или WebP.');
    expect(checkPhoto({ type: 'image/png', size: 3 * 1024 * 1024 })).toBe('Фото больше 2 МБ (3.0 МБ) — уменьшите его.');
    expect(checkPhoto({ type: 'image/webp', size: 1000 })).toBeNull();
    expect(photoPath(360, 'image/jpeg', 1760000000000)).toBe('360-1760000000000.jpg');
    expect(photoErrorMessage(new Error('The object exceeded the maximum allowed size'))).toBe('Фото больше 2 МБ — уменьшите его.');
  });

  it('новое фото: файл загружен, путь у игрока, прежний файл удалён', async () => {
    const store = memoryStore();
    const path = await replacePhoto(pgliteWriter(db), store, { id: 1, photo_path: '1-100.jpg' }, file('image/png', 1000), 200);
    expect(path).toBe('1-200.png');
    expect(await photo()).toBe('1-200.png');
    expect([...store.files]).toEqual(['1-200.png']);
  });

  it('путь записать не удалось — загруженный файл убран, у игрока прежнее фото', async () => {
    const store = memoryStore(new Set(['1-200.png']));
    const real = pgliteWriter(db);
    const broken: Writer = { ...real, update: () => Promise.reject(new TypeError('Failed to fetch')) };
    await expect(replacePhoto(broken, store, { id: 1, photo_path: '1-200.png' }, file('image/jpeg', 1000), 300)).rejects.toThrow(TypeError);
    expect([...store.files]).toEqual(['1-200.png']);
    expect(await photo()).toBe('1-200.png');
  });

  it('неподходящий файл до хранилища не доходит; удалить фото', async () => {
    const store = memoryStore(new Set(['1-200.png']));
    await expect(replacePhoto(pgliteWriter(db), store, { id: 1, photo_path: '1-200.png' }, file('image/gif', 10))).rejects.toThrow(
      'Фото — в формате JPEG, PNG или WebP.',
    );
    await removePhoto(pgliteWriter(db), store, { id: 1, photo_path: '1-200.png' });
    expect(await photo()).toBeNull();
    expect(store.files.size).toBe(0);
  });
});
