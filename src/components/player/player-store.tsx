'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { catalogApi, type SongSource } from '@/lib/catalog-client';
import { initialTrack } from '@/lib/mock-data';
import { useLatest } from '@/lib/use-latest';
import type { Track } from '@/types/music';

/** One cycling control: list loop → shuffle → single loop → in order (stops at the end). */
export type PlayMode = 'loop' | 'shuffle' | 'one' | 'order';
export const playModes: readonly PlayMode[] = ['loop', 'shuffle', 'one', 'order'];
export const playModeLabels: Record<PlayMode, string> = { loop: '列表循环', shuffle: '随机播放', one: '单曲循环', order: '顺序播放' };
/** idle: nothing playable selected · loading: fetching URL or buffering · ready · error: this track failed. */
export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'error';

type PlayerState = {
  track: Track;
  queue: Track[];
  /** Desired state: true while playing or about to (loading). */
  playing: boolean;
  status: PlaybackStatus;
  /** Seconds of the loaded stream (the clip length for previews). */
  duration: number;
  /** Set when only a preview clip plays; lyric time = position + trial.start. */
  trial?: SongSource['trial'];
  volume: number;
  mode: PlayMode;
  lyricsOpen: boolean;
  togglePlay: () => void;
  play: (track: Track, queue?: Track[]) => void;
  /** Append to the end of the play queue (skips tracks already queued). */
  enqueue: (tracks: Track[]) => void;
  previous: () => void;
  next: () => void;
  /** Seconds within the loaded stream. */
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  /** Advance to the next play mode. */
  cycleMode: () => void;
  openLyrics: () => void;
  closeLyrics: () => void;
};

const PlayerContext = createContext<PlayerState | null>(null);
// Position changes every frame; isolating it keeps the rest of the UI from re-rendering at 60fps.
const PositionContext = createContext(0);

/** Uniform pick among the other `length - 1` positions (shuffle never repeats the current song). */
function randomOtherIndex(current: number, length: number) {
  const pick = Math.floor(Math.random() * (length - 1));
  return current >= 0 && pick >= current ? pick + 1 : pick;
}

const VOLUME_KEY = 'coco:volume';
const MODE_KEY = 'coco:play-mode';
const readStored = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const readVolume = () => {
  const raw = readStored(VOLUME_KEY);
  const value = Number(raw);
  return raw !== null && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.62;
};
const readMode = (): PlayMode => {
  const raw = readStored(MODE_KEY);
  return playModes.includes(raw as PlayMode) ? (raw as PlayMode) : 'loop';
};

/**
 * Playback backed by a single <audio> element. Selecting a track fetches a fresh
 * stream URL (they expire), then plays it; `ended` advances per play mode.
 * Failing tracks are skipped, with a cap so a queue of unplayable songs stops.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<Track[]>([initialTrack]);
  const [track, setTrack] = useState(initialTrack);
  // Bumped to (re)load the current track, including the same one again.
  const [loadKey, setLoadKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number>();
  const [trial, setTrial] = useState<SongSource['trial']>();
  const [volume, setVolumeState] = useState(0.62);
  const lastVolume = useRef(0.62);
  const [mode, setMode] = useState<PlayMode>('loop');
  const [lyricsOpen, setLyricsOpen] = useState(false);

  const failures = useRef(0);
  /** Resume point after re-fetching an expired stream URL. */
  const resumeAt = useRef<number | null>(null);
  /** Played tracks, so 上一首 in shuffle mode walks back instead of rolling again. */
  const history = useRef<Track[]>([]);

  const select = (next: Track, options: { autoplay?: boolean; remember?: boolean } = {}) => {
    if (options.remember !== false && latest.current.track.songId) history.current = [...history.current.slice(-49), latest.current.track];
    setTrack(next);
    setPosition(0);
    setMediaDuration(undefined);
    setTrial(undefined);
    setStatus(next.songId ? 'loading' : 'idle');
    setPlaying(options.autoplay !== false && Boolean(next.songId));
    setLoadKey(value => value + 1);
  };

  /**
   * Move through the queue. `auto` marks a song ending by itself: only then does
   * 顺序播放 stop at the end of the list (manual 下一首 still wraps around).
   */
  const step = (offset: 1 | -1, auto = false) => {
    const { queue: list, track: current, mode: playMode } = latest.current;
    if (!list.length) return;
    const random = playMode === 'shuffle';
    if (offset === -1 && random && history.current.length) {
      select(history.current.pop()!, { remember: false });
      return;
    }
    const index = list.findIndex(item => item.id === current.id);
    if (auto && playMode === 'order' && index === list.length - 1) {
      setPlaying(false);
      return;
    }
    let nextIndex = (Math.max(0, index) + offset + list.length) % list.length;
    if (random && list.length > 1) nextIndex = randomOtherIndex(index, list.length);
    select(list[nextIndex]);
  };

  /** A track could not play: skip ahead unless every recent attempt failed too. */
  const fail = (message: string) => {
    failures.current += 1;
    const { queue: list } = latest.current;
    const canSkip = list.filter(item => item.songId).length > 1 && failures.current < Math.min(list.length, 5);
    toast.error(canSkip ? `${message}，已跳到下一首` : message);
    if (canSkip) { step(1); return; }
    failures.current = 0;
    setStatus('error');
    setPlaying(false);
  };

  const latest = useLatest({ queue, track, mode, playing, step, fail, select });

  // Restore saved volume and play mode once mounted (localStorage is browser-only).
  useEffect(() => {
    const saved = readVolume();
    lastVolume.current = saved || 0.62;
    const timer = setTimeout(() => { setVolumeState(saved); setMode(readMode()); }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
  }, [mode]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* storage unavailable */ }
  }, [volume]);

  // Fetch a fresh stream URL whenever a track is (re)selected.
  useEffect(() => {
    const audio = audioRef.current;
    const songId = track.songId;
    if (!audio || !songId) return;
    const controller = new AbortController();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    catalogApi.songSource(songId, controller.signal)
      .then(source => {
        if (controller.signal.aborted) return;
        setTrial(source.trial);
        audio.src = source.url;
        if (resumeAt.current !== null) { audio.currentTime = resumeAt.current; resumeAt.current = null; }
        if (source.trial) toast.info('当前仅可试听片段，登录有权限的账号可播放完整歌曲');
        if (latest.current.playing) audio.play().catch(() => undefined);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        latest.current.fail(error instanceof Error ? error.message : '无法获取播放地址');
      });
    return () => controller.abort();
  }, [track.songId, loadKey, latest]);

  // Desired play state → element. Skipped while the URL is still loading (no src yet).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    if (playing && audio.paused) {
      audio.play().catch(error => {
        // AbortError: a newer load/pause interrupted this play() call, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPlaying(false);
      });
    } else if (!playing && !audio.paused) {
      audio.pause();
    }
  }, [playing, loadKey]);

  // Element events → state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => setPosition(audio.currentTime);
    const onDuration = () => setMediaDuration(Number.isFinite(audio.duration) ? audio.duration : undefined);
    const onPlaying = () => { failures.current = 0; setStatus('ready'); };
    const onWaiting = () => setStatus('loading');
    const onEnded = () => {
      if (latest.current.mode === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        return;
      }
      latest.current.step(1, true);
    };
    const onError = () => {
      if (!audio.getAttribute('src')) return;
      // Stream links expire after ~20 minutes; refetch once and resume where we were.
      if (audio.currentTime > 0 && resumeAt.current === null) {
        resumeAt.current = audio.currentTime;
        setLoadKey(value => value + 1);
        return;
      }
      resumeAt.current = null;
      latest.current.fail('歌曲播放失败');
    };
    audio.addEventListener('timeupdate', sync);
    audio.addEventListener('seeked', sync);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', sync);
      audio.removeEventListener('seeked', sync);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [latest]);

  // timeupdate fires ~4×/s; sample every frame while playing so lyrics and the bar move smoothly.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audioRef.current) setPosition(audioRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const value = useMemo<PlayerState>(() => {
    const audio = () => audioRef.current;
    return {
      track, queue, playing, status, trial, volume, mode, lyricsOpen,
      duration: mediaDuration ?? (trial ? trial.end - trial.start : track.duration ?? 0),
      togglePlay: () => {
        if (!track.songId) { toast.info('从歌单、排行榜或搜索中选一首歌开始播放'); return; }
        if (status === 'error') { select(track, { remember: false }); return; }
        setPlaying(current => !current);
      },
      play: (next, nextQueue) => {
        if (nextQueue) setQueue(nextQueue);
        if (next.id === track.id && status !== 'error' && status !== 'idle') { setPlaying(current => !current); return; }
        failures.current = 0;
        select(next);
      },
      enqueue: tracks => setQueue(previous => {
        const known = new Set(previous.map(item => item.id));
        return [...previous.filter(item => item.songId), ...tracks.filter(item => !known.has(item.id))];
      }),
      previous: () => {
        // Like most players: 上一首 restarts the current song after the first few seconds.
        const element = audio();
        if (element && element.currentTime > 3) { element.currentTime = 0; setPosition(0); return; }
        step(-1);
      },
      next: () => step(1),
      seek: seconds => {
        const element = audio();
        if (!element || !element.getAttribute('src')) return;
        const max = Number.isFinite(element.duration) ? element.duration : seconds;
        element.currentTime = Math.max(0, Math.min(max, seconds));
        setPosition(element.currentTime);
      },
      setVolume: next => { if (next > 0) lastVolume.current = next; setVolumeState(next); },
      toggleMute: () => setVolumeState(current => (current > 0 ? 0 : lastVolume.current || 0.62)),
      cycleMode: () => {
        // Side effect stays outside the updater (updaters may run twice in strict mode).
        const next = playModes[(playModes.indexOf(mode) + 1) % playModes.length];
        setMode(next);
        toast.info(playModeLabels[next]);
      },
      openLyrics: () => setLyricsOpen(true),
      closeLyrics: () => setLyricsOpen(false),
    };
    // select/step only read refs and setters; they are recreated each render but behave identically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, track, playing, status, trial, mediaDuration, volume, mode, lyricsOpen]);

  // System media controls (keyboard media keys, OS now-playing panels).
  const controls = useLatest(value);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track.songId) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork: track.cover ? [{ src: track.cover, sizes: '200x200' }] : [],
    });
    const handlers: Array<[MediaSessionAction, () => void]> = [
      ['play', () => { if (!controls.current.playing) controls.current.togglePlay(); }],
      ['pause', () => { if (controls.current.playing) controls.current.togglePlay(); }],
      ['previoustrack', () => controls.current.previous()],
      ['nexttrack', () => controls.current.next()],
    ];
    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
    }
  }, [track, controls]);

  // Space toggles playback, unless typing or a control that uses Space itself has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Modal dialogs own the keyboard, except surfaces of the player itself (lyrics page).
      if (target?.closest('input, textarea, select, button, [contenteditable="true"], [role="slider"], [role="menu"], [role="dialog"]:not([data-player-surface])')) return;
      event.preventDefault();
      controls.current.togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controls]);

  return (
    <PlayerContext.Provider value={value}>
      <PositionContext.Provider value={position}>
        {children}
        <audio ref={audioRef} preload="auto" hidden />
      </PositionContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('PlayerProvider is required');
  return value;
}

/** Subscribe only where the playhead is drawn (progress bar, lyrics). */
export function usePlaybackPosition() {
  return useContext(PositionContext);
}

export function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
