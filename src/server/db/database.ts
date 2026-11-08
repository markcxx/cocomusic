import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDir } from '../local/store';
import { migrate } from './migrations';

/**
 * The app's SQLite database (userData/coco.db), owned by this server process.
 * Collections that grow (local playlists, recent plays, library, downloads)
 * live here; small configuration stays in JSON files. Node's built-in
 * `node:sqlite` needs no native module, so packaging is unchanged.
 */
export const DATABASE_FILE = 'coco.db';

type Held = { file: string; db: DatabaseSync };
// One connection per process: route modules (and dev reloads) share it.
const holder = globalThis as typeof globalThis & { __cocoDatabase?: Held };

/** Open (creating and migrating as needed) the database at `file`; legacy JSON is read from its folder. */
export function openDatabase(file: string): DatabaseSync {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (process.platform !== 'win32') {
    try { chmodSync(file, 0o600); } catch { /* best effort, like the JSON stores */ }
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  migrate(db, path.dirname(file));
  return db;
}

export function database(): DatabaseSync {
  const file = path.join(dataDir(), DATABASE_FILE);
  const held = holder.__cocoDatabase;
  if (held?.file === file) return held.db;
  held?.db.close();
  const db = openDatabase(file);
  holder.__cocoDatabase = { file, db };
  return db;
}
