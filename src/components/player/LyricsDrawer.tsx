'use client';

import { AnimatePresence, motion, useTransform, type MotionValue } from 'framer-motion';
import { ChevronDown, ChevronsDown, ChevronsUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CommentList, commentSortKey, commentSorts, type CommentSortLabel } from '@/components/comments/CommentsView';
import { Cover } from '@/components/common/Cover';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { ScrollArea } from '@/components/scroll';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import type { Track } from '@/types/music';
import { LyricsDuo } from './LyricsDuo';
import { LyricsPanel } from './LyricsPanel';
import { LyricsPlayerBar } from './LyricsPlayerBar';
import { usePlayer } from './player-store';
import { usePageSnap } from './use-page-snap';
import { useSongStats } from './use-song-stats';
import { Vinyl } from './visualizer/Vinyl';
import { MirrorVisualizer, ProgressVisualizer, RingVisualizer, useVisualizer } from './visualizer/Visualizer';
import { isRingTemplate } from '@/lib/settings';
import { VisualizerPicker } from './visualizer/VisualizerPicker';
import styles from './LyricsDrawer.module.css';

/** Page 1: comment header (title + sort) fixed at the top, list scrolling beneath it. */
function CommentsPage({ songId, source, total }: { songId: string; source?: Track['source']; total?: number }) {
  const [sort, setSort] = useState<CommentSortLabel>('推荐');
  const [loaded, setLoaded] = useState<number>();
  const count = loaded ?? total;
  return (
    <section className={styles.comments} aria-label="评论">
      <div className={styles.commentsHeader}>
        <h3>评论{count ? <small>{count.toLocaleString('zh-CN')}</small> : null}</h3>
        <Tabs items={commentSorts} value={sort} onChange={setSort} label="评论排序" size="sm" />
      </div>
      {/* Own scroller: the page snap only takes over once this reaches its top. */}
      <ScrollArea className={styles.commentsScroll} nativeWheel>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${songId}:${sort}`} className={styles.commentsBody} {...fadeSwap}>
            <CommentList songId={songId} source={source} sort={commentSortKey[sort]} onTotal={setLoaded} />
          </motion.div>
        </AnimatePresence>
      </ScrollArea>
    </section>
  );
}

/** One spring for every layout move, so art and text travel together. */
const LAYOUT_SPRING = { type: 'spring', stiffness: 170, damping: 26, mass: 0.9 } as const;
const fadeBlock = {
  initial: { opacity: 0, y: 16, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: 10, filter: 'blur(6px)', transition: { duration: 0.22 } },
} as const;

/**
 * Page 0 recedes and fades as the comments page slides over it.
 * 设置 › 歌词页 › 布局 (also in the 播放器模式 card):
 * - 标准: artwork left, title + scrolling lyrics right;
 * - 居中: artwork centred, at most two lyric lines beneath it;
 * - 歌词: lyrics only, centred.
 * The artwork and the text blocks are `layout` elements, so a switch glides
 * them to their new place and size; parts a layout drops fade out.
 */
function Stage({ progress }: { progress: MotionValue<number> }) {
  const { track, playing, trial } = usePlayer();
  const prefs = useSettings();
  const layout = prefs.lyricsLayout;
  const opacity = useTransform(progress, [0, 0.8], [1, 0]);
  const scale = useTransform(progress, [0, 1], [1, 0.94]);
  const { template } = useVisualizer();
  const ringTemplate = isRingTemplate(template);
  return (
    <motion.div className={cn(styles.stage, layout === 'centered' && styles.stageCentered, layout === 'lyrics' && styles.stageLyrics)} style={{ opacity, scale }}>
      <AnimatePresence mode="popLayout" initial={false}>
      {layout !== 'lyrics' && (
      <motion.div
        key="art"
        layout
        className={styles.art}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.28 } }}
        transition={{ ...LAYOUT_SPRING, delay: 0.05, layout: LAYOUT_SPRING }}
      >
        {template === 'vinyl' ? (
          // 经典唱片: the familiar record with its tonearm, no effect.
          <div className={styles.record}>
            <Vinyl seed={track.coverSeed} src={track.cover} playing={playing} />
          </div>
        ) : ringTemplate ? (
          // Effects around the artwork: a round cover that turns while playing, the effect circling it.
          <div className={styles.disc}>
            <RingVisualizer />
            <Cover seed={track.coverSeed} src={track.cover} radius={999} className={cn(styles.discCover, styles.artSpin, playing && styles.artSpinning)} />
          </div>
        ) : (
          <Cover
            seed={track.coverSeed}
            src={track.cover}
            className={cn(styles.artCover, !playing && styles.artPaused, prefs.lyricsSpinCover && styles.artSpin, prefs.lyricsSpinCover && playing && styles.artSpinning)}
            radius={prefs.lyricsSpinCover ? 999 : 18}
          />
        )}
        {layout === 'standard' && <MirrorVisualizer />}
        {layout === 'centered' && (
          <motion.div layout="position" {...fadeBlock} className={styles.centeredMeta}>
            <strong>{track.title}</strong>
            <small>{track.artist}{trial ? <span className={styles.trialTag}>试听</span> : null}</small>
          </motion.div>
        )}
      </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence mode="popLayout" initial={false}>
        {layout === 'centered' ? (
          <motion.div key="duo" layout {...fadeBlock} className={styles.duoWrap}>
            <LyricsDuo />
          </motion.div>
        ) : (
          <motion.div
            key="lyrics"
            layout
            className={styles.lyrics}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14, transition: { duration: 0.22 } }}
            transition={{ delay: 0.2, duration: 0.4, layout: LAYOUT_SPRING }}
          >
            <motion.header layout="position" className={styles.heading} transition={{ layout: LAYOUT_SPRING }}>
              <h2 data-tooltip={track.title} data-tooltip-overflow>{track.title}</h2>
              <p>{track.artist}{track.album ? ` · ${track.album}` : ''}{trial ? <span className={styles.trialTag}>试听</span> : null}</p>
            </motion.header>
            <LyricsPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Full-window lyrics page with two snapping pages: lyrics, then comments.
 * Wheel/trackpad pulls the comments up with resistance; a short pull springs
 * back, a long pull (or flick) slides the comments page up to the top.
 * A dedicated dark player bar replaces the main one while open.
 */
export function LyricsDrawer() {
  const { lyricsOpen, closeLyrics, track, playing } = usePlayer();
  const stats = useSongStats(track.songId, track.source);
  const { lyricsBackground, lyricsKeepAwake } = useSettings();

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
      if (event.key !== 'Escape') return;
      // Escape steps back: comments → lyrics → closed.
      if (onComments) goTo(0); else closeLyrics();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lyricsOpen, closeLyrics, onComments, goTo]);

  // Native listener: React's wheel handlers are passive and cannot preventDefault.
  const [drawer, setDrawer] = useState<HTMLElement | null>(null);
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
    if (!drawer || !rail) return;
    const place = () => {
      const box = drawer.getBoundingClientRect();
      const slider = rail.getBoundingClientRect();
      // Centre of the slider = the rail line.
      setRailBottom(Math.round(box.bottom - (slider.top + slider.height / 2)));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(drawer);
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
          <div className={styles.strip} style={railBottom !== undefined ? { bottom: railBottom } : undefined} aria-hidden>
            <ProgressVisualizer />
          </div>

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

          <LyricsPlayerBar onComments={() => goTo(1)} />
        </motion.section>
      )}
    </AnimatePresence>
  );
}
