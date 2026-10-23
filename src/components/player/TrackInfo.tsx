'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { Cover } from '@/components/common/Cover';
import { usePlayer } from './player-store';
import styles from './PlayerBar.module.css';

/** Now-playing card: one hover target that opens the full-screen lyrics drawer. */
export function TrackInfo() {
  const { track, openLyrics } = usePlayer();
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
          initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className={styles.thumb}>
            <Cover seed={track.coverSeed} src={track.cover} size={52} radius={8} />
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
