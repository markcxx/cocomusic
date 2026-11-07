'use client';

import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { LikeButton } from '@/components/account/LikeButton';
import { TrackMenuButton } from '@/components/account/TrackMenuButton';
import type { MouseEvent } from 'react';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { riseItem, staggerList } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { formatTime, usePlayer } from '@/components/player/player-store';
import { DownloadButton } from '@/components/downloads/DownloadButton';
import type { PlaylistRef } from '@/components/playlists/add-to-playlist';
import { Checkbox } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import type { Selection } from '@/lib/selection';
import { toCatalogTrack } from '@/lib/to-track';
import { SOURCE_TAGS } from '@/server/music/ids';
import type { Track } from '@/types/music';
import { Equalizer } from './Equalizer';
import styles from './SongTable.module.css';

const stillItem = { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } };

/**
 * Track list for collections and search: index (play on hover), cover + title,
 * hover actions, album (links to album page) and duration. Double-click plays.
 * Rows are player tracks, so one table serves platform lists and mixed local
 * playlists alike; selection keys are the tracks' ids. With an active
 * `selection`, the index column becomes checkboxes and clicking a row toggles
 * it (shift-click selects a range).
 */
export function SongTable({ tracks, startIndex = 0, showAlbum = true, showCover = true, showSource = false, loading = false, skeletonRows = 10, emptyText = '暂无歌曲', animateFrom = 0, selection, playlist, onRemoved, onPlayTrack }: {
  tracks: Track[];
  /** Number shown for the first row (for paged lists). */
  startIndex?: number;
  showAlbum?: boolean;
  showCover?: boolean;
  /** Tag each song with its platform (or 本地) — for lists that mix them. */
  showSource?: boolean;
  loading?: boolean;
  skeletonRows?: number;
  emptyText?: string;
  /** Rows before this index are already on screen and skip the entrance animation. */
  animateFrom?: number;
  selection?: Selection;
  /** The playlist being shown, enabling "从歌单中移除" when the user may edit it. */
  playlist?: PlaylistRef;
  /** A row was removed from `playlist` (track id). */
  onRemoved?: (trackId: string) => void;
  /**
   * Paged lists: called when a row is played, so the owner can queue the
   * whole collection (not only the rows loaded so far).
   */
  onPlayTrack?: (track: Track, mode: 'play' | 'list') => void;
}) {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const showVip = useSettings().showVipBadge;
  const selecting = Boolean(selection?.active);

  if (loading) {
    return (
      <div className={styles.table} aria-busy="true">
        {Array.from({ length: skeletonRows }, (_, index) => <SkeletonBlock key={index} className={styles.skeleton} />)}
      </div>
    );
  }

  const onRowClick = (event: MouseEvent, key: string) => {
    if (!selection?.active) return;
    // Clicks on links/buttons inside the row keep their own behaviour.
    if ((event.target as HTMLElement).closest('button, a')) return;
    selection.toggle(key, event.shiftKey);
  };

  return (
    <div className={cn(styles.table, selecting && styles.selecting)} role="table" aria-label={selecting ? '歌曲列表（多选中）' : '歌曲列表'}>
      <div className={cn(styles.row, styles.head)} role="row">
        <span role="columnheader" className={styles.index}>
          {selecting && selection
            ? <Checkbox checked={selection.allSelected} mixed={selection.someSelected} onChange={selection.toggleAll} label="全选" />
            : '#'}
        </span>
        <span role="columnheader">歌曲</span>
        <span role="columnheader" aria-label="操作" />
        <span role="columnheader">{showAlbum ? '专辑' : ''}</span>
        <span role="columnheader" className={styles.duration}>时长</span>
      </div>
      <motion.div variants={staggerList} initial="hidden" animate="show">
        {tracks.map((track, index) => {
          const catalog = toCatalogTrack(track);
          const current = player.track.id === track.id;
          const checked = Boolean(selection?.isSelected(track.id));
          return (
            <motion.div
              key={`${track.id}:${index}`}
              role="row"
              aria-selected={selecting ? checked : undefined}
              className={cn(styles.row, styles.song, current && styles.current, checked && styles.checked)}
              // Earlier pages are already visible: show them instantly instead of replaying the entrance.
              variants={index >= animateFrom ? riseItem : stillItem}
              onClick={event => onRowClick(event, track.id)}
              onDoubleClick={() => { if (selecting) return; if (onPlayTrack) onPlayTrack(track, 'list'); else player.playFromList(track, tracks); }}
            >
              <span role="cell" className={styles.index}>
                {selecting && selection ? (
                  <Checkbox checked={checked} onChange={event => selection.toggle(track.id, event.shiftKey)} label={`选择${track.title}`} />
                ) : (
                  <>
                    {current && player.playing ? <Equalizer className={styles.indexEqualizer} /> : <span className={styles.indexNumber}>{String(startIndex + index + 1).padStart(2, '0')}</span>}
                    <button type="button" className={styles.indexPlay} onClick={() => (onPlayTrack ? onPlayTrack(track, 'play') : player.play(track, tracks))} aria-label={`播放${track.title}`}>
                      <Play size={13} strokeWidth={0} fill="currentColor" />
                    </button>
                  </>
                )}
              </span>
              <span role="cell" className={styles.identity}>
                {showCover && <Cover seed={track.coverSeed} src={track.cover} size={40} radius={6} />}
                <span className={styles.names}>
                  <strong data-tooltip={track.title} data-tooltip-overflow>
                    {track.title}
                    {track.vip && showVip && <em className={styles.vip}>VIP</em>}
                    {showSource && <em className={styles.tag}>{track.localId || !track.source ? '本地' : SOURCE_TAGS[track.source]}</em>}
                  </strong>
                  <span data-tooltip={track.artist} data-tooltip-overflow>
                    {track.artists?.length && !selecting
                      ? track.artists.map((artist, i) => (
                        <span key={`${artist.id}:${i}`}>
                          {i > 0 && ' / '}
                          {artist.id && artist.id !== '0'
                            ? <button type="button" className={styles.artistLink} onClick={() => navigate({ name: 'artist', id: artist.id, source: track.source, title: artist.name })}>{artist.name}</button>
                            : artist.name}
                        </span>
                      ))
                      : track.artist}
                  </span>
                </span>
              </span>
              <span role="cell" className={styles.actions}>
                {!selecting && (
                  <>
                    {track.songId && <LikeButton songId={track.songId} source={track.source} />}
                    {catalog && <DownloadButton track={catalog} />}
                    <TrackMenuButton track={track} playlist={playlist} onRemoved={onRemoved} />
                  </>
                )}
              </span>
              <span role="cell">
                {showAlbum && track.album && (
                  track.albumId && !track.localId && !selecting
                    ? <button type="button" className={styles.album} onClick={() => navigate({ name: 'album', id: track.albumId!, source: track.source, title: track.album })} data-tooltip={track.album} data-tooltip-overflow>{track.album}</button>
                    : <span className={styles.album} data-tooltip={track.album} data-tooltip-overflow>{track.album}</span>
                )}
              </span>
              <span role="cell" className={styles.duration}>{track.duration ? formatTime(track.duration) : '—'}</span>
            </motion.div>
          );
        })}
      </motion.div>
      {!tracks.length && <p className={styles.empty}>{emptyText}</p>}
    </div>
  );
}
