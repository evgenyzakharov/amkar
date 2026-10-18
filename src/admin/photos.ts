// Фото игрока: файл в публичном бакете player-photos, путь — в player.photo_path.
// Имя файла с id игрока и временем: новое фото — новый адрес, кэш браузера не покажет старое.
import { supabase } from '../db/supabase';
import { DbError, dbErrorMessage } from './dbErrors';
import type { Writer } from './writer';

export const PHOTO_BUCKET = 'player-photos';
export const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Как в настройках бакета: до 2 МБ. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export function checkPhoto(file: { type: string; size: number }): string | null {
  if (!PHOTO_TYPES[file.type]) return 'Фото — в формате JPEG, PNG или WebP.';
  if (file.size > PHOTO_MAX_BYTES) return `Фото больше 2 МБ (${(file.size / 1024 / 1024).toFixed(1)} МБ) — уменьшите его.`;
  return null;
}

export const photoPath = (playerId: number, type: string, now = Date.now()) => `${playerId}-${now}.${PHOTO_TYPES[type]}`;

/** Хранилище фото: в приложении — Supabase Storage, в тестах — подделка. */
export interface PhotoStore {
  upload(path: string, file: Blob, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  publicUrl(path: string): string;
}

function bucket() {
  if (!supabase) throw new DbError({ code: 'app', message: 'Supabase не настроен: заполните .env' });
  return supabase.storage.from(PHOTO_BUCKET);
}

export const supabasePhotoStore: PhotoStore = {
  async upload(path, file, contentType) {
    const { error } = await bucket().upload(path, file, { contentType, upsert: false, cacheControl: '31536000' });
    if (error) throw new DbError({ message: error.message, code: 'storage' });
  },
  async remove(path) {
    const { error } = await bucket().remove([path]);
    if (error) throw new DbError({ message: error.message, code: 'storage' });
  },
  publicUrl: (path) => bucket().getPublicUrl(path).data.publicUrl,
};

/** Ошибки хранилища по-русски; остальное — как ошибки базы. */
export function photoErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/maximum allowed size|payload too large|entity too large/i.test(message)) return 'Фото больше 2 МБ — уменьшите его.';
  if (/mime type|invalid_mime/i.test(message)) return 'Фото — в формате JPEG, PNG или WebP.';
  if (/bucket not found/i.test(message)) return 'В Supabase нет хранилища player-photos — выполните миграцию 20261018150000.';
  return dbErrorMessage(e);
}

/**
 * Новое фото: загрузить файл → записать путь игроку → удалить прежний файл.
 * Не удалось записать путь — загруженный файл убираем, чтобы не копился мусор. Возвращает новый путь.
 */
export async function replacePhoto(
  w: Writer,
  store: PhotoStore,
  player: { id: number; photo_path: string | null },
  file: Blob & { type: string; size: number },
  now = Date.now(),
): Promise<string> {
  const problem = checkPhoto(file);
  if (problem) throw new DbError({ code: 'app', message: problem });
  const path = photoPath(player.id, file.type, now);
  await store.upload(path, file, file.type);
  try {
    await w.update('player', { photo_path: path }, { id: player.id });
  } catch (e) {
    await store.remove(path).catch(() => undefined);
    throw e;
  }
  // прежний файл больше не нужен; не удалился — не беда, на сайте он уже не виден
  if (player.photo_path && player.photo_path !== path) await store.remove(player.photo_path).catch(() => undefined);
  return path;
}

/** Убрать фото: сначала у игрока, потом файл. */
export async function removePhoto(w: Writer, store: PhotoStore, player: { id: number; photo_path: string | null }): Promise<void> {
  if (!player.photo_path) return;
  await w.update('player', { photo_path: null }, { id: player.id });
  await store.remove(player.photo_path).catch(() => undefined);
}
