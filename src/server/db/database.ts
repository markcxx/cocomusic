import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDir } from '../local/store';
import { importLegacyFiles } from '../user-data/legacy';
import type { LegacyFileProblem } from '../user-data/types';
import { migrate } from './migrations';

/**
 * The app's SQLite database (userData/coco.db), owned by this server process.
 * Collections that grow (local playlists, recent plays, library, downloads)
 * live here; small configuration stays in JSON files. Node's built-in
 * `node:sqlite` needs no native module, so packaging is unchanged.
 */
export const DATABASE_FILE = 'coco.db';

type Opened = { db: DatabaseSync; legacyProblems: LegacyFileProblem[] };
type Held = Opened & { file: string };
// One connection per process: route modules (and dev reloads) share it.
const holder = globalThis as typeof globalThis & { __cocoDatabase?: Held };

/**
 * Open (creating and migrating as needed) the database at `file`, then import
 * data earlier versions kept in JSON files of the same folder. Files that
 * exist but cannot be read are reported and tried again on the next open.
 */
export function openDatabase(file: string): Opened {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (process.platform !== 'win32') {
    try { chmodSync(file, 0o600); } catch { /* best effort, like the JSON stores */ }
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  migrate(db);
  let legacyProblems: LegacyFileProblem[];
  try {
    legacyProblems = importLegacyFiles(db, path.dirname(file));
  } catch (error) {
    // Not marked done either: the next open tries again. The app keeps working meanwhile.
    console.error('[database] importing data of an earlier version failed', error);
    legacyProblems = [{ file: 'library.json / downloads.json', path: path.dirname(file) }];
  }
  return { db, legacyProblems };
}

function opened(): Held {
  const file = path.join(dataDir(), DATABASE_FILE);
  const held = holder.__cocoDatabase;
  if (held?.file === file) return held;
  held?.db.close();
  holder.__cocoDatabase = { file, ...openDatabase(file) };
  return holder.__cocoDatabase;
}

export const database = (): DatabaseSync => opened().db;

/** Files of an earlier version that could not be imported when the app started (kept for the next launch). */
export const legacyFileProblems = (): LegacyFileProblem[] => opened().legacyProblems;
