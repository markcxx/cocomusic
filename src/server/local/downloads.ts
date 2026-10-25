import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { catalog } from '../music';
import { AUDIO_QUALITIES, type AudioQuality, type CatalogTrack } from '../music/types';
import { AUDIO_TYPES, extensionOf, safeFileName } from './formats';
import { addFiles, getTrack, removeTrack, trackId } from './library';
import { clipLyrics, toLrc } from './lrc-writer';
import { jsonStore } from './store';
import { embedMetadata } from './metadata';
import type { DownloadOptions } from '../../lib/download-quality';
import { assertDownloadAccess, resolveDownload } from './download-quality';

/**
 * Download manager. Jobs run in this server process (so they continue while
 * the UI navigates), two at a time, written to `<name>.part` then renamed.
 * Finished files join the local library, with a sidecar .lrc when lyrics exist.
 */

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'failed' | 'canceled';

export interface DownloadJob {
  id: string;
  songId: string;
  source: CatalogTrack['source'];
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: number;
  status: DownloadStatus;
  /** Bytes received / expected (0 when unknown). */
  received: number;
  total: number;
  /** Finished file and its library id. */
  path?: string;
  localId?: string;
  error?: string;
  metadataWarning?: string;
  createdAt: number;
  finishedAt?: number;
  /** Only a preview clip was available; seconds within the full song. */
  trial?: { start: number; end: number };
  /** Quality level upstream actually delivered (may be lower than requested). */
  level?: string;
  /** Choices captured when queued; later preference changes must not alter this job. */
  options?: DownloadOptions;
}

export type FileNaming = 'artist-title' | 'title-artist' | 'title';
export interface DownloadSettings {
  folder: string;
  quality: AudioQuality;
  naming: FileNaming;
  /** Write a same-name .lrc next to the song. */
  lyrics: boolean;
  /** Save the preview clip when the full song is not available to this account. */
  allowTrial: boolean;
  /** Simultaneous downloads. */
  concurrency: number;
}
type DownloadsFile = { settings: DownloadSettings; jobs: DownloadJob[] };

const defaultFolder = () => path.join(os.homedir(), 'Music', 'CoCo Music');
export const DEFAULT_DOWNLOAD_SETTINGS: Omit<DownloadSettings, 'folder'> = { quality: 'exhigh', naming: 'artist-title', lyrics: false, allowTrial: false, concurrency: 2 };
const store = jsonStore<DownloadsFile>('downloads.json', () => ({ settings: { folder: defaultFolder(), ...DEFAULT_DOWNLOAD_SETTINGS }, jobs: [] }));
/** Older files only stored `folder`; fill in new fields. */
const settingsOf = (data: DownloadsFile): DownloadSettings => ({ ...DEFAULT_DOWNLOAD_SETTINGS, ...data.settings });

const baseName = (job: { title: string; artist: string }, naming: FileNaming) =>
  naming === 'title' ? job.title : naming === 'title-artist' ? `${job.title} - ${job.artist}` : `${job.artist} - ${job.title}`;

const MAX_HISTORY = 500;
const TIMEOUT_MS = 10 * 60_000;
const running = new Map<string, AbortController>();

// Jobs interrupted by an app restart are retried.
let resumed = false;
function resumeOnce() {
  if (resumed) return;
  resumed = true;
  const data = store.read();
  if (data.jobs.some(job => job.status === 'downloading')) {
    store.write({ ...data, jobs: data.jobs.map(job => (job.status === 'downloading' ? { ...job, status: 'queued', received: 0 } : job)) });
  }
  pump();
}

function update(id: string, patch: Partial<DownloadJob>) {
  const data = store.read();
  store.write({ ...data, jobs: data.jobs.map(job => (job.id === id ? { ...job, ...patch } : job)) });
}

// Persist recovery progress at most once every 2s; UI reads live progress from memory.
const lastWrite = new Map<string, number>();
const live = new Map<string, Pick<DownloadJob, 'received' | 'total'>>();
function progress(id: string, received: number, total: number) {
  live.set(id, { received, total });
  const now = Date.now();
  if (now - (lastWrite.get(id) ?? 0) > 2000) { lastWrite.set(id, now); update(id, { received, total }); }
}

/** A path that does not exist yet: "name.mp3", "name (2).mp3", … */
function uniquePath(folder: string, base: string, ext: string) {
  for (let index = 1; index < 1000; index += 1) {
    const candidate = path.join(folder, `${base}${index === 1 ? '' : ` (${index})`}.${ext}`);
    if (!existsSync(candidate) && !existsSync(`${candidate}.part`)) return candidate;
  }
  return path.join(folder, `${base}-${Date.now()}.${ext}`);
}

async function run(job: DownloadJob) {
  const controller = new AbortController();
  running.set(job.id, controller);
  update(job.id, { status: 'downloading', error: undefined, received: 0, total: 0 });
  let partFile: string | undefined;
  try {
    const provider = catalog(job.source);
    const settings = settingsOf(store.read());
    const options = job.options ?? { quality: settings.quality, lyrics: settings.lyrics, allowTrial: settings.allowTrial, allowFallback: true };
    const source = await resolveDownload(provider, job.songId, options.quality);
    assertDownloadAccess(source, options);
    controller.signal.throwIfAborted();
    const response = await fetch(source.url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]) });
    if (!response.ok || !response.body) throw new Error(`下载失败（${response.status}）`);
    const urlExt = extensionOf(new URL(source.url).pathname);
    const mime = response.headers.get('content-type')?.split(';')[0];
    const ext = Object.hasOwn(AUDIO_TYPES, urlExt) ? urlExt : Object.entries(AUDIO_TYPES).find(([, type]) => type === mime)?.[0] ?? 'mp3';
    mkdirSync(settings.folder, { recursive: true });
    const target = uniquePath(settings.folder, safeFileName(`${baseName(job, settings.naming)}${source.trial ? '（试听）' : ''}`), ext);
    update(job.id, { trial: source.trial, level: source.level });
    partFile = `${target}.part`;

    const total = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    const counter = Readable.fromWeb(response.body as unknown as WebReadableStream);
    counter.on('data', (chunk: Buffer) => { received += chunk.length; progress(job.id, received, total); });
    await pipeline(counter, createWriteStream(partFile, { mode: 0o644 }), { signal: controller.signal });
    const metadataWarning = await embedMetadata(partFile, ext, job, controller.signal);
    controller.signal.throwIfAborted();
    await rename(partFile, target);
    partFile = undefined;

    // Lyrics are a bonus; a failure here never fails the download. A clip's
    // lyrics are shifted onto its own timeline so they stay in sync.
    if (options.lyrics) {
      try {
        const full = await provider.lyrics(job.songId);
        const lyrics = source.trial ? clipLyrics(full, source.trial.start, source.trial.end) : full;
        const lrc = toLrc(lyrics, job);
        if (lrc) await writeFile(target.slice(0, -ext.length) + 'lrc', lrc, 'utf8');
      } catch { /* no lyrics */ }
    }

    // A trial file must not borrow the full song's online lyrics later (times differ).
    const [local] = await addFiles([target], { remoteId: job.songId, source: job.source, trial: Boolean(source.trial) });
    update(job.id, { status: 'done', metadataWarning, path: target, localId: local?.id ?? trackId(target), received, total: total || received, finishedAt: Date.now() });
  } catch (error) {
    if (partFile) await rm(partFile, { force: true }).catch(() => undefined);
    const canceled = controller.signal.aborted;
    const message = error instanceof Error ? error.message : String(error);
    update(job.id, { status: canceled ? 'canceled' : 'failed', error: canceled ? undefined : (/timeout/i.test(message) ? '下载超时' : message), finishedAt: Date.now() });
  } finally {
    running.delete(job.id);
    live.delete(job.id);
    lastWrite.delete(job.id);
    pump();
  }
}

function pump() {
  const { jobs } = store.read();
  const slots = settingsOf(store.read()).concurrency - running.size;
  if (slots <= 0) return;
  for (const job of jobs.filter(item => item.status === 'queued' && !running.has(item.id)).slice(0, slots)) void run(job);
}

/* ───────── Public API ───────── */

export function listDownloads() {
  resumeOnce();
  const data = store.read();
  const { jobs } = data;
  // Overlay in-memory progress (file writes are throttled).
  return { settings: settingsOf(data), jobs: jobs.map(job => (live.has(job.id) ? { ...job, ...live.get(job.id) } : job)) };
}

/** Skip active jobs and existing files of the selected quality; allow a new quality. */
export function enqueue(tracks: CatalogTrack[], options?: DownloadOptions) {
  resumeOnce();
  const data = store.read();
  const active = new Set(data.jobs
    .filter(job => {
      if (job.status === 'queued' || job.status === 'downloading') return true;
      const sameQuality = !options || (job.level === options.quality && (!job.trial || options.allowTrial));
      return job.status === 'done' && sameQuality && job.localId && getTrack(job.localId) && existsSync(job.path ?? '');
    })
    .map(job => `${job.source}:${job.songId}`));
  const fresh: DownloadJob[] = [];
  for (const track of tracks) {
    const key = `${track.source}:${track.id}`;
    if (active.has(key)) continue;
    active.add(key);
    fresh.push({
      id: randomBytes(8).toString('hex'),
      songId: track.id,
      source: track.source,
      title: track.title,
      artist: track.artist,
      album: track.album,
      cover: track.cover,
      duration: track.duration,
      status: 'queued',
      received: 0,
      total: 0,
      createdAt: Date.now(),
      options: options ? { ...options } : undefined,
    });
  }
  // Drop the oldest finished entries beyond the history cap.
  const jobs = [...fresh.reverse(), ...data.jobs.filter(job => !fresh.some(item => item.songId === job.songId && item.source === job.source))];
  const finished = jobs.filter(job => job.status !== 'queued' && job.status !== 'downloading');
  const keep = new Set(finished.slice(MAX_HISTORY).map(job => job.id));
  store.write({ ...data, jobs: jobs.filter(job => !keep.has(job.id)) });
  pump();
  return { added: fresh.length, skipped: tracks.length - fresh.length };
}

export function cancel(id: string) {
  running.get(id)?.abort();
  const job = store.read().jobs.find(item => item.id === id);
  if (job?.status === 'queued') update(id, { status: 'canceled', finishedAt: Date.now() });
}

export function retry(id: string) {
  const job = store.read().jobs.find(item => item.id === id);
  if (job && (job.status === 'failed' || job.status === 'canceled')) { update(id, { status: 'queued', error: undefined, received: 0, total: 0 }); pump(); }
}

/** Remove a record; with `deleteFile`, the downloaded file (and its .lrc) too. */
export async function removeJob(id: string, deleteFile = false) {
  cancel(id);
  const data = store.read();
  const job = data.jobs.find(item => item.id === id);
  store.write({ ...data, jobs: data.jobs.filter(item => item.id !== id) });
  if (deleteFile && job?.path) {
    // Only delete inside the configured download folder: a record could predate a folder change.
    const inside = path.resolve(job.path).startsWith(path.resolve(settingsOf(data).folder) + path.sep);
    if (inside) {
      await rm(job.path, { force: true });
      if (job.localId) await removeTrack(job.localId);
      await rm(job.path.slice(0, -extensionOf(job.path).length) + 'lrc', { force: true });
    }
  }
}

export function clearFinished() {
  const data = store.read();
  store.write({ ...data, jobs: data.jobs.filter(job => job.status === 'queued' || job.status === 'downloading') });
}

export function setFolder(folder: string) {
  if (!path.isAbsolute(folder)) throw new Error('下载目录必须是绝对路径');
  mkdirSync(folder, { recursive: true });
  const data = store.read();
  store.write({ ...data, settings: { ...settingsOf(data), folder: path.resolve(folder) } });
}

/** Validated partial update of the non-folder settings. */
export function updateSettings(patch: Record<string, unknown>) {
  const data = store.read();
  const next = { ...settingsOf(data) };
  if (typeof patch.quality === 'string' && AUDIO_QUALITIES.includes(patch.quality as AudioQuality)) next.quality = patch.quality as AudioQuality;
  if (patch.naming === 'artist-title' || patch.naming === 'title-artist' || patch.naming === 'title') next.naming = patch.naming;
  if (typeof patch.lyrics === 'boolean') next.lyrics = patch.lyrics;
  if (typeof patch.allowTrial === 'boolean') next.allowTrial = patch.allowTrial;
  if (typeof patch.concurrency === 'number' && Number.isInteger(patch.concurrency)) next.concurrency = Math.min(5, Math.max(1, patch.concurrency));
  store.write({ ...data, settings: next });
  pump();
  return next;
}

/** Explicit lyric-only download. Does not enqueue or fetch the song's audio. */
export async function downloadLyrics(track: CatalogTrack) {
  const lyrics = await catalog(track.source).lyrics(track.id);
  const text = toLrc(lyrics, track);
  if (!text) throw new Error('这首歌曲暂无可下载的歌词');
  const settings = settingsOf(store.read());
  mkdirSync(settings.folder, { recursive: true });
  const completed = store.read().jobs.find(job => job.source === track.source && job.songId === track.id && job.status === 'done' && !job.trial && job.path && existsSync(job.path));
  const file = completed?.path
    ? completed.path.slice(0, -extensionOf(completed.path).length) + 'lrc'
    : uniquePath(settings.folder, safeFileName(baseName(track, settings.naming)), 'lrc');
  // Never overwrite an existing lyric file. A second download gets a distinct name.
  const target = existsSync(file) ? uniquePath(path.dirname(file), path.basename(file, '.lrc'), 'lrc') : file;
  await writeFile(target, text, { encoding: 'utf8', flag: 'wx' });
  return { path: target };
}
