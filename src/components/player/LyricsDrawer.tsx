'use client';

import { AnimatePresence, motion, useTransform } from 'framer-motion';
import { ChevronDown, ChevronsDown, ChevronsUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cover } from '@/components/common/Cover';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { CommentsPage } from './drawer/CommentsPage';
import { Stage } from './drawer/Stage';
import { LyricsPlayerBar } from './LyricsPlayerBar';
import { usePlayer } from './player-store';
import { usePageSnap } from './use-page-snap';
import { useSongStats } from './use-song-stats';
import { useIdlePlayerBar } from './use-idle-player-bar';
import { ProgressVisualizer } from './visualizer/Visualizer';
import { VisualizerPicker } from './visualizer/VisualizerPicker';
import styles from './LyricsDrawer.module.css';

/**
 * Full-window lyrics page with two snapping pages: lyrics, then comments.
 * Wheel/trackpad pulls the comments up with resistance; a short pull springs
 * back, a long pull (or flick) slides the comments page up to the top.
 * A dedicated dark player bar replaces the main one while open.
 */
export function LyricsDrawer() {
  const { lyricsOpen, closeLyrics, track, playing, queueOpen } = usePlayer();
  const stats = useSongStats(track.songId, track.source);
  const { lyricsBackground, lyricsKeepAwake, reduceMotion } = useSettings();

  // 设置 › 歌词页 › 保持屏幕常亮: hold a screen wake lock while lyrics are open and playing.
  useEffect(() => {
    if (!lyricsOpen || !playing || !lyricsKeepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(sentinel => { if (released) void sentinel.release(); else lock = sentinel; }).catch(() => undefined);
    };
    acquire();
    // The OS drops the lock when the window is hidden; take it again on return.
    document.addEventListener('visibilitychange', acquire);
    return () => { released = true; document.removeEventListener('visibilitychange', acquire); void lock?.release().catch(() => undefined); };
  }, [lyricsOpen, playing, lyricsKeepAwake]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewport = useCallback(() => viewportRef.current, []);
  const snap = usePageSnap(viewport, lyricsOpen && Boolean(track.songId));
  const { goTo, onWheel } = snap;
  // 0 → 1 as the track moves from the lyrics page to the comments page.
  const progress = useTransform(snap.y, value => Math.min(1, Math.max(0, -value / (viewportRef.current?.clientHeight || 1))));
  const compactOpacity = useTransform(progress, [0.4, 0.9], [0, 1]);
  const onComments = snap.page === 1;

  useEffect(() => {
    if (!lyricsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[aria-label="MV 播放器"]')) return;
      // Escape steps back: comments → lyrics → closed.
      if (onComments) goTo(0); else closeLyrics();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lyricsOpen, closeLyrics, onComments, goTo]);

  // Native listener: React's wheel handlers are passive and cannot preventDefault.
  const [drawer, setDrawer] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const barHidden = useIdlePlayerBar(drawer, lyricsOpen && !onComments && !queueOpen);
  useEffect(() => {
    if (!drawer) return;
    drawer.addEventListener('wheel', onWheel, { passive: false });
    return () => drawer.removeEventListener('wheel', onWheel);
  }, [drawer, onWheel]);

  // New song: back to its lyrics.
  useEffect(() => { goTo(0); }, [track.id, goTo]);

  // Bottom strips stand exactly on the bar's progress rail: measure where it is.
  const [railBottom, setRailBottom] = useState<number>();
  useEffect(() => {
    const rail = drawer?.querySelector<HTMLElement>('[data-lyrics-progress] [role="slider"]');
    const bar = barRef.current;
    if (!drawer || !rail || !bar) return;
    const place = () => {
      const box = bar.getBoundingClientRect();
      const slider = rail.getBoundingClientRect();
      // Centre of the slider = the rail line.
      setRailBottom(Math.round(box.bottom - (slider.top + slider.height / 2)));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(drawer);
    observer.observe(bar);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [drawer]);

  return (
    <AnimatePresence>
      {lyricsOpen && (
        <motion.section
          ref={setDrawer}
          className={styles.drawer}
          data-theme="dark"
          data-player-surface
          data-lyrics-drawer
          role="dialog"
          aria-modal="true"
          aria-label="歌词"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        >
          {/* 设置 › 歌词页 › 背景: blurred artwork or a calm flat backdrop. */}
          <div className={cn(styles.backdrop, lyricsBackground === 'plain' && styles.backdropPlain)} aria-hidden>
            {lyricsBackground === 'cover' && <Cover seed={track.coverSeed} src={track.cover} className={styles.backdropCover} />}
          </div>

          {/* Bottom strips sit on the backdrop, under the lyrics and the bar (never covering text). */}
          <motion.div className={styles.strip} style={railBottom !== undefined ? { bottom: railBottom } : undefined} animate={{ y: barHidden ? (railBottom ?? 78) : 0 }} transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }} aria-hidden>
            <ProgressVisualizer />
          </motion.div>

          <div className={styles.topBar}>
            <motion.button type="button" className={styles.close} onClick={closeLyrics} aria-label="收起歌词" data-tooltip="收起" data-tooltip-placement="right" data-tooltip-shortcut="Esc" whileHover={{ y: 2 }} whileTap={{ scale: 0.9 }}>
              <ChevronDown size={24} strokeWidth={1.5} />
            </motion.button>
            <motion.div className={styles.compact} style={{ opacity: compactOpacity }} aria-hidden={!onComments}>
              <Cover seed={track.coverSeed} src={track.cover} size={32} radius={6} />
              <span><strong>{track.title}</strong><small>{track.artist}</small></span>
            </motion.div>
            <div className={styles.topActions}>
              {track.songId && (
                <button type="button" className={styles.jump} onClick={() => goTo(onComments ? 0 : 1)}>
                  {onComments ? <ChevronsUp size={15} strokeWidth={1.6} /> : <ChevronsDown size={15} strokeWidth={1.6} />}
                  {onComments ? '回到歌词' : '查看评论'}
                </button>
              )}
              <VisualizerPicker />
            </div>
          </div>

          <div ref={viewportRef} className={styles.viewport}>
            <motion.div className={styles.track} style={{ y: snap.y }}>
              <div className={styles.page} inert={onComments}>
                <Stage progress={progress} />
              </div>
              <div className={styles.page} inert={!onComments}>
                {track.songId && <CommentsPage songId={track.songId} source={track.source} total={stats.commentCount} />}
              </div>
            </motion.div>
          </div>

          <motion.div
            ref={barRef}
            className={styles.playerBar}
            data-lyrics-player-bar
            inert={barHidden}
            aria-hidden={barHidden}
            initial={false}
            animate={{ y: barHidden ? '100%' : 0, opacity: barHidden ? 0 : 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <LyricsPlayerBar onComments={() => goTo(1)} />
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
