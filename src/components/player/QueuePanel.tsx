'use client';

import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { GripVertical, HardDrive, ListMusic, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Cover } from '@/components/common/Cover';
import { Equalizer } from '@/components/music/Equalizer';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Track } from '@/types/music';
import { formatTime, usePlayer } from './player-store';
import styles from './QueuePanel.module.css';

function QueueRow({ item, current, playing, onPlay, onRemove }: { item: Track; current: boolean; playing: boolean; onPlay: () => void; onRemove: () => void }) {
  const drag = useDragControls();
  return (
    <Reorder.Item
      value={item}
      id={item.id}
      dragListener={false}
      dragControls={drag}
      className={cn(styles.row, current && styles.current)}
      data-current={current || undefined}
      onDoubleClick={onPlay}
      layout="position"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
      whileDrag={{ scale: 1.02, boxShadow: '0 12px 28px rgba(50, 40, 110, 0.18)', zIndex: 2 }}
    >
      {/* Drag only from the handle, so the list still scrolls and clicks still play. */}
      <span className={styles.grip} onPointerDown={event => drag.start(event)} aria-hidden>
        <GripVertical size={14} strokeWidth={1.6} />
      </span>
      <button type="button" className={styles.main} onClick={onPlay} aria-label={`播放${item.title}`} aria-current={current || undefined}>
        <span className={styles.thumb}>
          <Cover seed={item.coverSeed} src={item.cover} size={36} radius={6} />
          {current && playing && <span className={styles.thumbEq}><Equalizer /></span>}
        </span>
        <span className={styles.names}>
          <strong>{item.title}</strong>
          <span>{item.localId && <HardDrive size={11} strokeWidth={1.8} className={styles.localMark} aria-label="本地" />}{item.artist}</span>
        </span>
        <span className={styles.duration}>{item.duration ? formatTime(item.duration) : ''}</span>
      </button>
      <span className={styles.remove}>
        <IconButton label="从列表移除" size="sm" tone="muted" onClick={onRemove}><X size={14} strokeWidth={1.6} /></IconButton>
      </span>
    </Reorder.Item>
  );
}

/**
 * 播放列表 drawer on the right, above the player bar. Click (or double-click) to
 * play, drag the handle to reorder, × to remove. Opening scrolls to the current song.
 */
export function QueuePanel() {
  const player = usePlayer();
  const { queue, track, queueOpen, setQueueOpen } = player;
  const list = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Bring the playing song into view when the panel opens.
  useLayoutEffect(() => {
    if (!queueOpen) return;
    const frame = requestAnimationFrame(() => {
      list.current?.querySelector<HTMLElement>('[data-current]')?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [queueOpen]);

  useEffect(() => {
    if (!queueOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setQueueOpen(false); };
    // Clicks outside close it, except on the toggle button itself (it toggles).
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (panel.current?.contains(target) || target.closest('[data-queue-toggle]') || target.closest('[role="menu"], [role="dialog"]')) return;
      setQueueOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [queueOpen, setQueueOpen]);

  const total = queue.reduce((sum, item) => sum + (item.duration ?? 0), 0);

  return (
    <AnimatePresence>
      {queueOpen && (
        <motion.aside
          ref={panel}
          className={styles.panel}
          aria-label="播放列表"
          initial={{ x: '104%', opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '104%', opacity: 0.6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        >
          <header className={styles.header}>
            <div>
              <h2>播放列表</h2>
              <p>{queue.length} 首{total ? ` · ${Math.round(total / 60)} 分钟` : ''}</p>
            </div>
            <div className={styles.headerActions}>
              <IconButton label="清空列表" tone="muted" size="sm" onClick={player.clearQueue} disabled={!queue.length}><Trash2 size={15} strokeWidth={1.5} /></IconButton>
              <IconButton label="关闭" tone="muted" size="sm" onClick={() => setQueueOpen(false)} iconHover={{ rotate: 90 }}><X size={16} strokeWidth={1.5} /></IconButton>
            </div>
          </header>

          {queue.length ? (
            <div ref={list} className={styles.list} data-scroll-native>
              <Reorder.Group
                axis="y"
                values={queue}
                // Reorder hands back the reordered array; apply it as one move of the dragged item.
                onReorder={next => {
                  const moved = next.find((item, index) => queue[index]?.id !== item.id && queue.indexOf(item) !== index);
                  if (moved) player.moveInQueue(moved.id, next.indexOf(moved));
                }}
                className={styles.items}
              >
                <AnimatePresence initial={false}>
                  {queue.map(item => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      current={item.id === track.id}
                      playing={player.playing}
                      onPlay={() => player.play(item)}
                      onRemove={() => player.removeFromQueue(item.id)}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>
            </div>
          ) : (
            <div className={styles.empty}>
              <ListMusic size={32} strokeWidth={1.2} />
              <p>播放列表是空的</p>
              <span>在歌单、排行榜或本地音乐里播放歌曲，它们会出现在这里</span>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
