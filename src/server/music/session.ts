import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CatalogSource, UserProfile } from './types';

/**
 * Per-platform login credentials kept on this machine only.
 * The Electron main process passes its userData folder via COCO_DATA_DIR;
 * file mode 0600 keeps other OS users from reading the token.
 */
type PlatformSession = { cookie: Record<string, string>; profile?: UserProfile; savedAt: number };
type Store = { deviceId: string; sessions: Partial<Record<CatalogSource, PlatformSession>> };

const dir = process.env.COCO_DATA_DIR || path.join(os.homedir(), '.cocomusic');
const file = path.join(dir, 'sessions.json');
let store: Store | null = null;

function load(): Store {
  if (store) return store;
  try {
    if (existsSync(file)) store = JSON.parse(readFileSync(file, 'utf8')) as Store;
  } catch {
    store = null;
  }
  // A stable 52-hex device id per install, like the official desktop client.
  if (!store?.deviceId) store = { deviceId: randomBytes(26).toString('hex').toUpperCase(), sessions: store?.sessions ?? {} };
  return store;
}

function save() {
  if (!store) return;
  mkdirSync(dir, { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(store), { mode: 0o600 });
  renameSync(temp, file);
}

export const session = {
  deviceId: () => load().deviceId,
  get(source: CatalogSource) { return load().sessions[source]; },
  set(source: CatalogSource, cookie: Record<string, string>, profile?: UserProfile) {
    load().sessions[source] = { cookie, profile, savedAt: Date.now() };
    save();
  },
  setProfile(source: CatalogSource, profile: UserProfile) {
    const current = load().sessions[source];
    if (current) { current.profile = profile; save(); }
  },
  clear(source: CatalogSource) {
    delete load().sessions[source];
    save();
  },
};
