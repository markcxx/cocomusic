import type { DatabaseSync } from 'node:sqlite';

/** Run `work` atomically (joins an enclosing transaction). Throwing rolls everything back. */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  if (db.isTransaction) return work();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/* ───────── Small JSON values (settings, player state, markers) ───────── */

export function readValue<T>(db: DatabaseSync, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try { return JSON.parse(row.value) as T; } catch { return undefined; }
}

export function writeValue(db: DatabaseSync, key: string, value: unknown) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

/** JSON column → object; a damaged row is skipped by callers instead of failing a whole list. */
export function parseRow<T>(text: unknown): T | null {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}
