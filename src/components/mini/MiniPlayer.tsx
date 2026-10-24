'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Maximize2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useMemo } from 'react';
import { LikeButton } from '@/components/account/LikeButton';
import { Cover } from '@/components/common/Cover';
import { PlayModeButton } from '@/components/player/controls';
import { usePlaybackPosition, usePlayer } from '@/components/player/player-store';
import { useTrackLyrics } from '@/components/player/use-track-lyrics';
import { isPlayable } from '@/types/music';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { activeLineIndex } from '@/server/music/lrc';
import { exitMini } from './use-mini-mode';
import styles from './MiniPlayer.module.css';

const RING = 2 * Math.PI * 21;

/** Current lyric line (song title when unsynced), swapped with a vertical slide. */
function LyricTicker() {
  const { track, trial } = usePlayer();
  const position = usePlaybackPosition();
  const lyrics = useTrackLyrics(track);
  const lines = useMemo(() => lyrics.data?.lines ?? [], [lyrics.data]);
  const prefs = useSettings();
  const index = prefs.miniShowLyrics && lyrics.data?.synced ? activeLineIndex(lines, position + (trial?.start ?? 0) + 0.25 + prefs.lyricsOffset) : -1;
  const line = index >= 0 ? lines[index] : undefined;
  const text = line?.text || track.artist || '选一首歌，开始聆听';
  return (
    <span className={styles.ticker} aria-live="off">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${index}:${text}`}
          className={cn(styles.tickerLine, line && styles.tickerLyric)}
          initial={{ y: 14, opacity: 0, filter: 'blur(3px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -14, opacity: 0, filter: 'blur(3px)' }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Play button wrapped in a ring that fills with playback progress. */
function RingPlay() {
  const player = usePlayer();
  const position = usePlaybackPosition();
  const ratio = player.duration > 0 ? Math.min(1, position / player.duration) : 0;
  const buffering = player.playing && player.status === 'loading';
  const label = player.playing ? '暂停' : '播放';
  return (
    <motion.button type="button" className={styles.ringPlay} onClick={player.togglePlay} aria-label={label} data-tooltip={label} data-tooltip-shortcut="Space" whileTap={{ scale: 0.9 }}>
      <svg viewBox="0 0 48 48" className={styles.ring} aria-hidden>
        <circle cx="24" cy="24" r="21" className={styles.ringTrack} />
        <circle cx="24" cy="24" r="21" className={styles.ringFill} strokeDasharray={RING} strokeDashoffset={RING * (1 - ratio)} />
      </svg>
      <span className={styles.ringGlyph}>
        {buffering ? <Loader2 size={16} className={styles.spin} /> : player.playing ? <Pause size={16} strokeWidth={0} fill="currentColor" /> : <Play size={16} strokeWidth={0} fill="currentColor" style={{ marginLeft: 2 }} />}
      </span>
    </motion.button>
  );
}

/**
 * Mini mode: the whole window becomes a floating capsule. The spinning record
 * and the live lyric line carry the "now playing" feel; controls surface on
 * hover so the resting bar stays calm. Empty areas drag the window.
 */
export function MiniPlayer() {
  const player = usePlayer();
  const { track } = player;
  const empty = !isPlayable(track);
  const miniSpin = useSettings().miniSpinRecord;
  return (
    <div className={styles.shell} data-theme="dark">
      <div className={styles.backdrop} aria-hidden>
        {!empty && <Cover seed={track.coverSeed} src={track.cover} className={styles.backdropCover} />}
      </div>

      <button type="button" className={styles.record} onClick={exitMini} aria-label="返回完整窗口" data-tooltip="返回完整窗口">
        <span className={cn(styles.disc, player.playing && miniSpin && styles.spinning)}>
          <Cover seed={track.coverSeed} src={track.cover} radius={999} className={styles.discCover} empty={empty} />
        </span>
        <span className={styles.recordHint}><Maximize2 size={14} strokeWidth={1.8} /></span>
      </button>

      <div className={styles.meta}>
        <strong data-tooltip={empty ? undefined : `${track.title} - ${track.artist}`} data-tooltip-overflow>{empty ? '未在播放' : track.title}</strong>
        <LyricTicker />
      </div>

      <div className={styles.controls}>
        <span className={styles.secondary}>
          {track.songId && <LikeButton songId={track.songId} source={track.source} size="sm" iconSize={15} />}
        </span>
        <IconButton label="上一首" size="sm" onClick={player.previous} disabled={!player.queue.length}><SkipBack size={16} strokeWidth={1.5} /></IconButton>
        <RingPlay />
        <IconButton label="下一首" size="sm" onClick={player.next} disabled={!player.queue.length}><SkipForward size={16} strokeWidth={1.5} /></IconButton>
        <span className={styles.secondary}><PlayModeButton size={15} /></span>
      </div>

      <div className={styles.windowButtons}>
        <IconButton label="返回完整窗口" size="sm" onClick={exitMini}><Maximize2 size={13} strokeWidth={1.6} /></IconButton>
        <IconButton label="关闭" size="sm" onClick={() => window.coco?.window.close()}><X size={14} strokeWidth={1.6} /></IconButton>
      </div>
    </div>
  );
}
