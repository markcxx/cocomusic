import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './sql';

/**
 * Schema versions, tracked in `PRAGMA user_version`. Each step runs in its own
 * transaction together with the version bump, so a crash mid-way leaves the
 * previous version intact and the step simply runs again on the next launch.
 * Append new steps; never edit one that has shipped.
 */
type Migration = (db: DatabaseSync) => void;

const MIGRATIONS: Migration[] = [
  // 1 — collections move out of JSON. Rows keep the whole object as JSON (`track`, `data`)
  // beside the columns queries need, so new fields need no schema change.
  // (Data of earlier versions is imported separately: user-data/legacy.ts.)
  db => {
    db.exec(`
      CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

      CREATE TABLE playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        cover TEXT,
        origin TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE playlist_tracks (
        playlist_id TEXT NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
        track_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        track TEXT NOT NULL,
        PRIMARY KEY (playlist_id, track_id)
      ) WITHOUT ROWID;
      CREATE INDEX playlist_tracks_order ON playlist_tracks (playlist_id, position);

      CREATE TABLE recent_plays (
        track_id TEXT PRIMARY KEY,
        track TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
      CREATE INDEX recent_plays_time ON recent_plays (played_at);

      CREATE TABLE library_folders (path TEXT PRIMARY KEY, added_at INTEGER NOT NULL);
      CREATE TABLE library_tracks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        folder TEXT,
        added_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX library_tracks_folder ON library_tracks (folder);

      CREATE TABLE download_jobs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        song_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX download_jobs_song ON download_jobs (source, song_id);
    `);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: DatabaseSync) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  // A newer app wrote this file (the user went back a version): use it as is.
  for (let index = version; index < MIGRATIONS.length; index += 1) {
    transaction(db, () => {
      MIGRATIONS[index](db);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    });
  }
}
