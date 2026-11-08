import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Port-independent renderer preferences. The main process is the only writer.
 * Reads and writes hit memory at once. With `flushDelayMs`, disk commits are
 * coalesced (a dragged volume slider is one write, not hundreds): call
 * `flush()` before quitting. Without it every `set` commits synchronously.
 */
export function preferenceStore(directory: string, { flushDelayMs = 0 }: { flushDelayMs?: number } = {}) {
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
  /** What is on disk; becomes the backup of the next commit. */
  let committed = state;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function commit(next: Record<string, string>) {
    mkdirSync(directory, { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
    // Back up the last committed state, including recovery from .bak.
    if (existsSync(file)) {
      const backup = `${file}.bak.tmp`;
      writeFileSync(backup, JSON.stringify(committed), { mode: 0o600 });
      renameSync(backup, `${file}.bak`);
    } else copyFileSync(temp, `${file}.bak`);
    renameSync(temp, file);
    committed = next;
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (state === committed) return;
    try { commit(state); } catch (error) { console.error('[preferences] save failed', error); }
  }

  return {
    get(key: string) { return Object.hasOwn(state, key) ? state[key] : null; },
    set(key: string, value: string) {
      if (!key.startsWith('coco:') || key.length > 128 || value.length > 4 * 1024 * 1024) throw new Error('Invalid preference');
      if (state[key] === value) return;
      const next = { ...state, [key]: value };
      if (!flushDelayMs) { commit(next); state = next; return; }
      state = next;
      timer ??= setTimeout(flush, flushDelayMs);
    },
    /** Write pending changes now (app quit). */
    flush,
  };
}
