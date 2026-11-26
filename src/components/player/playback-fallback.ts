import { catalogApi, CatalogRequestError } from '@/lib/catalog-client';
import { settings, type Settings } from '@/lib/settings';
import type { AudioQuality, CatalogSource, CatalogTrack, SongSource } from '@/server/music/types';
import type { Track } from '@/types/music';

type Reason = 'fallbackTrial' | 'fallbackUnavailable';
export type Alternate = { platform: CatalogSource; stream: SongSource };
const platforms: CatalogSource[] = ['kugou-lite', 'qq', 'netease', 'kugou'];
const normalized = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
type Recording = Pick<Track, 'title' | 'artist' | 'artists' | 'duration' | 'album'>;

function artistKey(track: Recording) {
  const names = track.artists?.length ? track.artists.map(item => item.name) : track.artist.split(/\s+[/&]\s+|、/);
  return names.map(normalized).sort().join('|');
}

function albumVersion(album = '') {
  return album.toLowerCase().match(/\blive\b|演唱会|现场|伴奏|instrumental|remix|remaster|重制|重录|不插电|unplugged|acoustic/g)?.sort().join('|') ?? '';
}

/** Multiple editions need an unambiguous album match. Keep version words in song titles. */
export function matchRecording(original: Recording, candidates: CatalogTrack[]) {
  const duration = original.duration;
  if (!duration || !normalized(original.title) || !artistKey(original)) return;
  const matches = candidates.filter(item =>
    normalized(item.title) === normalized(original.title) && artistKey(item) === artistKey(original)
    && item.duration && Math.abs(item.duration - duration) <= 3
    && albumVersion(item.album) === albumVersion(original.album));
  const distinct = [...new Map(matches.map(item => [item.id, item])).values()];
  if (distinct.length === 1) return distinct[0];
  const album = original.album && normalized(original.album);
  const sameAlbum = album ? distinct.filter(item => normalized(item.album ?? '') === album) : [];
  return sameAlbum.length === 1 ? sameAlbum[0] : undefined;
}

async function hasMembership(source: CatalogSource, signal: AbortSignal) {
  const response = await fetch(`/api/account/playback-entitlement?source=${source}`, { signal });
  return response.ok && (await response.json()).active === true;
}

const services = { entitlement: hasMembership, search: catalogApi.search, stream: catalogApi.songSource };

export async function findAlternate(track: Track, quality: AudioQuality, preferred: Settings['fallbackPlatform'], signal: AbortSignal, api = services): Promise<Alternate | undefined> {
  if (!track.duration || !track.title || !track.artist) return;
  const candidates = platforms.filter(platform => platform !== (track.source ?? 'netease'));
  const tryPlatform = async (platform: CatalogSource) => {
    signal.throwIfAborted();
    const attempt = AbortSignal.any([signal, AbortSignal.timeout(5500)]);
    try {
      const page = await api.search(`${track.title} ${track.artist}`, 'song', 0, 12, attempt, platform);
      const match = page.type === 'song' && matchRecording(track, page.items.filter(item => item.source === platform));
      if (!match) return;
      attempt.throwIfAborted();
      const stream = await api.stream(match.id, attempt, quality, platform);
      if (!attempt.aborted && stream.url && !stream.trial) return { platform, stream };
    } catch {
      signal.throwIfAborted();
    }
  };
  if (preferred !== 'auto' && candidates.includes(preferred)) {
    const result = await tryPlatform(preferred);
    if (result) return result;
  }
  const rest = candidates.filter(platform => platform !== preferred);
  const membershipSignal = AbortSignal.any([signal, AbortSignal.timeout(1800)]);
  const ranked = await Promise.all(rest.map(async platform => ({
    platform, active: await api.entitlement(platform, membershipSignal).catch(() => false),
  })));
  for (const { platform } of ranked.sort((a, b) => Number(b.active) - Number(a.active))) {
    const result = await tryPlatform(platform);
    if (result) return result;
  }
}

type PlayStream = (stream: SongSource, platform?: CatalogSource, continuingPreview?: boolean) => void;

/** Use the original stream first, including a warmed full stream. A late match continues from the preview's position. */
export async function resolvePlayback(
  track: Track, quality: AudioQuality, cached: SongSource | null, signal: AbortSignal, play: PlayStream,
  api: {
    original: typeof catalogApi.songSource;
    alternate: typeof findAlternate;
    settings: { get: () => Pick<Settings, Reason | 'fallbackPlatform'>; subscribe: typeof settings.subscribe };
  } = { original: catalogApi.songSource, alternate: findAlternate, settings },
) {
  let preview: SongSource | undefined;
  let originalError: unknown;
  let reason: Reason;
  try {
    // A preloaded preview can predate a sign-in or a membership claim.
    const original = cached && !(cached.trial && api.settings.get().fallbackTrial) ? cached
      : await api.original(track.songId!, signal, quality, track.source ?? 'netease');
    signal.throwIfAborted();
    if (!original.trial || !api.settings.get().fallbackTrial) { play(original); return; }
    preview = original;
    reason = 'fallbackTrial';
  } catch (error) {
    signal.throwIfAborted();
    if (cached?.trial && (error instanceof TypeError || (error instanceof CatalogRequestError && error.status >= 500))) {
      play(cached);
      return;
    }
    if (!(error instanceof CatalogRequestError && error.playbackUnavailable && api.settings.get().fallbackUnavailable)) throw error;
    originalError = error;
    reason = 'fallbackUnavailable';
  }

  const disabled = new AbortController();
  const lookup = AbortSignal.any([signal, disabled.signal, AbortSignal.timeout(16000)]);
  const unsubscribe = api.settings.subscribe(() => { if (!api.settings.get()[reason]) disabled.abort(); });
  let previewStarted = false;
  const startPreview = () => {
    if (preview && !previewStarted && !signal.aborted) { previewStarted = true; play(preview); }
  };
  const timer = preview ? setTimeout(startPreview, 1200) : undefined;
  try {
    const alternate = await api.alternate(track, quality, api.settings.get().fallbackPlatform, lookup).catch(() => undefined);
    signal.throwIfAborted();
    if (alternate && !lookup.aborted && api.settings.get()[reason]) {
      play(alternate.stream, alternate.platform, previewStarted);
    } else if (preview) startPreview();
    else throw originalError;
  } finally {
    clearTimeout(timer);
    unsubscribe();
  }
}
