'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { Cover } from '@/components/common/Cover';
import { isEmptyTrack } from '@/lib/mock-data';
import { useSettings } from '@/lib/settings';
import { usePlayer } from './player-store';
import styles from './PlayerBar.module.css';

/** Track change: the card slides and blurs out/in; Fluent keeps it still and only cross-fades. */
const SWAP = {
  initial: { opacity: 0, y: 14, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -14, filter: 'blur(4px)' },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
} as const;
const FLUENT_SWAP = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.45, ease: 'easeInOut' },
} as const;

/**
 * Now-playing card: one hover target that opens the full-screen lyrics drawer.
 * Before anything is chosen it shows a neutral placeholder and a hint instead.
 */
export function TrackInfo() {
  const { track, openLyrics } = usePlayer();
  const empty = isEmptyTrack(track);
  // Fluent: the cover is the bar's full height, flush with the window edge.
  const fluent = useSettings().windowEffect === 'fluent';
  const size = fluent ? 88 : 52;
  const radius = fluent ? 0 : 8;

  if (empty) {
    return (
      <div className={styles.trackButton} data-empty>
        <span className={styles.trackInfo}>
          <span className={styles.thumb}>
            <Cover seed="empty" empty size={size} radius={radius} />
          </span>
          <span className={styles.meta}>
            <strong className={styles.emptyTitle}>未在播放</strong>
            <span>选一首歌，开始聆听</span>
          </span>
        </span>
      </div>
    );
  }

  return (
    <motion.button
      type="button"
      className={styles.trackButton}
      onClick={openLyrics}
      aria-label={`打开歌词：${track.title} - ${track.artist}`}
      data-tooltip="打开歌词"
      whileTap={{ scale: 0.985 }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={track.id}
          className={styles.trackInfo}
          {...(fluent ? FLUENT_SWAP : SWAP)}
        >
          <span className={styles.thumb}>
            <Cover seed={track.coverSeed} src={track.cover} size={size} radius={radius} />
            {/* CSS-driven so the parent's track-change animation cannot leave it visible. */}
            <span className={styles.thumbHint} aria-hidden>
              <ChevronUp size={22} strokeWidth={1.6} className={styles.thumbHintIcon} />
            </span>
          </span>
          <span className={styles.meta}>
            <strong>{track.title}</strong>
            <span>{track.artist}{track.album ? ` · ${track.album}` : ''}</span>
          </span>
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
