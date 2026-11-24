'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Headphones, Play } from 'lucide-react';
import { Cover } from '@/components/common/Cover';
import { riseItem } from '@/components/common/motion';
import { formatCount, type CatalogPlaylist } from '@/lib/catalog-client';
import styles from './PlaylistCard.module.css';

export function PlaylistCover({ name, seed, cover, playCount, onOpen, onPlay, playDisabled, children }: {
  name: string;
  seed: string;
  cover?: string;
  playCount?: number;
  onOpen: () => void;
  onPlay: () => void;
  playDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={styles.coverFrame}>
      <button type="button" className={styles.coverButton} onClick={onOpen} aria-label={`打开：${name}`}>
        <Cover seed={seed} src={cover} className={styles.cover} />
        {children}
        <span className={styles.scrim} aria-hidden />
        {playCount ? (
          <span className={styles.plays} aria-hidden>
            <Headphones size={12} strokeWidth={1.6} />
            {formatCount(playCount)}
          </span>
        ) : null}
      </button>
      <motion.button
        type="button"
        className={styles.play}
        onClick={onPlay}
        disabled={playDisabled}
        aria-label={`播放：${name}`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Play size={20} strokeWidth={0} fill="currentColor" />
      </motion.button>
    </div>
  );
}

/** Square cover; hover lays a scrim over it with a centered play button. */
export function PlaylistCard({ playlist, subtitle, onOpen, onPlay }: {
  playlist: CatalogPlaylist;
  /** Overrides the default "N首 · tag" line (e.g. album artist). */
  subtitle?: string;
  onOpen?: (playlist: CatalogPlaylist) => void;
  onPlay?: (playlist: CatalogPlaylist) => void;
}) {
  const meta = subtitle ?? [playlist.trackCount ? `${playlist.trackCount}首` : '', playlist.tag].filter(Boolean).join(' · ');
  return (
    <motion.div className={styles.card} variants={riseItem}>
      <PlaylistCover name={playlist.name} seed={`${playlist.source}:${playlist.id}`} cover={playlist.cover} playCount={playlist.playCount}
        onOpen={() => onOpen?.(playlist)} onPlay={() => onPlay?.(playlist)} />
      <button type="button" className={styles.title} onClick={() => onOpen?.(playlist)} tabIndex={-1} data-tooltip={playlist.name} data-tooltip-overflow>{playlist.name}</button>
      {meta && <span className={styles.meta}>{meta}</span>}
    </motion.div>
  );
}
