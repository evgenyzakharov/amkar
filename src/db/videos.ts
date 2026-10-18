// Видео к матчу: полный матч или обзор, ссылкой на YouTube или ВК (таблица match_video).
import { part } from '../load';
import { db, rows } from './queries';

export type VideoKind = 'full' | 'highlights';
export type VideoSite = 'youtube' | 'vk';

export interface MatchVideo {
  id: number;
  kind: VideoKind;
  url: string;
  site: VideoSite;
  title: string | null;
}

export const VIDEO_KIND_LABEL: Record<VideoKind, string> = { full: 'Полный матч', highlights: 'Обзор' };
export const VIDEO_SITE_LABEL: Record<VideoSite, string> = { youtube: 'YouTube', vk: 'ВК' };

/** Сайт по адресу — как вычисляемый столбец site в базе; другой сайт — null. */
export function videoSite(url: string): VideoSite | null {
  const u = url.trim();
  if (/^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i.test(u)) return 'youtube';
  if (/^https:\/\/([a-z0-9-]+\.)*(vk\.com|vkvideo\.ru)\//i.test(u)) return 'vk';
  return null;
}

/** Видео матча: сначала полные матчи, потом обзоры. Не загрузились (нет таблицы, нет связи) — страница без них. */
export async function loadMatchVideos(matchId: number): Promise<MatchVideo[]> {
  const result = await part(
    rows<MatchVideo[]>(db().from('match_video').select('id, kind, url, site, title').eq('match_id', matchId).order('id')),
  );
  if ('error' in result) return [];
  return result.data.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'full' ? -1 : 1) || a.id - b.id);
}
