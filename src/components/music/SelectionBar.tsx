'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Download, FolderPlus, ListPlus, Play, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { Button, IconButton, Menu } from '@/components/ui';
import { useIsClient } from '@/lib/client-only';
import type { Selection } from '@/lib/selection';
import styles from './SelectionBar.module.css';

/** Floating batch-action bar shown while songs are selected. Escape exits selection. */
export function SelectionBar({ selection, onPlay, onQueue, onCollect, onDownload }: {
  selection: Selection;
  onPlay: () => void;
  onQueue: () => void;
  /** Add the selected songs to one of the user's playlists. */
  onCollect?: (playlistId: string) => void;
  /** Omitted until the download service exists; the button shows disabled. */
  onDownload?: () => void;
}) {
  const { profile, playlists, openLogin } = useAccount();
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
          {onCollect && (
            <span ref={collectAnchor} style={{ display: 'inline-flex' }}>
              <Button icon={<FolderPlus size={15} strokeWidth={1.5} />} onClick={() => (profile ? setCollecting(value => !value) : openLogin())} disabled={empty}>收藏到歌单</Button>
            </span>
          )}
          <Button icon={<Download size={15} strokeWidth={1.5} />} onClick={onDownload} disabled={empty || !onDownload} title={onDownload ? undefined : '下载功能即将接入'}>下载</Button>
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
      open={collecting && selection.active}
      anchor={collectAnchor}
      onClose={() => setCollecting(false)}
      items={[
        { type: 'section', label: `收藏 ${selection.count} 首到` },
        ...playlists.filter(item => item.own).map(item => ({
          label: item.liked ? '我喜欢的音乐' : item.name,
          icon: <ListPlus size={15} strokeWidth={1.5} />,
          onSelect: () => onCollect?.(item.id),
        })),
      ]}
    />
  );
  return <>{bar}{menu}</>;
}
