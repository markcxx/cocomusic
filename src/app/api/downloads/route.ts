import path from 'node:path';
import type { NextRequest } from 'next/server';
import { CatalogError, readJson, respond } from '@/server/music';
import { isSource, validId } from '@/server/music/ids';
import type { CatalogTrack } from '@/server/music/types';
import { cancel, clearFinished, downloadLyrics, enqueue, listDownloads, removeJob, retry, setFolder, updateSettings } from '@/server/local/downloads';

export const dynamic = 'force-dynamic';

/** GET /api/downloads — settings and all jobs (polled by the UI while any are active). */
export function GET() {
  return respond(async () => listDownloads());
}

const JOB_ID = /^[a-f0-9]{16}$/;
const jobId = (value: unknown) => {
  if (typeof value !== 'string' || !JOB_ID.test(value)) throw new CatalogError('任务 ID 无效', 400);
  return value;
};

/** Accept only the catalog fields we store; ids are platform numeric ids. */
function toTracks(value: unknown): CatalogTrack[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000) throw new CatalogError('歌曲列表无效', 400);
  return value.map(item => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const id = String(raw.id ?? '');
    const source = isSource(raw.source) ? raw.source : 'netease';
    if (!validId(source, 'song', id) || typeof raw.title !== 'string') throw new CatalogError('歌曲信息无效', 400);
    const text = (field: unknown, max = 200) => (typeof field === 'string' ? field.slice(0, max) : undefined);
    return {
      id,
      source,
      title: raw.title.slice(0, 200),
      artist: text(raw.artist) ?? '未知歌手',
      album: text(raw.album),
      cover: text(raw.cover, 1000),
      duration: typeof raw.duration === 'number' ? raw.duration : undefined,
    } satisfies CatalogTrack;
  });
}

/**
 * POST /api/downloads
 *  { action: 'add', tracks } · { action: 'cancel' | 'retry', id } · { action: 'remove', id, deleteFile? }
 *  { action: 'clear-finished' } · { action: 'set-folder', folder } · { action: 'settings', settings: {...} }
 */
export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<Record<string, unknown>>(request, 512 * 1024);
    switch (body.action) {
      case 'add': return enqueue(toTracks(body.tracks));
      case 'lyrics': return downloadLyrics(toTracks([body.track])[0]);
      case 'cancel': cancel(jobId(body.id)); return { ok: true };
      case 'retry': retry(jobId(body.id)); return { ok: true };
      case 'remove': await removeJob(jobId(body.id), body.deleteFile === true); return { ok: true };
      case 'clear-finished': clearFinished(); return { ok: true };
      case 'settings': {
        if (!body.settings || typeof body.settings !== 'object') throw new CatalogError('设置无效', 400);
        return { settings: updateSettings(body.settings as Record<string, unknown>) };
      }
      case 'set-folder': {
        if (typeof body.folder !== 'string' || !path.isAbsolute(body.folder)) throw new CatalogError('下载目录无效', 400);
        setFolder(body.folder);
        return { ok: true };
      }
      default: throw new CatalogError('未知操作', 400);
    }
  });
}
