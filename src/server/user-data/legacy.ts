import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { DownloadJob, DownloadSettings } from '../local/downloads';
import type { LocalTrack } from '../local/library';
import { addLibraryFolder, putDownloadJob, putLibraryTrack, readDownloadSettings, writeDownloadSettings } from '../local/rows';
import { isSource } from '../music/ids';
import { readValue, transaction, writeValue } from '../db/sql';
import { sanitizeOrigin, sanitizeTrack, sanitizeTracks } from './tracks';
import { PLAYLIST_NAME_MAX, PLAYLIST_TRACK_LIMIT, QUEUE_LIMIT, RECENT_PLAYS_LIMIT } from './types';

/**
 * One-time import of data that earlier versions kept in JSON. Nothing is
 * deleted or rewritten: the old files and preference keys stay where they
 * were, so going back to an older version still finds them. Imports never
 * overwrite rows that already exist.
 */

/** A JSON file of an earlier version, or its last good backup. */
function readLegacyFile<T>(dir: string, name: string): T | undefined {
  for (const candidate of [path.join(dir, name), path.join(dir, `${name}.bak`)]) {
    try { return JSON.parse(readFileSync(candidate, 'utf8')) as T; } catch { /* try the backup */ }
  }
  return undefined;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** library.json and downloads.json (server-side data); runs inside migration 1. */
export function importLegacyFiles(db: DatabaseSync, dir: string) {
  const downloads = readLegacyFile<{ settings?: unknown; jobs?: unknown }>(dir, 'downloads.json');
  const jobs = (Array.isArray(downloads?.jobs) ? downloads.jobs : []).filter((job): job is DownloadJob =>
    isObject(job) && typeof job.id === 'string' && typeof job.songId === 'string' && isSource(job.source) && typeof job.status === 'string');

  const library = readLegacyFile<{ folders?: unknown; tracks?: unknown }>(dir, 'library.json');
  if (Array.isArray(library?.folders)) for (const folder of library.folders) if (typeof folder === 'string') addLibraryFolder(db, folder);
  const history = Array.isArray(downloads?.jobs) ? (downloads.jobs as Array<Partial<DownloadJob>>) : [];
  for (const value of isObject(library?.tracks) ? Object.values(library.tracks) : []) {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.path !== 'string') continue;
    const track = { ...value, addedAt: typeof value.addedAt === 'number' ? value.addedAt : 0 } as unknown as LocalTrack;
    // Versions before 0.0.3 omitted source/trial on downloads; the download history has them.
    const job = history.find(item => isObject(item) && item.localId === track.id && item.path === track.path);
    if (job && !track.source && isSource(job.source)) { track.source = job.source; track.trial = Boolean(job.trial); }
    putLibraryTrack(db, track);
  }

  if (isObject(downloads?.settings) && !readDownloadSettings(db)) writeDownloadSettings(db, downloads.settings as unknown as DownloadSettings);
  // Oldest first, so jobs that share a timestamp keep their list order (newest row on top).
  for (const job of [...jobs].reverse()) putDownloadJob(db, { ...job, createdAt: typeof job.createdAt === 'number' ? job.createdAt : 0 });
}

/* ───────── Renderer data (preferences.json / localStorage) ───────── */

const RENDERER_MARK = 'legacy:renderer-imported';
/** kv keys of the player state (listening.ts reads and writes them). */
export const QUEUE_KEY = 'player:queue';
export const POSITION_KEY = 'player:position';

/** Raw values of the renderer's old preference keys (strings as stored, or null). */
export type RendererLegacyData = { recentPlays?: unknown; localPlaylists?: unknown; queue?: unknown; position?: unknown };

export const rendererImportPending = (db: DatabaseSync) => readValue(db, RENDERER_MARK) === undefined;

const parse = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
};
const number = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * Hand-over of what the renderer kept in its preferences. Runs once (marked
 * in the same transaction); rows created since the new version started win.
 */
export function importRendererData(db: DatabaseSync, data: RendererLegacyData) {
  transaction(db, () => {
    if (!rendererImportPending(db)) return;
    const now = Date.now();

    const plays = parse(data.recentPlays);
    const insertPlay = db.prepare('INSERT OR IGNORE INTO recent_plays (track_id, track, played_at, count) VALUES (?, ?, ?, ?)');
    for (const item of (Array.isArray(plays) ? plays : []).slice(0, RECENT_PLAYS_LIMIT)) {
      const track = isObject(item) ? sanitizeTrack(item.track) : null;
      if (track) insertPlay.run(track.id, JSON.stringify(track), number(item.playedAt, now), Math.max(1, number(item.count, 1)));
    }

    const playlists = parse(data.localPlaylists);
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

    const queue = parse(data.queue);
    if (isObject(queue) && readValue(db, QUEUE_KEY) === undefined) {
      writeValue(db, QUEUE_KEY, { queue: sanitizeTracks(queue.queue, QUEUE_LIMIT), currentId: typeof queue.currentId === 'string' ? queue.currentId : undefined });
    }
    const position = parse(data.position);
    if (isObject(position) && typeof position.id === 'string' && typeof position.t === 'number' && readValue(db, POSITION_KEY) === undefined) {
      writeValue(db, POSITION_KEY, { id: position.id, t: position.t });
    }

    writeValue(db, RENDERER_MARK, now);
  });
}
