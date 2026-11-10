import type { SongSource } from '@/lib/catalog-client';
import type { Track } from '@/types/music';
import type { PlayMode } from './play-mode';

/** idle: nothing playable selected · loading: fetching URL or buffering · ready · error: this track failed. */
export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'error';

export type PlayerState = {
  track: Track;
  queue: Track[];
  /** Desired state: true while playing or about to (loading). */
  playing: boolean;
  status: PlaybackStatus;
  /** Seconds of the loaded stream (the clip length for previews). */
  duration: number;
  /** Set when only a preview clip plays; lyric time = position + trial.start. */
  trial?: SongSource['trial'];
  /** Quality level of the loaded online stream (standard / exhigh / lossless…). */
  level?: string;
  /** Re-fetch the current song's stream (e.g. after changing quality), keeping the position. */
  reloadStream: () => void;
  /** The playback element (read-only use, e.g. the audio visualizer). */
  audioElement: () => HTMLAudioElement | null;
  /**
   * MV and music are exclusive: the video calls `openMv` when it starts (music pauses),
   * `closeMv` when its page goes away (music resumes if it was playing the same track).
   */
  openMv: () => void;
  closeMv: () => void;
  setMvMedia: (media: HTMLVideoElement | null) => void;
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
  /** Ids of the live queue joined by "|" (read now, not at render), to tell whether it changed. */
  queueIds: () => string;
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
  /** Pick a play mode directly (Dock / tray menu). */
  setMode: (mode: PlayMode) => void;
  openLyrics: () => void;
  closeLyrics: () => void;
  setQueueOpen: (open: boolean) => void;
};
