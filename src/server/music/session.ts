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
/** Platforms whose login was dropped because the platform rejected it (not a user logout). */
const expired = new Set<CatalogSource>();

function load(refresh = false): Store {
  if (store && !refresh) return store;
  try {
    if (existsSync(file)) store = JSON.parse(readFileSync(file, 'utf8')) as Store;
  } catch {
    // Keep the last valid snapshot if a transient read fails.
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
  // Route modules, dev reloads and helper processes must see newer logins.
  get(source: CatalogSource) { return load(true).sessions[source]; },
  set(source: CatalogSource, cookie: Record<string, string>, profile?: UserProfile) {
    load(true).sessions[source] = { cookie, profile, savedAt: Date.now() };
    expired.delete(source);
    save();
  },
  /** Merge refreshed credentials into the stored session, keeping the profile. */
  updateCookie(source: CatalogSource, patch: Record<string, string>) {
    const current = load(true).sessions[source];
    if (!current) return;
    current.cookie = { ...current.cookie, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value)) };
    save();
  },
  setProfile(source: CatalogSource, profile: UserProfile, expectedCookie?: Record<string, string>) {
    const current = load(true).sessions[source];
    if (!current || (expectedCookie && Object.entries(expectedCookie).some(([key, value]) => current.cookie[key] !== value))) return false;
    current.profile = profile;
    save();
    return true;
  },
  /** `expired`: the platform rejected the credentials, so the UI should tell the user. */
  clear(source: CatalogSource, options: { expired?: boolean } = {}) {
    const current = load(true);
    if (options.expired && current.sessions[source]) expired.add(source);
    else expired.delete(source);
    delete current.sessions[source];
    save();
  },
  /** True once after the login was dropped as expired. */
  takeExpired(source: CatalogSource) {
    const value = expired.has(source);
    expired.delete(source);
    return value;
  },
};
