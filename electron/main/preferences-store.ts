import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';

/** Port-independent renderer preferences. The main process is the only writer. */
export function preferenceStore(directory: string) {
  const file = path.join(directory, 'preferences.json');
  function load(): Record<string, string> {
    for (const candidate of [file, `${file}.bak`]) {
      try {
        const value: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.fromEntries(Object.entries(value).filter(([key, item]) => key.startsWith('coco:') && typeof item === 'string'));
        }
      } catch { /* Try the last valid backup. */ }
    }
    return {};
  }
  let state = load();
  return {
    get(key: string) { return Object.hasOwn(state, key) ? state[key] : null; },
    set(key: string, value: string) {
      if (!key.startsWith('coco:') || key.length > 128 || value.length > 4 * 1024 * 1024) throw new Error('Invalid preference');
      if (state[key] === value) return;
      const next = { ...state, [key]: value };
      mkdirSync(directory, { recursive: true });
      const temp = `${file}.tmp`;
      writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
      // Back up the last committed in-memory state, including recovery from .bak.
      if (existsSync(file)) {
        const backup = `${file}.bak.tmp`;
        writeFileSync(backup, JSON.stringify(state), { mode: 0o600 });
        renameSync(backup, `${file}.bak`);
      } else copyFileSync(temp, `${file}.bak`);
      renameSync(temp, file);
      state = next;
    },
  };
}
