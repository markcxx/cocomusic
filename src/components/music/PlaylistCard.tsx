'use client';

import { motion } from 'framer-motion';
import { Headphones, Play } from 'lucide-react';
import { Cover } from '@/components/common/Cover';
import { riseItem } from '@/components/common/motion';
import { formatCount, type CatalogPlaylist } from '@/lib/catalog-client';
import styles from './PlaylistCard.module.css';

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
      <div className={styles.coverFrame}>
        <button type="button" className={styles.coverButton} onClick={() => onOpen?.(playlist)} aria-label={`打开：${playlist.name}`}>
          <Cover seed={`${playlist.source}:${playlist.id}`} src={playlist.cover} className={styles.cover} />
          <span className={styles.scrim} aria-hidden />
          {playlist.playCount ? (
            <span className={styles.plays} aria-hidden>
              <Headphones size={12} strokeWidth={1.6} />
              {formatCount(playlist.playCount)}
            </span>
          ) : null}
        </button>
        <motion.button
          type="button"
          className={styles.play}
          onClick={() => onPlay?.(playlist)}
          aria-label={`播放：${playlist.name}`}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Play size={20} strokeWidth={0} fill="currentColor" />
        </motion.button>
      </div>
      <button type="button" className={styles.title} onClick={() => onOpen?.(playlist)} tabIndex={-1} data-tooltip={playlist.name} data-tooltip-overflow>{playlist.name}</button>
      {meta && <span className={styles.meta}>{meta}</span>}
    </motion.div>
  );
}
