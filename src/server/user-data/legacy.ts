import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { DownloadJob, DownloadSettings } from '../local/downloads';
import type { LocalTrack } from '../local/library';
import { addLibraryFolder, putDownloadJob, putLibraryTrack, readDownloadSettings, writeDownloadSettings } from '../local/rows';
import { CatalogError } from '../music/errors';
import { isSource } from '../music/ids';
import { readValue, transaction, writeValue } from '../db/sql';
import { sanitizeOrigin, sanitizeTrack, sanitizeTracks } from './tracks';
import { PLAYLIST_NAME_MAX, PLAYLIST_TRACK_LIMIT, QUEUE_LIMIT, RECENT_PLAYS_LIMIT, type LegacyFileProblem } from './types';

/**
 * One-time import of data that earlier versions kept in JSON. Nothing is
 * deleted or rewritten: the old files and preference keys stay where they
 * were, so going back to an older version still finds them. Imports never
 * overwrite rows that already exist.
 */

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

type LegacyFile = { status: 'absent' } | { status: 'read'; value: Record<string, unknown> } | { status: 'unreadable' };

/**
 * A JSON file of an earlier version: absent (never written — nothing to
 * import), read (from the file, else its .bak backup), or unreadable (it
 * exists but neither copy parses).
 */
function readLegacyFile(dir: string, name: string, valid: (value: Record<string, unknown>) => boolean): LegacyFile {
  const candidates = [path.join(dir, name), path.join(dir, `${name}.bak`)];
  let unreadable = false;
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      if (isObject(value) && valid(value)) return { status: 'read', value };
      unreadable = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') unreadable = true;
    }
  }
  return { status: unreadable ? 'unreadable' : 'absent' };
}

const FILES_MARK = 'legacy:files-imported';

/**
 * library.json and downloads.json (server-side data), imported together once.
 * An unreadable file stops the import before anything is written: nothing is
 * marked done, the files stay as they are, and the next launch tries again
 * (after the user repaired, restored or removed the file). Returns those files.
 * Rows the new version wrote meanwhile are kept over the imported ones.
 */
export function importLegacyFiles(db: DatabaseSync, dir: string): LegacyFileProblem[] {
  if (readValue(db, FILES_MARK) !== undefined) return [];
  const library = readLegacyFile(dir, 'library.json', value => Array.isArray(value.folders) && isObject(value.tracks));
  const downloads = readLegacyFile(dir, 'downloads.json', value => Array.isArray(value.jobs) && (value.settings === undefined || isObject(value.settings)));
  const problems = ([['library.json', library], ['downloads.json', downloads]] as const)
    .filter(([, result]) => result.status === 'unreadable')
    .map(([file]) => ({ file, path: path.join(dir, file) }));
  if (problems.length) return problems;

  const libraryData = library.status === 'read' ? library.value : {};
  const downloadsData = downloads.status === 'read' ? downloads.value : {};
  const history = Array.isArray(downloadsData.jobs) ? downloadsData.jobs.filter(isObject) : [];
  transaction(db, () => {
    if (Array.isArray(libraryData.folders)) for (const folder of libraryData.folders) if (typeof folder === 'string') addLibraryFolder(db, folder);
    for (const value of isObject(libraryData.tracks) ? Object.values(libraryData.tracks) : []) {
      if (!isObject(value) || typeof value.id !== 'string' || typeof value.path !== 'string') continue;
      const track = { ...value, addedAt: typeof value.addedAt === 'number' ? value.addedAt : 0 } as unknown as LocalTrack;
      // Versions before 0.0.3 omitted source/trial on downloads; the download history has them.
      const job = history.find(item => item.localId === track.id && item.path === track.path);
      if (job && !track.source && isSource(job.source)) { track.source = job.source; track.trial = Boolean(job.trial); }
      putLibraryTrack(db, track, { keepExisting: true });
    }

    if (isObject(downloadsData.settings) && !readDownloadSettings(db)) writeDownloadSettings(db, downloadsData.settings as unknown as DownloadSettings);
    const jobs = history.filter((job): job is DownloadJob & Record<string, unknown> =>
      typeof job.id === 'string' && typeof job.songId === 'string' && isSource(job.source) && typeof job.status === 'string');
    // Oldest first, so jobs that share a timestamp keep their list order (newest row on top).
    for (const job of jobs.reverse()) putDownloadJob(db, { ...job, createdAt: typeof job.createdAt === 'number' ? job.createdAt : 0 }, { keepExisting: true });
    writeValue(db, FILES_MARK, Date.now());
  });
  return [];
}

/* ───────── Renderer data (preferences.json / localStorage) ───────── */

const RENDERER_MARK = 'legacy:renderer-imported';
/** kv keys of the player state (listening.ts reads and writes them). */
export const QUEUE_KEY = 'player:queue';
export const POSITION_KEY = 'player:position';

/** Raw values of the renderer's old preference keys (strings as stored, or null). */
export type RendererLegacyData = { recentPlays?: unknown; localPlaylists?: unknown; queue?: unknown; position?: unknown };

export const rendererImportPending = (db: DatabaseSync) => readValue(db, RENDERER_MARK) === undefined;

function parsePreference(raw: unknown, label: string, valid: (value: unknown) => boolean): unknown {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    try {
      const value: unknown = JSON.parse(raw);
      if (valid(value)) return value;
    } catch { /* Report the same recovery instructions for invalid JSON or shape. */ }
  }
  throw new CatalogError(`旧版${label}无法读取。请恢复旧数据后重新启动，应用会重试导入。`, 422);
}
const number = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * Hand-over of what the renderer kept in its preferences. Runs once (marked
 * in the same transaction); rows created since the new version started win.
 */
export function importRendererData(db: DatabaseSync, data: RendererLegacyData) {
  transaction(db, () => {
    if (!rendererImportPending(db)) return;
    const now = Date.now();

    const plays = parsePreference(data.recentPlays, '最近播放', Array.isArray);
    const insertPlay = db.prepare('INSERT OR IGNORE INTO recent_plays (track_id, track, played_at, count) VALUES (?, ?, ?, ?)');
    for (const item of (Array.isArray(plays) ? plays : []).slice(0, RECENT_PLAYS_LIMIT)) {
      const track = isObject(item) ? sanitizeTrack(item.track) : null;
      if (track) insertPlay.run(track.id, JSON.stringify(track), number(item.playedAt, now), Math.max(1, number(item.count, 1)));
    }

    const playlists = parsePreference(data.localPlaylists, '本地歌单', Array.isArray);
    const insertPlaylist = db.prepare('INSERT OR IGNORE INTO playlists (id, name, description, cover, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertEntry = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, track) VALUES (?, ?, ?, ?)');
    for (const item of Array.isArray(playlists) ? playlists : []) {
      if (!isObject(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim()) continue;
      const origin = sanitizeOrigin(item.origin);
      const created = Number(insertPlaylist.run(
        item.id,
        item.name.trim().slice(0, PLAYLIST_NAME_MAX),
        typeof item.description === 'string' ? item.description : null,
        typeof item.cover === 'string' ? item.cover : null,
        origin ? JSON.stringify(origin) : null,
        number(item.createdAt, now),
        number(item.updatedAt, now),
      ).changes);
      if (!created) continue;
      sanitizeTracks(item.tracks, PLAYLIST_TRACK_LIMIT).forEach((track, index) => insertEntry.run(item.id as string, track.id, index, JSON.stringify(track)));
    }

    const queue = parsePreference(data.queue, '播放队列', value => isObject(value) && Array.isArray(value.queue));
    if (isObject(queue) && readValue(db, QUEUE_KEY) === undefined) {
      writeValue(db, QUEUE_KEY, { queue: sanitizeTracks(queue.queue, QUEUE_LIMIT), currentId: typeof queue.currentId === 'string' ? queue.currentId : undefined });
    }
    const position = parsePreference(data.position, '播放进度', value => isObject(value) && typeof value.id === 'string' && typeof value.t === 'number' && Number.isFinite(value.t));
    if (isObject(position) && typeof position.id === 'string' && typeof position.t === 'number' && readValue(db, POSITION_KEY) === undefined) {
      writeValue(db, POSITION_KEY, { id: position.id, t: position.t });
    }

    writeValue(db, RENDERER_MARK, now);
  });
}
