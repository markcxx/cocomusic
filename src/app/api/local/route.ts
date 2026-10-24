import path from 'node:path';
import type { NextRequest } from 'next/server';
import { CatalogError, readJson, respond } from '@/server/music';
import { addFiles, listLibrary, removeFolder, removeTrack, scanFolder } from '@/server/local/library';

export const dynamic = 'force-dynamic';

/** Paths in bodies must be absolute; relative ones would resolve against the server cwd. */
function absolute(value: unknown, what: string) {
  if (typeof value !== 'string' || !value || value.length > 4096 || !path.isAbsolute(value)) throw new CatalogError(`${what}路径无效`, 400);
  return value;
}

/** GET /api/local — indexed folders and tracks. */
export function GET() {
  return respond(async () => listLibrary());
}

/**
 * POST /api/local
 *  { action: 'scan', folder }        add a folder (or rescan it)
 *  { action: 'open', files: [...] }  files opened with the app / dropped in; indexed so they can stream
 *  { action: 'remove-folder', folder }
 *  { action: 'remove', id }          drop one entry (file on disk is untouched)
 *
 * Folder/file paths only come from the desktop shell (system dialog, "open with",
 * drag & drop); the proxy already restricts callers to the app's own window.
 */
export function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson<{ action?: unknown; folder?: unknown; files?: unknown; id?: unknown }>(request, 256 * 1024);
    switch (body.action) {
      case 'scan': return scanFolder(absolute(body.folder, '文件夹'));
      case 'open': {
        if (!Array.isArray(body.files) || !body.files.length || body.files.length > 500) throw new CatalogError('文件列表无效', 400);
        return { tracks: await addFiles(body.files.map(file => absolute(file, '文件'))) };
      }
      case 'remove-folder': removeFolder(absolute(body.folder, '文件夹')); return { ok: true };
      case 'remove': {
        if (typeof body.id !== 'string' || !/^[a-f0-9]{20}$/.test(body.id)) throw new CatalogError('参数无效', 400);
        removeTrack(body.id);
        return { ok: true };
      }
      default: throw new CatalogError('未知操作', 400);
    }
  });
}
