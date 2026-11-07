'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Download, FolderPlus, ListMinus, ListPlus, Play, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useAddToPlaylist, type PlaylistRef } from '@/components/playlists/add-to-playlist';
import { Button, IconButton, Menu } from '@/components/ui';
import { useIsClient } from '@/lib/client-only';
import type { Selection } from '@/lib/selection';
import type { Track } from '@/types/music';
import styles from './SelectionBar.module.css';

/** Floating batch-action bar shown while songs are selected. Escape exits selection. */
export function SelectionBar({ selection, selectedTracks, playlist, onPlay, onQueue, onDownload, onRemove }: {
  selection: Selection;
  /** The selected songs in list order (read when an action runs). */
  selectedTracks: () => Track[];
  /** The playlist being shown: left out of 收藏到歌单. */
  playlist?: PlaylistRef;
  onPlay: () => void;
  onQueue: () => void;
  onDownload?: () => void;
  /** Remove the selected songs from the playlist being shown (the user's own). */
  onRemove?: () => void;
}) {
  const addTo = useAddToPlaylist();
  const collectAnchor = useRef<HTMLSpanElement>(null);
  const [collecting, setCollecting] = useState(false);
  const mounted = useIsClient();

  useEffect(() => {
    if (!selection.active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') selection.exit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  if (!mounted) return null;
  const empty = selection.count === 0;
  const menuOpen = collecting && selection.active;
  const bar = createPortal(
    <AnimatePresence>
      {selection.active && (
        <motion.div
          className={styles.bar}
          role="toolbar"
          aria-label="批量操作"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <span className={styles.count}>
            已选
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.strong key={selection.count} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ duration: 0.16 }}>
                {selection.count}
              </motion.strong>
            </AnimatePresence>
            首
          </span>
          <Button variant="primary" icon={<Play size={15} strokeWidth={0} fill="currentColor" />} onClick={onPlay} disabled={empty}>播放</Button>
          <Button icon={<ListPlus size={15} strokeWidth={1.5} />} onClick={onQueue} disabled={empty}>加入队列</Button>
          <span ref={collectAnchor} style={{ display: 'inline-flex' }}>
            <Button icon={<FolderPlus size={15} strokeWidth={1.5} />} onClick={() => setCollecting(value => !value)} disabled={empty}>收藏到歌单</Button>
          </span>
          {onDownload && <Button icon={<Download size={15} strokeWidth={1.5} />} onClick={onDownload} disabled={empty}>下载</Button>}
          {onRemove && <Button icon={<ListMinus size={15} strokeWidth={1.5} />} onClick={onRemove} disabled={empty}>移除</Button>}
          <span className={styles.divider} aria-hidden />
          <IconButton label="退出多选" onClick={selection.exit} iconHover={{ rotate: 90 }}>
            <X size={17} strokeWidth={1.5} />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
  const menu = (
    <Menu
      open={menuOpen}
      anchor={collectAnchor}
      onClose={() => setCollecting(false)}
      items={menuOpen ? [{ type: 'section', label: `收藏 ${selection.count} 首到` }, ...addTo.items(selectedTracks(), { exclude: playlist, onDone: selection.exit })] : []}
    />
  );
  return <>{bar}{menu}{addTo.dialogs}</>;
}
