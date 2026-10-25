import { execFile, spawn } from 'node:child_process';
import { accessSync, chmodSync, constants, copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, BrowserWindow, net, shell } from 'electron';
import { IPC } from '../shared/ipc';
import { downloadInstaller, fileSha256 } from './update-download';
import {
  checksumFromSums, compareVersions, inChannel, installAsset, isVersion, parseReleases, pickUpdate, releasesBetween,
  type InstallTarget, type ReleaseAsset, type ReleaseInfo, type UpdateChannel,
} from './update-core';

/**
 * Updates from GitHub Releases (the release workflow publishes every installer
 * plus SHA256SUMS.txt). The main process checks, downloads, verifies and hands
 * the installer over; the renderer only sees UpdateState and asks for actions,
 * so it can never choose a URL or a file to run.
 *
 * Installing per platform:
 * - macOS: the .zip is unpacked and swapped in for the running bundle after quit
 *   (the app is ad-hoc signed, so Squirrel.Mac cannot be used). When the bundle
 *   is not writable (run from the DMG, translocated) the .dmg is opened instead.
 * - Windows: the NSIS installer runs silently into the existing install and starts the app again.
 * - Linux: an AppImage replaces itself; a .deb install opens the package in the system installer.
 */

const REPO = 'markcxx/cocomusic';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export interface UpdateSettings {
  autoCheck: boolean;
  /** Download found updates in the background and install them when the app quits. */
  autoDownload: boolean;
  channel: UpdateChannel;
}

export interface ReleaseNote {
  version: string;
  name: string;
  publishedAt: string;
  url: string;
  prerelease: boolean;
  notes: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  settings: UpdateSettings;
  /** When the last check finished (ms since epoch). */
  lastCheck: number | null;
  /** Newest release in the channel above the current version, with every release note in between. */
  update: (ReleaseNote & { size: number; file: string; notes: string; changes: ReleaseNote[] }) | null;
  progress: { received: number; total: number; speed: number } | null;
  /** Download first, then restart into the new version or open the verified installer. */
  install: 'restart' | 'open';
  error: string;
  /** Version the user chose to skip: automatic checks stay quiet about it. */
  skipped: string;
  /** An automatic check found this version: the renderer prompts once. */
  notify: string;
  /** The app was just updated to this version: the renderer shows what's new once. */
  whatsNew: string;
  /** The downloaded update installs by itself when the app quits. */
  installOnQuit: boolean;
}

/** Development only: COCO_FAKE_VERSION=0.0.0 npm run dev pretends to be an older build, to preview the update UI. */
const currentVersion = () => (!app.isPackaged && isVersion(process.env.COCO_FAKE_VERSION) ? process.env.COCO_FAKE_VERSION.replace(/^v/, '') : app.getVersion());

const storeFile = () => path.join(app.getPath('userData'), 'updater.json');
const downloadsDir = () => path.join(app.getPath('userData'), 'updates');

const settings: UpdateSettings = { autoCheck: true, autoDownload: false, channel: app.getVersion().includes('-') ? 'beta' : 'stable' };
let skipped = '';
let lastVersion = '';
let state: UpdateState;
let releases: ReleaseInfo[] = [];
let etag = '';
let checking: Promise<void> | null = null;
let download: AbortController | null = null;
/** Verified installer on disk, ready for install(). `bundle`: the unpacked macOS app, prepared ahead so quitting can swap it in at once. */
let ready: { version: string; file: string; target: InstallTarget; bundle?: string } | null = null;
let timer: NodeJS.Timeout | undefined;
/** An install already took over this quit (no second one from will-quit). */
let installing = false;

function load() {
  try {
    if (!existsSync(storeFile())) return;
    const raw = JSON.parse(readFileSync(storeFile(), 'utf8')) as Record<string, unknown>;
    if (typeof raw.autoCheck === 'boolean') settings.autoCheck = raw.autoCheck;
    if (typeof raw.autoDownload === 'boolean') settings.autoDownload = raw.autoDownload;
    if (raw.channel === 'stable' || raw.channel === 'beta') settings.channel = raw.channel;
    if (isVersion(raw.skipped)) skipped = raw.skipped;
    if (isVersion(raw.lastVersion)) lastVersion = raw.lastVersion;
  } catch { /* defaults */ }
}

function save() {
  try { writeFileSync(storeFile(), JSON.stringify({ ...settings, skipped, lastVersion: app.getVersion() })); } catch { /* best effort */ }
}

function broadcast() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.updateState, state);
  }
}

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  state.installOnQuit = Boolean(ready && state.status === 'ready' && settings.autoDownload && installMode(ready.target) === 'restart');
  broadcast();
}

/** Background download of the offered version (automatic checks with 自动下载 on). */
const autoDownloads = () => Boolean(state.update && autoDownloadsFor(state.update.version));

const note = (release: ReleaseInfo): ReleaseNote => ({
  version: release.version, name: release.name, publishedAt: release.publishedAt, url: release.url, prerelease: release.prerelease, notes: release.notes,
});

/** Where the running app lives and which installer can replace it. */
function installTarget(): InstallTarget {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'linux') return process.env.APPIMAGE ? 'appimage' : 'deb';
  // A dev Electron bundle must never be replaced by an application update.
  return app.isPackaged && macBundleWritable() ? 'mac-zip' : 'mac-dmg';
}

/** …/CoCo Music.app/Contents/MacOS/CoCo Music → …/CoCo Music.app */
const macBundle = () => path.resolve(process.execPath, '..', '..', '..');

function macBundleWritable() {
  const bundle = macBundle();
  if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return false;
  try {
    // Replacing the bundle needs write access to it and to the folder holding it.
    accessSync(path.dirname(bundle), constants.W_OK);
    accessSync(bundle, constants.W_OK);
    return true;
  } catch { return false; }
}

function installMode(target: InstallTarget): UpdateState['install'] {
  if (!app.isPackaged) return 'open';
  return target === 'mac-zip' || target === 'win' || target === 'appimage' ? 'restart' : 'open';
}

function message(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return '下载已取消';
  if (error instanceof Error && error.name === 'TimeoutError') return '连接超时，请检查网络后重试';
  const text = error instanceof Error ? error.message : String(error);
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|ERR_NETWORK|ERR_PROXY/i.test(text)) return '无法连接 GitHub，请检查网络或代理设置';
  return text || '更新失败，请稍后重试';
}

async function fetchReleases() {
  const response = await net.fetch(API, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': `CoCoMusic/${app.getVersion()}`, ...(etag ? { 'If-None-Match': etag } : {}) },
  });
  // Unchanged since the last check (also does not count against the rate limit).
  if (response.status === 304 && releases.length) return releases;
  if (response.status === 403 || response.status === 429) throw new Error('GitHub 访问过于频繁，请稍后再试');
  if (!response.ok) throw new Error(`GitHub 返回错误（${response.status}）`);
  releases = parseReleases(await response.json(), REPO);
  etag = response.headers.get('etag') ?? '';
  return releases;
}

/** Recompute `update` from the release list for the current channel and machine. */
function applyReleases(auto: boolean) {
  const current = currentVersion();
  const target = ready?.target ?? installTarget();
  const latest = pickUpdate(releases, current, settings.channel, target, process.arch);
  if (!latest) {
    ready = null;
    set({ status: 'latest', update: null, progress: null, error: '', notify: '', lastCheck: Date.now(), install: installMode(target) });
    return;
  }
  const asset = installAsset(latest, target, process.arch)!;
  const changes = releasesBetween(releases, current, latest, settings.channel).map(note);
  const same = state.update?.version === latest.version;
  const downloaded = ready?.version === latest.version;
  if (!downloaded) ready = null;
  set({
    status: downloaded ? 'ready' : same && state.status === 'downloading' ? 'downloading' : 'available',
    update: { ...note(latest), size: asset.size, file: asset.name, changes },
    progress: downloaded || (same && state.status === 'downloading') ? state.progress : null,
    error: '',
    lastCheck: Date.now(),
    install: installMode(target),
    // Prompt for a version only once per session, and never for a skipped one.
    // With 自动下载 the prompt waits until the download is ready (see downloadUpdate).
    notify: auto && !autoDownloadsFor(latest.version) && latest.version !== skipped && state.notify !== latest.version && !same ? latest.version : state.notify,
  });
  if (auto && autoDownloads() && state.status === 'available') void downloadUpdate(true);
}

const autoDownloadsFor = (version: string) => settings.autoDownload && app.isPackaged && version !== skipped;

export function checkForUpdates(auto = false): Promise<void> {
  if (checking) return checking;
  if (state.status === 'downloading') return Promise.resolve();
  const previous = state.status;
  if (!auto) set({ status: 'checking', error: '' });
  checking = fetchReleases()
    .then(() => applyReleases(auto))
    .catch(error => {
      // A failed background check keeps whatever was shown; a manual one reports why.
      if (auto) { if (previous === 'checking') set({ status: 'idle' }); return; }
      set({ status: 'error', error: message(error), lastCheck: Date.now() });
    })
    .finally(() => { checking = null; });
  return checking;
}

/** Expected SHA-256 for an asset: GitHub's digest, else the release's SHA256SUMS.txt. */
async function expectedHash(release: ReleaseInfo, asset: ReleaseAsset, signal: AbortSignal) {
  if (asset.digest) return asset.digest.slice('sha256:'.length);
  const sums = release.assets.find(item => item.name === 'SHA256SUMS.txt');
  if (!sums) throw new Error('该版本缺少校验文件，无法安全安装');
  const response = await net.fetch(sums.url, { signal });
  if (!response.ok) throw new Error(`校验文件下载失败（${response.status}）`);
  const hash = checksumFromSums(await response.text(), asset.name);
  if (!hash) throw new Error('校验文件中没有此安装包');
  return hash;
}

/** macOS: unpack the app ahead of time, so quitting only has to move it into place. */
async function prepareBundle(version: string, file: string) {
  const staging = path.join(downloadsDir(), `staging-${version}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  // ditto keeps symlinks, permissions and the code signature intact.
  await run('/usr/bin/ditto', ['-x', '-k', file, staging]);
  const bundle = (await readdir(staging)).find(name => name.endsWith('.app'));
  if (!bundle) throw new Error('安装包内容不完整');
  return path.join(staging, bundle);
}

/** `background`: started by an automatic check; failures stay quiet and the next check retries. */
export async function downloadUpdate(background = false) {
  // A manual click during a pending check must download the version it finishes offering.
  if (checking) await checking;
  if (!state.update || download || state.status === 'ready') return;
  const release = releases.find(item => item.version === state.update?.version);
  const target = installTarget();
  const asset = release && installAsset(release, target, process.arch);
  if (!release || !asset) { set({ status: 'error', error: '找不到适用于本机的安装包' }); return; }

  const controller = new AbortController();
  download = controller;
  set({ status: 'downloading', error: '', progress: { received: 0, total: asset.size, speed: 0 } });
  try {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60_000)]);
    const expected = await expectedHash(release, asset, signal);
    const { file, bytes } = await downloadInstaller({
      directory: downloadsDir(), asset, expected, signal,
      fetch: (url, options) => net.fetch(url, options),
      onProgress: progress => set({ progress }),
    });
    signal.throwIfAborted();
    const bundle = target === 'mac-zip' ? await prepareBundle(release.version, file) : undefined;
    signal.throwIfAborted();
    ready = { version: release.version, file, target, bundle };
    set({
      status: 'ready',
      progress: { received: bytes, total: bytes, speed: 0 },
      // A background download announces itself once it is ready to install.
      notify: background && release.version !== skipped ? release.version : state.notify,
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    set({ status: aborted || background ? 'available' : 'error', progress: null, error: aborted || background ? '' : message(error) });
  } finally {
    if (download === controller) download = null;
  }
}

export function cancelDownload() {
  download?.abort();
}

const run = promisify(execFile);

/** Swap the new bundle in once this process has exited, then open it. Arguments stay positional (no shell interpolation). */
const MAC_SWAP = [
  'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done',
  'rm -rf "$3.old"',
  'if mv "$3" "$3.old" && mv "$2" "$3"; then rm -rf "$3.old"; else [ -d "$3" ] || mv "$3.old" "$3"; fi',
  'xattr -dr com.apple.quarantine "$3" 2>/dev/null',
  // $4 set: 立即重启 opens the new version; empty: updated on quit, stays closed.
  '[ -n "$4" ] && open "$3"',
].join('\n');

/**
 * Start the in-place update for a verified download. `relaunch`: open the new
 * version afterwards (立即重启) or just leave it installed (update on quit).
 * Must run synchronously: on quit there is no time left to await anything.
 */
function startInstall(relaunch: boolean) {
  if (!ready) return false;
  const { file, target, bundle } = ready;
  if (target === 'mac-zip' && bundle && existsSync(bundle)) {
    spawn('/bin/sh', ['-c', MAC_SWAP, 'coco-update', String(process.pid), bundle, macBundle(), relaunch ? '1' : ''], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (target === 'win') {
    // electron-builder NSIS: /S silent into the existing location, --force-run starts the app afterwards.
    spawn(file, ['--updated', '/S', ...(relaunch ? ['--force-run'] : [])], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (target === 'appimage' && process.env.APPIMAGE) {
    const current = process.env.APPIMAGE;
    const next = `${current}.update`;
    copyFileSync(file, next);
    chmodSync(next, 0o755);
    renameSync(next, current);
    if (relaunch) app.relaunch({ execPath: current, args: process.argv.slice(1) });
    return true;
  }
  return false;
}

/** Hand the verified installer over. 'restart' modes quit the app. */
export async function installUpdate() {
  if (!state.update) return;
  // Installing before download must use the same in-app download flow.
  if (!ready || state.status !== 'ready') { await downloadUpdate(); return; }
  const { file, target } = ready;
  try {
    // Re-verify right before running: the file sat in userData since the download.
    const release = releases.find(item => item.version === ready?.version);
    const asset = release && installAsset(release, target, process.arch);
    if (!release || !asset || (await fileSha256(file)) !== (await expectedHash(release, asset, new AbortController().signal))) throw new Error('安装包校验失败，请重新下载');
    if (target === 'mac-zip' && !(ready.bundle && existsSync(ready.bundle))) ready.bundle = await prepareBundle(release.version, file);

    if (installMode(target) === 'restart') {
      if (!startInstall(true)) throw new Error('无法启动安装，请重新下载');
      installing = true;
      app.quit();
      return;
    }
    // .dmg / .deb: the system installer takes it from here.
    const failure = await shell.openPath(file);
    if (failure) shell.showItemInFolder(file);
  } catch (error) {
    set({ status: 'error', error: message(error) });
  }
}

/** 自动下载: a downloaded update installs while the app quits, and the next launch is the new version. */
function installOnQuit() {
  if (installing || !state.installOnQuit) return;
  installing = true;
  try { startInstall(false); } catch { /* the download stays; the next launch offers it again */ }
}

export function skipVersion(version: unknown) {
  if (!isVersion(version)) return;
  skipped = version;
  save();
  set({ skipped, notify: '' });
}

export function dismiss(what: unknown) {
  if (what === 'notify') set({ notify: '' });
  if (what === 'whatsNew') set({ whatsNew: '' });
}

export function setUpdateSettings(patch: Record<string, unknown>) {
  const channelChanged = (patch.channel === 'stable' || patch.channel === 'beta') && patch.channel !== settings.channel;
  if (typeof patch.autoCheck === 'boolean') settings.autoCheck = patch.autoCheck;
  if (typeof patch.autoDownload === 'boolean') settings.autoDownload = patch.autoDownload;
  if (channelChanged) settings.channel = patch.channel as UpdateChannel;
  save();
  set({ settings: { ...settings } });
  schedule();
  // A different channel may offer a different version.
  if (channelChanged && releases.length && state.status !== 'downloading') applyReleases(false);
  // Turned on while an update is waiting: fetch it now rather than at the next check.
  if (patch.autoDownload === true && state.status === 'available' && autoDownloads()) void downloadUpdate(true);
  return state;
}

/** Every published release in the channel (the 更新日志 list). */
export async function changelog(): Promise<{ releases: ReleaseNote[]; error: string }> {
  try {
    if (!releases.length || !state.lastCheck || Date.now() - state.lastCheck > 10 * 60 * 1000) await fetchReleases();
    return { releases: inChannel(releases, settings.channel).map(note), error: '' };
  } catch (error) {
    return { releases: inChannel(releases, settings.channel).map(note), error: message(error) };
  }
}

export const getUpdateState = () => state;

function schedule() {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (!settings.autoCheck) return;
  timer = setInterval(() => { void checkForUpdates(true); }, CHECK_EVERY_MS);
  timer.unref();
}

/** Partial downloads and installers for this or older versions are leftovers. */
async function cleanDownloads() {
  try {
    for (const name of await readdir(downloadsDir())) {
      if (name.endsWith('.part')) { await rm(path.join(downloadsDir(), name), { force: true }); continue; }
      const version = /^(?:CoCo-Music-|staging-)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+?)?)(?:-(?:mac|win|linux)|$)/.exec(name)?.[1];
      if (!version || !isVersion(version) || compareVersions(version, app.getVersion()) <= 0) {
        await rm(path.join(downloadsDir(), name), { recursive: true, force: true });
      }
    }
  } catch { /* no downloads yet */ }
}

export function setupUpdater() {
  load();
  const current = currentVersion();
  const whatsNew = lastVersion && compareVersions(current, lastVersion) > 0 ? current : '';
  save();
  state = {
    status: 'idle', current, settings: { ...settings }, lastCheck: null, update: null, progress: null,
    install: installMode(installTarget()), error: '', skipped, notify: '', whatsNew, installOnQuit: false,
  };
  void cleanDownloads();
  schedule();
  if (settings.autoCheck) setTimeout(() => { void checkForUpdates(true); }, FIRST_CHECK_MS).unref();
  app.on('will-quit', () => { download?.abort(); installOnQuit(); });
}
