'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ListChecks, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchField } from '@/components/common/SearchField';
import { StickyBar } from '@/components/scroll';
import { Button, IconButton } from '@/components/ui';
import { useSelection, type Selection } from '@/lib/selection';
import type { Track } from '@/types/music';
import styles from './CollectionToolbar.module.css';

/** In-list search plus selection over the rows it leaves visible. */
export function useTrackFilter(tracks: Track[]) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(() => (needle
    ? tracks.filter(track => `${track.title} ${track.artist} ${track.album ?? ''}`.toLowerCase().includes(needle))
    : tracks), [tracks, needle]);
  const selection = useSelection(useMemo(() => visible.map(track => track.id), [visible]));
  /** Selected songs in list order, whatever order they were clicked in. */
  const selectedTracks = () => tracks.filter(track => selection.selected.has(track.id));
  return { filter, setFilter, filtering: Boolean(needle), visible, selection, selectedTracks };
}

/** Sticky bar of a song list page: count, play all, 批量操作, in-list search. */
export function CollectionToolbar({ title, total, filter, onFilter, visibleCount, selection, onPlayAll }: {
  /** Compact title shown once the hero scrolls away. */
  title?: string;
  /** Songs in the collection (may exceed the rows loaded so far). */
  total?: number;
  filter: string;
  onFilter: (value: string) => void;
  /** Rows on screen (the matches while filtering). */
  visibleCount: number;
  selection: Selection;
  onPlayAll: () => void;
}) {
  const empty = !visibleCount;
  return (
    <StickyBar compactTitle={title}>
      <div className={styles.toolbar}>
        <span className={styles.count}>
          歌曲 <small>{total ?? '—'}</small>
          {filter.trim() && <small className={styles.matches}>匹配 {visibleCount} 首</small>}
        </span>
        <IconButton label="播放全部" onClick={onPlayAll} disabled={empty}>
          <Play size={16} strokeWidth={0} fill="currentColor" />
        </IconButton>
        <AnimatePresence initial={false} mode="wait">
          {selection.active ? (
            <motion.span key="selecting" className={styles.selectHint} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}>
              点击行勾选，Shift 连选
            </motion.span>
          ) : (
            <motion.span key="idle" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}>
              <Button variant="ghost" icon={<ListChecks size={15} strokeWidth={1.5} />} onClick={selection.start} disabled={empty}>批量操作</Button>
            </motion.span>
          )}
        </AnimatePresence>
        <SearchField value={filter} onChange={onFilter} placeholder="在列表中搜索" label="筛选歌曲" className={styles.filter} />
      </div>
    </StickyBar>
  );
}
