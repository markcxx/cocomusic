'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { ACCOUNT_RECHECK_EVENT } from '@/lib/account-client';
import { catalogApi, CatalogRequestError, type SongSource } from '@/lib/catalog-client';
import { desktop, localAudioUrl } from '@/lib/local-client';
import { loadPlayerState, meApi, QUEUE_LIMIT } from '@/lib/me-client';
import { emptyTrack } from '@/lib/mock-data';
import { recentPlays } from '@/lib/recent-plays';
import { needsSamples, settings as appSettings, useSettings } from '@/lib/settings';
import { useLatest } from '@/lib/use-latest';
import { requestKugouVerification } from '@/lib/kugou-verification';
import { isPlayable, type Track } from '@/types/music';
import { playModeLabels, playModes, randomOtherIndex, type PlayMode } from './play-mode';
import { DEFAULT_VOLUME, readMode, readVolume, saveMode, saveVolume } from './player-prefs';
import type { PlaybackStatus, PlayerState } from './player-types';
import { usePlayerIntegrations } from './use-player-integrations';
import { rampVolume } from './volume-ramp';
import { hasGraph, setGraphOutputDevice } from './visualizer/audio-graph';

export { playModeLabels, playModes, type PlayMode } from './play-mode';
export type { PlaybackStatus } from './player-types';

const PlayerContext = createContext<PlayerState | null>(null);
// Position changes every frame; isolating it keeps the rest of the UI from re-rendering at 60fps.
const PositionContext = createContext(0);

/** Queue saves are coalesced: a burst of edits (drag reorder, 加入队列 clicks) is one write. */
const QUEUE_SAVE_DELAY_MS = 600;

/**
 * Playback backed by a single <audio> element. Catalog songs fetch a fresh
 * stream URL (they expire); local files stream from the app server. `ended`
 * advances per play mode. Failing tracks are skipped, with a cap so a queue
 * of unplayable songs stops.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const mvMedia = useRef<HTMLVideoElement | null>(null);
  const mvSession = useRef<{ id: string; playing: boolean } | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [track, setTrack] = useState(emptyTrack);
  // Bumped to (re)load the current track, including the same one again.
  const [loadKey, setLoadKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number>();
  const [trial, setTrial] = useState<SongSource['trial']>();
  const [level, setLevel] = useState<string>();
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const lastVolume = useRef(DEFAULT_VOLUME);
  const [mode, setMode] = useState<PlayMode>('loop');
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  /** The saved queue was read back; only then may changes overwrite it. */
  const [queueSynced, setQueueSynced] = useState(false);
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
    mvMedia.current?.pause();
    mvSession.current = null;
    setTrack(next);
    setPosition(0);
    setMediaDuration(undefined);
    setTrial(undefined);
    setLevel(undefined);
    setStatus(isPlayable(next) ? 'loading' : 'idle');
    setPlaying(options.autoplay !== false && isPlayable(next));
    recorded.current = null;
    setLoadKey(value => value + 1);
  };

  /** Nothing left to play: back to the empty state. */
  const stop = () => {
    mvMedia.current?.pause();
    mvSession.current = null;
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

  // Restore saved volume and play mode once mounted (the desktop bridge is browser-only),
  // then the queue the app server keeps.
  useEffect(() => {
    const saved = readVolume();
    lastVolume.current = saved || DEFAULT_VOLUME;
    let cancelled = false;
    const timer = setTimeout(() => {
      setVolumeState(saved);
      setMode(readMode());
      setRestored(true);
    }, 0);
    // Saving starts only once the saved state is known to be complete (see loadPlayerState).
    void loadPlayerState().then(stored => {
      if (cancelled || !stored) return;
      // Something started playing meanwhile (an opened file, a click): that wins.
      const { queue: live, track: current } = latest.current;
      if (!live.length && !isPlayable(current)) {
        const prefsNow = appSettings.get();
        const start = stored.queue.find(item => item.id === stored.currentId) ?? stored.queue[0];
        if (stored.queue.length) setQueue(stored.queue);
        if (prefsNow.resumeOnLaunch && start) {
          // Restored paused: autoplay on launch would be a surprise.
          const at = prefsNow.resumePosition && stored.position?.id === start.id ? stored.position.t : 0;
          if (at > 0) resumeAt.current = at;
          latest.current.select(start, { autoplay: false, remember: false });
          if (at > 0) setPosition(at);
        }
      }
      setQueueSynced(true);
    });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [latest]);

  useEffect(() => {
    if (!restored) return;
    saveMode(mode);
  }, [mode, restored]);

  useEffect(() => {
    if (!queueSynced) return;
    const timer = setTimeout(() => {
      meApi.saveQueue(queue, track.id).catch(error => console.error('[player] could not save the queue', error));
    }, QUEUE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queue, track.id, queueSynced]);

  // Remember where we are in the song (for 设置 › 播放 › 恢复播放进度), at most every 2s.
  const positionSaved = useRef(0);
  useEffect(() => {
    if (!queueSynced || !isPlayable(track)) return;
    const now = Date.now();
    if (now - positionSaved.current < 2000 && position > 0) return;
    positionSaved.current = now;
    meApi.savePosition({ id: track.id, t: Math.round(position) }).catch(() => undefined);
  }, [position, track, queueSynced]);

  useEffect(() => {
    // Moving the slider mid-fade wins: cancel the ramp (a fade-out still pauses via `playing`).
    if (audioRef.current && fade.current && latest.current.playing) { fade.current(); fade.current = null; }
    if (audioRef.current && !fade.current) audioRef.current.volume = volume;
    if (!restored) return;
    saveVolume(volume);
  }, [volume, latest, restored]);

  // Load the stream whenever a track is (re)selected: local file, or a fresh catalog URL.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlayable(track)) return;
    const controller = new AbortController();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    const attach = (url: string) => {
      // CORS mode lets the visualizer read online streams; only the desktop app
      // adds the CORS header (a plain browser would fail to load them).
      // Once the element feeds the visualizer graph it must stay in CORS mode:
      // a tainted stream would play silent through Web Audio.
      // Users without a visualizer keep the plain (non-CORS) request.
      const wantsSamples = (desktop() && needsSamples(appSettings.get().lyricsVisualizer, appSettings.get().lyricsVinylEffect)) || hasGraph(audio);
      if (wantsSamples && !track.localId) audio.crossOrigin = 'anonymous';
      else if (!hasGraph(audio)) audio.removeAttribute('crossorigin');
      audio.src = url;
      if (resumeAt.current !== null) { audio.currentTime = resumeAt.current; resumeAt.current = null; }
      if (latest.current.playing) audio.play().catch(() => undefined);
    };
    if (track.localId) {
      attach(localAudioUrl(track.localId));
      return () => controller.abort();
    }
    catalogApi.songSource(track.songId!, controller.signal, appSettings.get().quality, track.source)
      .then(source => {
        if (controller.signal.aborted) return;
        setTrial(source.trial);
        setLevel(source.level);
        if (source.trial && appSettings.get().trialNotice) toast.info('当前仅可试听片段，登录有权限的账号可播放完整歌曲');
        // Previews can mean the login lapsed: let the account store verify it now.
        if (source.trial) window.dispatchEvent(new Event(ACCOUNT_RECHECK_EVENT));
        attach(source.url);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof CatalogRequestError && error.status === 401) {
          setStatus('error'); setPlaying(false);
          toast.error(error.message);
          return;
        }
        if (error instanceof CatalogRequestError && error.code === 20028) {
          setStatus('error'); setPlaying(false);
          requestKugouVerification(error.verificationUrl);
          toast.error(error.message);
          return;
        }
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
    // Routed through the visualizer's AudioContext, the context picks the device.
    setGraphOutputDevice(audio, prefs.outputDevice);
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
      if (mvSession.current) { audio.pause(); return; }
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
      if (mvSession.current) return;
      if (latest.current.mode === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        return;
      }
      latest.current.step(1, true);
    };
    const onError = () => {
      if (mvSession.current || !audio.getAttribute('src')) return;
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
      track, queue, playing, status, trial, level, volume, mode, lyricsOpen, queueOpen,
      audioElement: audio,
      setMvMedia: media => { mvMedia.current = media; if (media) media.volume = volume; },
      openMv: () => {
        if (mvSession.current) return;
        mvSession.current = { id: track.id, playing };
        fade.current?.(); fade.current = null;
        audio()?.pause();
        setPlaying(false);
      },
      closeMv: () => {
        mvMedia.current?.pause();
        const saved = mvSession.current;
        mvSession.current = null;
        if (saved?.id === track.id && saved.playing) setPlaying(true);
      },
      reloadStream: () => {
        const element = audio();
        if (!isPlayable(track) || track.localId) return;
        if (element && element.currentTime > 0) resumeAt.current = element.currentTime;
        setLoadKey(value => value + 1);
      },
      duration: mediaDuration ?? (trial ? trial.end - trial.start : track.duration ?? 0),
      togglePlay: () => {
        if (mvSession.current) {
          // Music takes over from the MV: pause the video and resume the song.
          mvMedia.current?.pause();
          mvSession.current = null;
          if (isPlayable(track)) setPlaying(true);
          return;
        }
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
      queueIds: () => latest.current.queue.map(item => item.id).join('|'),
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
      setVolume: next => { if (next > 0) lastVolume.current = next; setVolumeState(next); if (mvMedia.current && mvMedia.current.volume !== next) mvMedia.current.volume = next; },
      toggleMute: () => setVolumeState(current => (current > 0 ? 0 : lastVolume.current || DEFAULT_VOLUME)),
      cycleMode: () => {
        // Side effect stays outside the updater (updaters may run twice in strict mode).
        const next = playModes[(playModes.indexOf(mode) + 1) % playModes.length];
        setMode(next);
        toast.info(playModeLabels[next]);
      },
      setMode,
      openLyrics: () => setLyricsOpen(true),
      closeLyrics: () => setLyricsOpen(false),
      setQueueOpen,
    };
    // select/step/stop only read refs and setters; they are recreated each render but behave identically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, track, playing, status, trial, level, mediaDuration, volume, mode, lyricsOpen, queueOpen]);

  usePlayerIntegrations(value, position, { audioRef, mvMedia, mvSession });

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
