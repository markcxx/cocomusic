import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildLyrics } from '../music/lrc';
import type { CatalogSource, Lyrics } from '../music/types';
import { extensionOf, isAudioFile } from './formats';
import { dataDir, jsonStore } from './store';

/**
 * Local music library. The server only ever streams files that are in this
 * index (addressed by an opaque id), never an arbitrary path from a request.
 * Files enter the index by scanning a folder the user picked, by being opened
 * with the app, or by being downloaded.
 */

export interface LocalTrack {
  id: string;
  path: string;
  title: string;
  artist: string;
  album?: string;
  /** Seconds. */
  duration?: number;
  /** Has embedded artwork (served by /api/local/cover). */
  hasCover?: boolean;
  /** Bytes. */
  size: number;
  /** File mtime (ms), used to skip unchanged files on rescan. */
  mtime: number;
  addedAt: number;
  /** Which folder brought it in; undefined for single opened/downloaded files. */
  folder?: string;
  /** Original platform id for downloaded files (links lyrics/likes back). */
  remoteId?: string;
  source?: CatalogSource;
  /** Downloaded preview clip: online lyrics would be out of sync, use the clip's .lrc only. */
  trial?: boolean;
}

type LibraryFile = { folders: string[]; tracks: Record<string, LocalTrack> };
const store = jsonStore<LibraryFile>('library.json', () => ({ folders: [], tracks: {} }), data => {
  // Earlier versions omitted the source/trial fields. Download history can recover them.
  try {
    const history = JSON.parse(readFileSync(path.join(dataDir(), 'downloads.json'), 'utf8')) as {
      jobs?: Array<{ localId?: string; path?: string; source?: CatalogSource; trial?: unknown }>;
    };
    for (const job of history.jobs ?? []) {
      const track = job.localId ? data.tracks[job.localId] : undefined;
      if (track && track.path === job.path && !track.source && ['netease', 'qq', 'kugou'].includes(job.source ?? '')) {
        track.source = job.source;
        track.trial = Boolean(job.trial);
      }
    }
  } catch { /* Missing history must not block local playback. */ }
  return data;
});

/** Stable id from the absolute path (same file → same id across rescans). */
export const trackId = (file: string) => createHash('sha1').update(path.resolve(file)).digest('hex').slice(0, 20);

const MAX_FILES = 20_000;
const MAX_DEPTH = 8;

/** Title/artist from "Artist - Title.ext" when tags are missing. */
function fromFileName(file: string) {
  const base = path.basename(file, path.extname(file));
  const match = base.match(/^(.+?)\s+-\s+(.+)$/);
  return match ? { artist: match[1].trim(), title: match[2].trim() } : { title: base, artist: '' };
}

async function readTags(file: string) {
  try {
    const { parseFile } = await import('music-metadata');
    const meta = await parseFile(file, { duration: true, skipCovers: false });
    const { common, format } = meta;
    return {
      title: common.title?.trim(),
      artist: (common.artists?.join(' / ') || common.artist || '').trim(),
      album: common.album?.trim() || undefined,
      duration: format.duration ? Math.round(format.duration) : undefined,
      hasCover: Boolean(common.picture?.length),
    };
  } catch {
    // Unreadable tags still leave a playable entry named after the file.
    return {};
  }
}

async function describe(file: string, extra: Partial<LocalTrack> = {}): Promise<LocalTrack> {
  const info = await stat(file);
  const tags = await readTags(file);
  const fallback = fromFileName(file);
  return {
    id: trackId(file),
    path: path.resolve(file),
    title: tags.title || fallback.title,
    artist: tags.artist || fallback.artist || '未知歌手',
    album: tags.album,
    duration: tags.duration,
    hasCover: tags.hasCover,
    size: info.size,
    mtime: info.mtimeMs,
    addedAt: Date.now(),
    ...extra,
  };
}

/** Audio files under `root`, breadth-first, skipping hidden folders and symlink loops. */
async function walk(root: string) {
  const found: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length && found.length < MAX_FILES) {
    const { dir, depth } = queue.shift()!;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < MAX_DEPTH) queue.push({ dir: full, depth: depth + 1 });
      else if (entry.isFile() && isAudioFile(entry.name)) found.push(full);
    }
  }
  return found;
}

export type ScanResult = { folder: string; added: number; updated: number; removed: number; total: number };

/** Index a folder (or refresh it). Unchanged files keep their entry; vanished files are dropped. */
export async function scanFolder(folder: string): Promise<ScanResult> {
  const root = path.resolve(folder);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('文件夹不存在或无法访问');
  return store.transaction(async data => {
    const files = await walk(root);
    const tracks = { ...data.tracks };
    const seen = new Set<string>();
    let added = 0;
    let updated = 0;
    // Small batches keep many large FLACs from opening hundreds of files at once.
    for (let index = 0; index < files.length; index += 8) {
      await Promise.all(files.slice(index, index + 8).map(async file => {
        const id = trackId(file);
        seen.add(id);
        const previous = tracks[id];
        let mtime = 0;
        try { mtime = (await stat(file)).mtimeMs; } catch { return; }
        if (previous && previous.mtime === mtime) { tracks[id] = { ...previous, folder: previous.folder ?? root }; return; }
        tracks[id] = await describe(file, { folder: root, addedAt: previous?.addedAt ?? Date.now(), remoteId: previous?.remoteId, source: previous?.source, trial: previous?.trial });
        if (previous) updated += 1; else added += 1;
      }));
    }
    let removed = 0;
    for (const [id, track] of Object.entries(tracks)) {
      if (track.folder === root && !seen.has(id)) { delete tracks[id]; removed += 1; }
    }
    const folders = data.folders.includes(root) ? data.folders : [...data.folders, root];
    return { value: { folders, tracks }, result: { folder: root, added, updated, removed, total: Object.values(tracks).filter(track => track.folder === root).length } };
  });
}

export function removeFolder(folder: string) {
  const root = path.resolve(folder);
  return store.transaction(data => {
    const tracks = Object.fromEntries(Object.entries(data.tracks).filter(([, track]) => track.folder !== root));
    return { value: { folders: data.folders.filter(item => item !== root), tracks }, result: undefined };
  });
}

/** Add single files (opened with the app, or downloaded). Returns them in input order. */
export async function addFiles(files: string[], extra: Partial<LocalTrack> = {}) {
  return store.transaction(async data => {
    const tracks = { ...data.tracks };
    const result: LocalTrack[] = [];
    for (const file of files) {
      if (!isAudioFile(file) || !existsSync(file) || !statSync(file).isFile()) continue;
      const id = trackId(file);
      const previous = tracks[id];
      const track = previous && previous.mtime === statSync(file).mtimeMs
        ? { ...previous, ...extra }
        : await describe(file, { addedAt: previous?.addedAt ?? Date.now(), folder: previous?.folder, ...extra });
      tracks[id] = track;
      result.push(track);
    }
    return { value: { ...data, tracks }, result };
  });
}

export function removeTrack(id: string) {
  return store.transaction(data => {
    const tracks = { ...data.tracks };
    delete tracks[id];
    return { value: { ...data, tracks }, result: undefined };
  });
}

export const getTrack = (id: string): LocalTrack | undefined => store.read().tracks[id];

/** Index entries whose file still exists, newest first. */
export function listLibrary() {
  const data = store.read();
  const tracks = Object.values(data.tracks)
    .filter(track => existsSync(track.path))
    .sort((a, b) => b.addedAt - a.addedAt);
  return { folders: data.folders, tracks };
}

/** Embedded artwork of an indexed file. */
export async function coverOf(id: string) {
  const track = getTrack(id);
  if (!track?.hasCover) return null;
  try {
    const { parseFile, selectCover } = await import('music-metadata');
    const meta = await parseFile(track.path, { skipCovers: false, duration: false });
    const picture = selectCover(meta.common.picture);
    return picture ? { data: picture.data, type: picture.format || 'image/jpeg' } : null;
  } catch {
    return null;
  }
}

/** Sidecar `same-name.lrc` first (downloads write one), then embedded lyrics tags. */
export async function lyricsOf(id: string): Promise<Lyrics> {
  const track = getTrack(id);
  if (!track) return { lines: [], synced: false };
  const sidecar = track.path.slice(0, track.path.length - extensionOf(track.path).length) + 'lrc';
  try {
    const text = await readFile(sidecar, 'utf8');
    const [original, translated = ''] = text.split(/\n\[by:coco-translation\]\n/);
    const lyrics = buildLyrics(original, translated);
    if (lyrics.lines.length) return lyrics;
  } catch { /* no sidecar */ }
  try {
    const { parseFile } = await import('music-metadata');
    const meta = await parseFile(track.path, { skipCovers: true, duration: false });
    const embedded = meta.common.lyrics?.map(item => (typeof item === 'string' ? item : item.text ?? item.syncText?.map(line => line.text).join('\n') ?? '')).join('\n') ?? '';
    return buildLyrics(embedded);
  } catch {
    return { lines: [], synced: false };
  }
}
