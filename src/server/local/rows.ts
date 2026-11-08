import type { DatabaseSync } from 'node:sqlite';
import { parseRow, readValue, writeValue } from '../db/sql';
import type { DownloadJob, DownloadSettings } from './downloads';
import type { LocalTrack } from './library';

/**
 * Row mapping for the local library and download history. Each row keeps the
 * whole object as JSON next to the columns queries need, so new fields never
 * need a schema change. Shared by the services and the legacy JSON import.
 */

/** Insert or replace; `keepExisting` leaves a row that is already there alone (imports of older data). */
type PutOptions = { keepExisting?: boolean };

export function putLibraryTrack(db: DatabaseSync, track: LocalTrack, { keepExisting = false }: PutOptions = {}) {
  db.prepare(`INSERT INTO library_tracks (id, path, folder, added_at, data) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (id) DO ${keepExisting ? 'NOTHING' : 'UPDATE SET path = excluded.path, folder = excluded.folder, added_at = excluded.added_at, data = excluded.data'}`)
    .run(track.id, track.path, track.folder ?? null, track.addedAt, JSON.stringify(track));
}

export function readLibraryTrack(db: DatabaseSync, id: string): LocalTrack | undefined {
  const row = db.prepare('SELECT data FROM library_tracks WHERE id = ?').get(id) as { data: string } | undefined;
  return parseRow<LocalTrack>(row?.data) ?? undefined;
}

export function addLibraryFolder(db: DatabaseSync, folder: string) {
  db.prepare('INSERT OR IGNORE INTO library_folders (path, added_at) VALUES (?, ?)').run(folder, Date.now());
}

/** Folders in the order they were added. */
export function readLibraryFolders(db: DatabaseSync): string[] {
  return (db.prepare('SELECT path FROM library_folders ORDER BY rowid').all() as Array<{ path: string }>).map(row => row.path);
}

export function putDownloadJob(db: DatabaseSync, job: DownloadJob, { keepExisting = false }: PutOptions = {}) {
  db.prepare(`INSERT INTO download_jobs (id, source, song_id, status, created_at, data) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO ${keepExisting ? 'NOTHING' : 'UPDATE SET status = excluded.status, data = excluded.data'}`)
    .run(job.id, job.source, job.songId, job.status, job.createdAt, JSON.stringify(job));
}

/** One job by its id (primary key), without reading the history. */
export function readDownloadJob(db: DatabaseSync, id: string): DownloadJob | undefined {
  const row = db.prepare('SELECT data FROM download_jobs WHERE id = ?').get(id) as { data: string } | undefined;
  return parseRow<DownloadJob>(row?.data) ?? undefined;
}

/** Newest first; jobs queued together keep their batch order. */
export function readDownloadJobs(db: DatabaseSync): DownloadJob[] {
  return (db.prepare('SELECT data FROM download_jobs ORDER BY created_at DESC, rowid DESC').all() as Array<{ data: string }>)
    .map(row => parseRow<DownloadJob>(row.data))
    .filter((job): job is DownloadJob => Boolean(job));
}

const SETTINGS_KEY = 'downloads:settings';
export const readDownloadSettings = (db: DatabaseSync) => readValue<Partial<DownloadSettings>>(db, SETTINGS_KEY);
export const writeDownloadSettings = (db: DatabaseSync, settings: DownloadSettings) => writeValue(db, SETTINGS_KEY, settings);
