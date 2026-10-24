'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { catalogApi, type SongSource } from '@/lib/catalog-client';
import { localAudioUrl } from '@/lib/local-client';
import { emptyTrack } from '@/lib/mock-data';
import { recentPlays } from '@/lib/recent-plays';
import { settings as appSettings, useSettings } from '@/lib/settings';
import { useLatest } from '@/lib/use-latest';
import { isPlayable, type Track } from '@/types/music';
import { broadcastPlayer } from './player-broadcast';

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
  queueOpen: boolean;
  togglePlay: () => void;
  play: (track: Track, queue?: Track[]) => void;
  /**
   * Double-click on a list row, per 设置 › 播放 › 双击歌曲: replace the queue with
   * the list (default), or only insert this song after the current one.
   */
  playFromList: (track: Track, list: Track[]) => void;
  /** Append to the end of the play queue (skips tracks already queued). */
  enqueue: (tracks: Track[]) => void;
  /** Insert right after the current track (下一首播放); moves it if already queued. */
  playNext: (tracks: Track[]) => void;
  /** Remove from the queue; removing the playing track moves on to the next. */
  removeFromQueue: (id: string) => void;
  /** Move a queued track to another position (drag reorder). */
  moveInQueue: (id: string, toIndex: number) => void;
  /** Empty the queue and stop. */
  clearQueue: () => void;
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
  setQueueOpen: (open: boolean) => void;
};

const PlayerContext = createContext<PlayerState | null>(null);
// Position changes every frame; isolating it keeps the rest of the UI from re-rendering at 60fps.
const PositionContext = createContext(0);

/** Uniform pick among the other `length - 1` positions (shuffle never repeats the current song). */
function randomOtherIndex(current: number, length: number) {
  const pick = Math.floor(Math.random() * (length - 1));
  return current >= 0 && pick >= current ? pick + 1 : pick;
}

/**
 * Ramp the element's volume over `ms` (ease-in-out), cancelling a previous ramp.
 * Returns the cancel function; `done` runs when the ramp completes.
 */
function rampVolume(audio: HTMLAudioElement, from: number, to: number, ms: number, previous: (() => void) | null, done?: () => void) {
  previous?.();
  let frame = 0;
  const started = performance.now();
  audio.volume = Math.max(0, Math.min(1, from));
  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / ms);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * eased));
    if (t < 1) frame = requestAnimationFrame(tick);
    else done?.();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

const VOLUME_KEY = 'coco:volume';
const MODE_KEY = 'coco:play-mode';
const QUEUE_KEY = 'coco:queue';
const POSITION_KEY = 'coco:position';
const QUEUE_LIMIT = 2000;
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
const readPosition = (id: string) => {
  try {
    const saved = JSON.parse(readStored(POSITION_KEY) ?? 'null') as { id?: unknown; t?: unknown } | null;
    return saved && saved.id === id && typeof saved.t === 'number' && saved.t > 0 ? saved.t : 0;
  } catch { return 0; }
};
/** Saved queue + current track (restored paused). */
const readQueue = (): { queue: Track[]; current?: Track } => {
  try {
    const parsed = JSON.parse(readStored(QUEUE_KEY) ?? 'null') as { queue?: unknown; currentId?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.queue)) return { queue: [] };
    const queue = (parsed.queue as Track[]).filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && isPlayable(item)).slice(0, QUEUE_LIMIT);
    return { queue, current: queue.find(item => item.id === parsed.currentId) ?? queue[0] };
  } catch {
    return { queue: [] };
  }
};

/**
 * Playback backed by a single <audio> element. Catalog songs fetch a fresh
 * stream URL (they expire); local files stream from the app server. `ended`
 * advances per play mode. Failing tracks are skipped, with a cap so a queue
 * of unplayable songs stops.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [track, setTrack] = useState(emptyTrack);
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
  const [queueOpen, setQueueOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const prefs = useSettings();

  const failures = useRef(0);
  /** Resume point after re-fetching an expired stream URL. */
  const resumeAt = useRef<number | null>(null);
  /** Played tracks, so 上一首 in shuffle mode walks back instead of rolling again. */
  const history = useRef<Track[]>([]);
  /** Track id already counted in 最近播放 for the current load (count once per play). */
  const recorded = useRef<string | null>(null);

  const select = (next: Track, options: { autoplay?: boolean; remember?: boolean } = {}) => {
    if (options.remember !== false && isPlayable(latest.current.track)) history.current = [...history.current.slice(-49), latest.current.track];
    setTrack(next);
    setPosition(0);
    setMediaDuration(undefined);
    setTrial(undefined);
    setStatus(isPlayable(next) ? 'loading' : 'idle');
    setPlaying(options.autoplay !== false && isPlayable(next));
    recorded.current = null;
    setLoadKey(value => value + 1);
  };

  /** Nothing left to play: back to the empty state. */
  const stop = () => {
    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    setTrack(emptyTrack);
    setPlaying(false);
    setStatus('idle');
    setPosition(0);
    setMediaDuration(undefined);
    setTrial(undefined);
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
    const canSkip = appSettings.get().skipOnError && list.filter(isPlayable).length > 1 && failures.current < Math.min(list.length, 5);
    toast.error(canSkip ? `${message}，已跳到下一首` : message);
    if (canSkip) { step(1); return; }
    failures.current = 0;
    setStatus('error');
    setPlaying(false);
  };

  const latest = useLatest({ queue, track, mode, playing, step, fail, select, volume });
  /** Running volume ramp (fade in/out); cancelled when a new one starts. */
  const fade = useRef<(() => void) | null>(null);

  // Restore saved volume, play mode and queue once mounted (localStorage is browser-only).
  useEffect(() => {
    const saved = readVolume();
    lastVolume.current = saved || 0.62;
    const timer = setTimeout(() => {
      setVolumeState(saved);
      setMode(readMode());
      const stored = readQueue();
      const prefsNow = appSettings.get();
      if (stored.queue.length) setQueue(stored.queue);
      if (prefsNow.resumeOnLaunch && stored.current) {
        // Restored paused: autoplay on launch would be a surprise.
        const at = prefsNow.resumePosition ? readPosition(stored.current.id) : 0;
        if (at > 0) resumeAt.current = at;
        latest.current.select(stored.current, { autoplay: false, remember: false });
        if (at > 0) setPosition(at);
      }
      setRestored(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [latest]);

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
  }, [mode]);

  useEffect(() => {
    if (!restored) return;
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue: queue.slice(0, QUEUE_LIMIT), currentId: track.id })); } catch { /* storage full */ }
  }, [queue, track.id, restored]);

  // Remember where we are in the song (for 设置 › 播放 › 恢复播放进度), at most every 2s.
  const positionSaved = useRef(0);
  useEffect(() => {
    if (!restored || !isPlayable(track)) return;
    const now = Date.now();
    if (now - positionSaved.current < 2000 && position > 0) return;
    positionSaved.current = now;
    try { localStorage.setItem(POSITION_KEY, JSON.stringify({ id: track.id, t: Math.round(position) })); } catch { /* storage full */ }
  }, [position, track, restored]);

  useEffect(() => {
    // Moving the slider mid-fade wins: cancel the ramp (a fade-out still pauses via `playing`).
    if (audioRef.current && fade.current && latest.current.playing) { fade.current(); fade.current = null; }
    if (audioRef.current && !fade.current) audioRef.current.volume = volume;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* storage unavailable */ }
  }, [volume, latest]);

  // Load the stream whenever a track is (re)selected: local file, or a fresh catalog URL.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlayable(track)) return;
    const controller = new AbortController();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    const attach = (url: string) => {
      audio.src = url;
      if (resumeAt.current !== null) { audio.currentTime = resumeAt.current; resumeAt.current = null; }
      if (latest.current.playing) audio.play().catch(() => undefined);
    };
    if (track.localId) {
      attach(localAudioUrl(track.localId));
      return () => controller.abort();
    }
    catalogApi.songSource(track.songId!, controller.signal, appSettings.get().quality)
      .then(source => {
        if (controller.signal.aborted) return;
        setTrial(source.trial);
        if (source.trial) toast.info('当前仅可试听片段，登录有权限的账号可播放完整歌曲');
        attach(source.url);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        latest.current.fail(error instanceof Error ? error.message : '无法获取播放地址');
      });
    return () => controller.abort();
    // Keyed on identity (id) and loadKey; track object changes alone must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, loadKey, latest]);

  // 设置 › 播放: speed (keeps pitch) and output device.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = prefs.playbackRate;
    audio.defaultPlaybackRate = prefs.playbackRate;
    audio.preservesPitch = true;
  }, [prefs.playbackRate, loadKey]);
  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!audio?.setSinkId) return;
    audio.setSinkId(prefs.outputDevice).catch(() => {
      // Device unplugged or permission denied: fall back to the system default.
      if (prefs.outputDevice) { toast.error('所选输出设备不可用，已切换到系统默认'); appSettings.set('outputDevice', ''); }
    });
  }, [prefs.outputDevice]);

  // Desired play state → element. Skipped while the URL is still loading (no src yet).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    const fadeMs = appSettings.get().fadeMs;
    if (playing && audio.paused) {
      // Fade in to the current volume; the handle clears when done so the slider owns volume again.
      if (fadeMs) fade.current = rampVolume(audio, 0, latest.current.volume, fadeMs, fade.current, () => { fade.current = null; });
      audio.play().catch(error => {
        // AbortError: a newer load/pause interrupted this play() call, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPlaying(false);
      });
    } else if (!playing && !audio.paused) {
      if (!fadeMs) { audio.pause(); return; }
      fade.current = rampVolume(audio, audio.volume, 0, fadeMs, fade.current, () => { fade.current = null; audio.pause(); audio.volume = latest.current.volume; });
    }
  }, [playing, loadKey, latest]);

  // Element events → state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => setPosition(audio.currentTime);
    const onDuration = () => setMediaDuration(Number.isFinite(audio.duration) ? audio.duration : undefined);
    const onPlaying = () => {
      failures.current = 0;
      setStatus('ready');
      // Count a play once the audio actually starts (not on mere selection).
      const current = latest.current.track;
      if (recorded.current !== current.id) {
        recorded.current = current.id;
        recentPlays.add(current);
        if (appSettings.get().toastOnTrackChange && !document.hasFocus()) toast.info(`正在播放：${current.title} - ${current.artist}`);
      }
    };
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
      const current = latest.current.track;
      // Catalog links expire after ~20 minutes; refetch once and resume where we were.
      if (!current.localId && audio.currentTime > 0 && resumeAt.current === null) {
        resumeAt.current = audio.currentTime;
        setLoadKey(value => value + 1);
        return;
      }
      resumeAt.current = null;
      latest.current.fail(current.localId ? '本地文件无法播放（可能已被移动或删除）' : '歌曲播放失败');
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
    const currentIndex = () => queue.findIndex(item => item.id === track.id);
    return {
      track, queue, playing, status, trial, volume, mode, lyricsOpen, queueOpen,
      duration: mediaDuration ?? (trial ? trial.end - trial.start : track.duration ?? 0),
      togglePlay: () => {
        if (!isPlayable(track)) { toast.info('从歌单、排行榜、本地音乐或搜索中选一首歌开始播放'); return; }
        if (status === 'error') { select(track, { remember: false }); return; }
        setPlaying(current => !current);
      },
      play: (next, nextQueue) => {
        if (nextQueue) setQueue(nextQueue.slice(0, QUEUE_LIMIT));
        else if (!queue.some(item => item.id === next.id)) {
          // A single song (search result, opened file) joins the queue after the current one.
          const at = currentIndex() + 1;
          setQueue([...queue.slice(0, at), next, ...queue.slice(at)]);
        }
        if (next.id === track.id && status !== 'error' && status !== 'idle') { setPlaying(current => !current); return; }
        failures.current = 0;
        select(next);
      },
      playFromList: (next, list) => {
        if (appSettings.get().doubleClick === 'insert') {
          if (next.id === track.id && status !== 'error' && status !== 'idle') { setPlaying(current => !current); return; }
          const rest = queue.filter(item => item.id !== next.id);
          const at = rest.findIndex(item => item.id === track.id) + 1;
          setQueue([...rest.slice(0, at), next, ...rest.slice(at)]);
          failures.current = 0;
          select(next);
          return;
        }
        if (next.id === track.id && status !== 'error' && status !== 'idle') { setQueue(list.slice(0, QUEUE_LIMIT)); setPlaying(current => !current); return; }
        setQueue(list.slice(0, QUEUE_LIMIT));
        failures.current = 0;
        select(next);
      },
      enqueue: tracks => setQueue(previous => {
        const known = new Set(previous.map(item => item.id));
        return [...previous, ...tracks.filter(item => !known.has(item.id))].slice(0, QUEUE_LIMIT);
      }),
      playNext: tracks => {
        const ids = new Set(tracks.map(item => item.id));
        setQueue(previous => {
          const rest = previous.filter(item => !ids.has(item.id) || item.id === track.id);
          const at = rest.findIndex(item => item.id === track.id) + 1;
          return [...rest.slice(0, at), ...tracks.filter(item => item.id !== track.id), ...rest.slice(at)].slice(0, QUEUE_LIMIT);
        });
        if (!isPlayable(track) && tracks[0]) select(tracks[0]);
      },
      removeFromQueue: id => {
        const index = queue.findIndex(item => item.id === id);
        if (index < 0) return;
        const rest = queue.filter(item => item.id !== id);
        setQueue(rest);
        if (id !== track.id) return;
        // Removing the playing song: continue with what was after it.
        if (!rest.length) { stop(); return; }
        select(rest[Math.min(index, rest.length - 1)], { autoplay: playing });
      },
      moveInQueue: (id, toIndex) => setQueue(previous => {
        const from = previous.findIndex(item => item.id === id);
        if (from < 0) return previous;
        const copy = previous.slice();
        const [item] = copy.splice(from, 1);
        copy.splice(Math.max(0, Math.min(copy.length, toIndex)), 0, item);
        return copy;
      }),
      clearQueue: () => { setQueue([]); history.current = []; stop(); },
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
      setQueueOpen,
    };
    // select/step/stop only read refs and setters; they are recreated each render but behave identically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, track, playing, status, trial, mediaDuration, volume, mode, lyricsOpen, queueOpen]);

  // System media controls (keyboard media keys, OS now-playing panels).
  const controls = useLatest(value);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !isPlayable(track)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork: track.cover ? [{ src: new URL(track.cover, window.location.href).href, sizes: '200x200' }] : [],
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

  // Desktop lyrics window and other views follow playback over a broadcast channel.
  useEffect(() => { broadcastPlayer.publishTrack(track, trial); }, [track, trial]);
  useEffect(() => { broadcastPlayer.publishClock(position, playing); }, [position, playing]);
  useEffect(() => broadcastPlayer.onCommand(command => {
    if (command === 'toggle') controls.current.togglePlay();
    else if (command === 'next') controls.current.next();
    else if (command === 'previous') controls.current.previous();
    else if (command === 'sync') broadcastPlayer.publishTrack(controls.current.track, controls.current.trial, true);
  }), [controls]);

  // In-app shortcuts (设置 › 快捷键): Space play/pause; ⌘/Ctrl + ←/→ previous/next; ⌘/Ctrl + ↑/↓ volume.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!appSettings.get().appShortcuts || event.repeat || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      const combo = (event.metaKey || event.ctrlKey) && !event.shiftKey;
      if (combo && !typing) {
        const player = controls.current;
        const actions: Record<string, () => void> = {
          ArrowRight: player.next,
          ArrowLeft: player.previous,
          ArrowUp: () => player.setVolume(Math.min(1, Math.round((player.volume + 0.05) * 100) / 100)),
          ArrowDown: () => player.setVolume(Math.max(0, Math.round((player.volume - 0.05) * 100) / 100)),
        };
        const action = actions[event.key];
        if (action) { event.preventDefault(); action(); }
        return;
      }
      if (event.code !== 'Space' || event.metaKey || event.ctrlKey) return;
      // Modal dialogs own the keyboard, except surfaces of the player itself (lyrics page).
      if (typing || target?.closest('button, [role="slider"], [role="menu"], [role="dialog"]:not([data-player-surface])')) return;
      event.preventDefault();
      controls.current.togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controls]);

  // System-wide shortcuts registered by the main process (设置 › 快捷键 › 全局快捷键).
  useEffect(() => window.coco?.app?.onShortcut(action => {
    const player = controls.current;
    if (action === 'toggle') player.togglePlay();
    else if (action === 'next') player.next();
    else if (action === 'previous') player.previous();
    else if (action === 'volume-up') player.setVolume(Math.min(1, Math.round((player.volume + 0.05) * 100) / 100));
    else if (action === 'volume-down') player.setVolume(Math.max(0, Math.round((player.volume - 0.05) * 100) / 100));
    else if (action === 'lyrics') window.coco?.lyrics?.setDesktop('toggle');
  }), [controls]);

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
