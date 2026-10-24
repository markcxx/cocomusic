'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { LikeButton } from '@/components/account/LikeButton';
import { TrackMenuButton } from '@/components/account/TrackMenuButton';
import { Cover } from '@/components/common/Cover';
import { riseItem } from '@/components/common/motion';
import { usePlayer } from '@/components/player/player-store';
import { cn } from '@/lib/cn';
import type { CatalogTrack } from '@/lib/catalog-client';
import type { Track } from '@/types/music';
import { Equalizer } from './Equalizer';
import styles from './TrackTile.module.css';

/** Flat song row that only reveals its card surface and actions on hover. */
export function TrackTile({ track, queue, item }: { track: Track; queue: Track[]; /** Catalog source track: enables like / add-to-playlist. */ item?: CatalogTrack }) {
  const player = usePlayer();
  const current = player.track.id === track.id;
  const playing = current && player.playing;

  return (
    <motion.div variants={riseItem} className={cn(styles.tile, current && styles.current)} onDoubleClick={() => player.play(track, queue)}>
      <button type="button" className={styles.coverButton} onClick={() => player.play(track, queue)} aria-label={`${playing ? '暂停' : '播放'}${track.title}`}>
        <Cover seed={track.coverSeed} src={track.cover} size={48} radius={8} />
        <span className={styles.coverOverlay} aria-hidden>
          <AnimatePresence mode="wait" initial={false}>
            {playing ? (
              <motion.span key="eq" className={styles.overlayIcon} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
                <Equalizer className={styles.eq} />
                <Pause size={16} strokeWidth={0} fill="currentColor" className={styles.pauseOnHover} />
              </motion.span>
            ) : (
              <motion.span key="play" className={styles.overlayIcon} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
                <Play size={16} strokeWidth={0} fill="currentColor" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </button>
      <div className={styles.meta}>
        <strong data-tooltip={track.title} data-tooltip-overflow>{track.title}</strong>
        <span data-tooltip={`${track.artist}${track.album ? ` · ${track.album}` : ''}`} data-tooltip-overflow>{track.artist}{track.album ? ` · ${track.album}` : ''}</span>
      </div>
      <div className={styles.actions}>
        {item && (
          <>
            <LikeButton songId={item.id} source={item.source} />
            <TrackMenuButton track={item} />
          </>
        )}
      </div>
    </motion.div>
  );
}
