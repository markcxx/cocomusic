import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Same per-user folder as login sessions (src/server/music/session.ts). */
export const dataDir = () => process.env.COCO_DATA_DIR || path.join(os.homedir(), '.cocomusic');

/** Small JSON file store: atomic writes, tolerant reads (a corrupt file starts fresh). */
export function jsonStore<T>(name: string, initial: () => T) {
  const file = () => path.join(dataDir(), name);
  let cache: T | null = null;
  return {
    read(): T {
      if (cache) return cache;
      try {
        cache = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as T) : initial();
      } catch {
        cache = initial();
      }
      return cache;
    },
    write(value: T) {
      cache = value;
      mkdirSync(dataDir(), { recursive: true });
      const temp = `${file()}.tmp`;
      writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
      renameSync(temp, file());
    },
  };
}
