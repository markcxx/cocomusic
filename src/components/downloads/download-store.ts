'use client';

import { useSyncExternalStore } from 'react';
import { toast } from '@/components/ui/toast';
import { downloadsApi, type DownloadJob, type DownloadSettings } from '@/lib/local-client';
import type { DownloadOptions } from '@/lib/download-quality';
import type { CatalogTrack } from '@/lib/catalog-client';

/**
 * Client view of the server download queue. Polls fast while anything is
 * active and stops when idle; any page using it shares one poller.
 */
type State = { jobs: DownloadJob[]; folder: string; settings: DownloadSettings | null; loaded: boolean };

let state: State = { jobs: [], folder: '', settings: null, loaded: false };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null;

const emit = () => listeners.forEach(listener => listener());
const active = (jobs: DownloadJob[]) => jobs.some(job => job.status === 'queued' || job.status === 'downloading');

async function refresh() {
  inflight ??= downloadsApi.list()
    .then(({ jobs, settings }) => {
      const finished = state.jobs.filter(job => job.status === 'downloading' || job.status === 'queued')
        .map(job => jobs.find(next => next.id === job.id))
        .filter((job): job is DownloadJob => Boolean(job && (job.status === 'done' || job.status === 'failed')));
      for (const job of finished) {
        if (job.status === 'done') toast.success(`「${job.title}」${job.trial ? '试听片段' : ''}下载完成`);
        else toast.error(`「${job.title}」下载失败：${job.error ?? '未知错误'}`);
      }
      state = { jobs, folder: settings.folder, settings, loaded: true };
      emit();
    })
    .catch(() => undefined)
    .finally(() => { inflight = null; });
  await inflight;
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (!listeners.size) return;
  timer = setTimeout(() => void refresh(), active(state.jobs) ? 700 : 5000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) void refresh();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) clearTimeout(timer);
  };
}

const SERVER: State = { jobs: [], folder: '', settings: null, loaded: false };
export function useDownloads() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

/** Song id → latest job for it, for per-row download state. */
export function jobFor(jobs: DownloadJob[], songId: string, source: CatalogTrack['source']) {
  return jobs.find(job => job.songId === songId && job.source === source);
}

let request: CatalogTrack[] = [];
const requestListeners = new Set<() => void>();
const EMPTY_REQUEST: CatalogTrack[] = [];
export function useDownloadRequest() {
  return useSyncExternalStore(listener => { requestListeners.add(listener); return () => { requestListeners.delete(listener); }; }, () => request, () => EMPTY_REQUEST);
}

export const downloads = {
  refresh,
  async add(tracks: CatalogTrack[]) {
    if (!tracks.length) { toast.info('没有可下载的歌曲'); return; }
    if (!state.loaded) await refresh();
    if (!state.loaded) { toast.error('下载设置加载失败，请重试'); return; }
    request = [...tracks];
    requestListeners.forEach(listener => listener());
  },
  closeRequest() { request = []; requestListeners.forEach(listener => listener()); },
  async confirm(tracks: CatalogTrack[], options: DownloadOptions) {
    try {
      await downloadsApi.updateSettings({ quality: options.quality, lyrics: options.lyrics, allowTrial: options.allowTrial });
      const { added, skipped } = await downloadsApi.add(tracks, options);
      downloads.closeRequest();
      if (added) toast.success(tracks.length === 1 ? `已加入下载：${tracks[0].title}` : `已加入下载 ${added} 首${skipped ? `，${skipped} 首已在列表中` : ''}`);
      else toast.info(tracks.length === 1 ? '这首歌已在下载列表中' : '这些歌曲都已在下载列表中');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入下载失败');
    }
    await refresh();
  },
  async updateSettings(patch: Partial<Omit<DownloadSettings, 'folder'>>) {
    try { await downloadsApi.updateSettings(patch); } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); }
    await refresh();
  },
  async run(action: () => Promise<unknown>) {
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : '操作失败'); }
    await refresh();
  },
};
