'use client';

import { motion } from 'framer-motion';
import { HardDrive, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { LikeButton } from '@/components/account/LikeButton';
import { Cover } from '@/components/common/Cover';
import { riseItem, staggerList } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { Equalizer } from '@/components/music/Equalizer';
import { formatTime, usePlayer } from '@/components/player/player-store';
import { cn } from '@/lib/cn';
import type { Track } from '@/types/music';
import styles from './TrackList.module.css';

export type TrackRow = { track: Track; meta?: ReactNode; actions?: ReactNode };

/**
 * List of player tracks (local files, recent plays): index/play, cover, title,
 * a free meta column and per-row actions. Double-click plays with the whole
 * list as the queue.
 */
export function TrackList({ rows, metaLabel, emptyText = '暂无歌曲' }: { rows: TrackRow[]; metaLabel?: string; emptyText?: ReactNode }) {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const queue = rows.map(row => row.track);
  if (!rows.length) return <div className={styles.empty}>{emptyText}</div>;
  return (
    <div className={styles.table} role="table" aria-label="歌曲列表">
      <div className={cn(styles.row, styles.head)} role="row">
        <span role="columnheader" className={styles.index}>#</span>
        <span role="columnheader">歌曲</span>
        <span role="columnheader">{metaLabel ?? '专辑'}</span>
        <span role="columnheader" className={styles.duration}>时长</span>
        <span role="columnheader" aria-label="操作" />
      </div>
      <motion.div variants={staggerList} initial="hidden" animate="show">
        {rows.map(({ track, meta, actions }, index) => {
          const current = player.track.id === track.id;
          return (
            <motion.div
              key={track.id}
              role="row"
              variants={index < 40 ? riseItem : undefined}
              className={cn(styles.row, styles.song, current && styles.current)}
              onDoubleClick={() => player.playFromList(track, queue)}
            >
              <span role="cell" className={styles.index}>
                {current && player.playing ? <Equalizer /> : <span className={styles.indexNumber}>{String(index + 1).padStart(2, '0')}</span>}
                <button type="button" className={styles.indexPlay} onClick={() => player.play(track, queue)} aria-label={`播放${track.title}`}>
                  <Play size={13} strokeWidth={0} fill="currentColor" />
                </button>
              </span>
              <span role="cell" className={styles.identity}>
                <Cover seed={track.coverSeed} src={track.cover} size={40} radius={6} />
                <span className={styles.names}>
                  <strong data-tooltip={track.title} data-tooltip-overflow>{track.title}</strong>
                  <span>
                    {track.localId && <HardDrive size={11} strokeWidth={1.8} className={styles.local} aria-label="本地文件" />}
                    <span data-tooltip={track.artist} data-tooltip-overflow>{track.artist}</span>
                  </span>
                </span>
              </span>
              <span role="cell" className={styles.meta}>
                {meta ?? (track.album && track.albumId
                  ? <button type="button" className={styles.link} onClick={() => navigate({ name: 'album', id: track.albumId!, title: track.album })}>{track.album}</button>
                  : <span data-tooltip={track.album} data-tooltip-overflow>{track.album}</span>)}
              </span>
              <span role="cell" className={styles.duration}>{track.duration ? formatTime(track.duration) : '—'}</span>
              <span role="cell" className={styles.actions}>
                {track.songId && <LikeButton songId={track.songId} />}
                {actions}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
