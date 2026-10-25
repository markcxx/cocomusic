import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Desktop passes Electron's OS-specific userData directory. */
export const dataDir = () => process.env.COCO_DATA_DIR || path.join(os.homedir(), '.cocomusic');

/** Atomic JSON commits with recovery from the previous valid snapshot. */
export function jsonStore<T>(name: string, initial: () => T, migrate: (value: T) => T = value => value) {
  const file = () => path.join(dataDir(), name);
  let cache: T | null = null;
  let pending: Promise<unknown> = Promise.resolve();
  const read = (): T => {
    if (cache !== null) return cache;
    for (const candidate of [file(), `${file()}.bak`]) {
      try { cache = migrate(JSON.parse(readFileSync(candidate, 'utf8')) as T); return cache; } catch { /* try backup */ }
    }
    cache = initial();
    return cache;
  };
  const write = (value: T) => {
    const previous = read();
    mkdirSync(dataDir(), { recursive: true });
    const temp = `${file()}.tmp`;
    writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
    const backup = `${file()}.bak.tmp`;
    writeFileSync(backup, JSON.stringify(previous), { mode: 0o600 });
    renameSync(backup, `${file()}.bak`);
    renameSync(temp, file());
    cache = value;
  };
  return {
    read, write,
    /** Serialize async read/modify/write operations; a failed operation never blocks the queue. */
    transaction<R>(change: (current: T) => Promise<{ value: T; result: R }> | { value: T; result: R }): Promise<R> {
      const next = pending.then(async () => {
        const { value, result } = await change(read());
        write(value);
        return result;
      });
      pending = next.catch(() => undefined);
      return next;
    },
  };
}
