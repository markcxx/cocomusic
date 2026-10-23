'use client';

import { AnimatePresence, motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { ChevronDown, ChevronsDown, ChevronsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CommentList, commentSortKey, commentSorts, type CommentSortLabel } from '@/components/comments/CommentsView';
import { Cover } from '@/components/common/Cover';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { ScrollArea, useScrollArea } from '@/components/scroll';
import { cn } from '@/lib/cn';
import { LyricsPanel } from './LyricsPanel';
import { LyricsPlayerBar } from './LyricsPlayerBar';
import { usePlayer } from './player-store';
import { useSongStats } from './use-song-stats';
import styles from './LyricsDrawer.module.css';

/**
 * Comments below the lyrics stage. The header pins to the top of the page's
 * scroller (CSS sticky) and gains a frosted fill once it is actually stuck.
 */
function CommentsSection({ songId, total, sectionRef }: { songId: string; total?: number; sectionRef: React.RefObject<HTMLElement | null> }) {
  const [sort, setSort] = useState<CommentSortLabel>('推荐');
  const [loaded, setLoaded] = useState<number>();
  const count = loaded ?? total;
  const [stuck, setStuck] = useState(false);
  const { scrollY } = useScrollArea();

  // The header (sticky, top 0) is pinned once the section's top reaches the scroller's top.
  useMotionValueEvent(scrollY, 'change', value => {
    const section = sectionRef.current;
    if (section) setStuck(value >= section.offsetTop - 1);
  });

  return (
    <section ref={sectionRef} className={styles.comments} aria-label="评论">
      <div className={cn(styles.commentsHeader, stuck && styles.commentsHeaderStuck)}>
        <h3>评论{count ? <small>{count.toLocaleString('zh-CN')}</small> : null}</h3>
        <Tabs items={commentSorts} value={sort} onChange={setSort} label="评论排序" size="sm" />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${songId}:${sort}`} className={styles.commentsBody} {...fadeSwap}>
          <CommentList songId={songId} sort={commentSortKey[sort]} onTotal={setLoaded} />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/** Everything inside the page's scroller; needs the ScrollArea context. */
function LyricsPageBody({ commentsRef, onScrolled }: { commentsRef: React.RefObject<HTMLElement | null>; onScrolled: (past: boolean) => void }) {
  const { track, playing, trial } = usePlayer();
  const stats = useSongStats(track.songId);
  const { scrollY, element } = useScrollArea();
  // Stage fades and recedes as comments slide up over it.
  const stageOpacity = useTransform(scrollY, value => 1 - Math.min(1, value / ((element()?.clientHeight ?? 800) * 0.7)));
  const stageScale = useTransform(stageOpacity, [0, 1], [0.94, 1]);
  useMotionValueEvent(scrollY, 'change', value => onScrolled(value > 80));

  return (
    <>
      <motion.div className={styles.stage} style={{ opacity: stageOpacity, scale: stageScale }}>
        <motion.div className={styles.art} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 24 }}>
          <Cover seed={track.coverSeed} src={track.cover} className={cn(styles.artCover, !playing && styles.artPaused)} radius={18} />
        </motion.div>
        <motion.div className={styles.lyrics} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
          <header className={styles.heading}>
            <h2 data-tooltip={track.title} data-tooltip-overflow>{track.title}</h2>
            <p>{track.artist}{track.album ? ` · ${track.album}` : ''}{trial ? <span className={styles.trialTag}>试听</span> : null}</p>
          </header>
          <LyricsPanel />
        </motion.div>
      </motion.div>
      {track.songId && <CommentsSection songId={track.songId} total={stats.commentCount} sectionRef={commentsRef} />}
    </>
  );
}

/**
 * Full-window lyrics page. One scroller holds the lyrics stage (exactly one
 * viewport tall) and the comments below it, so scrolling the page reveals
 * comments; their header sticks to the top. A dedicated dark player bar
 * replaces the main one while open.
 */
export function LyricsDrawer() {
  const { lyricsOpen, closeLyrics, track } = usePlayer();
  const scrollHost = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!lyricsOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeLyrics(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lyricsOpen, closeLyrics]);

  // New song while open: back to the lyrics.
  useEffect(() => {
    scrollHost.current?.querySelector<HTMLElement>('[data-scroll-root]')?.scrollTo({ top: 0 });
  }, [track.id]);

  const scroller = () => scrollHost.current?.querySelector<HTMLElement>('[data-scroll-root]');
  const toComments = () => {
    const root = scroller();
    const section = commentsRef.current;
    if (root && section) root.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  };
  const toLyrics = () => scroller()?.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <AnimatePresence onExitComplete={() => setScrolled(false)}>
      {lyricsOpen && (
        <motion.section
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
          <div className={styles.backdrop} aria-hidden>
            <Cover seed={track.coverSeed} src={track.cover} className={styles.backdropCover} />
          </div>

          <div className={styles.topBar}>
            <motion.button type="button" className={styles.close} onClick={closeLyrics} aria-label="收起歌词" data-tooltip="收起" data-tooltip-placement="right" data-tooltip-shortcut="Esc" whileHover={{ y: 2 }} whileTap={{ scale: 0.9 }}>
              <ChevronDown size={24} strokeWidth={1.5} />
            </motion.button>
            <AnimatePresence>
              {scrolled && (
                <motion.div className={styles.compact} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                  <Cover seed={track.coverSeed} src={track.cover} size={32} radius={6} />
                  <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                </motion.div>
              )}
            </AnimatePresence>
            {track.songId && (
              <button type="button" className={styles.jump} onClick={scrolled ? toLyrics : toComments}>
                {scrolled ? <ChevronsUp size={15} strokeWidth={1.6} /> : <ChevronsDown size={15} strokeWidth={1.6} />}
                {scrolled ? '回到歌词' : '查看评论'}
              </button>
            )}
          </div>

          <div ref={scrollHost} className={styles.scrollHost}>
            <ScrollArea className={styles.scroll}>
              <LyricsPageBody commentsRef={commentsRef} onScrolled={setScrolled} />
            </ScrollArea>
          </div>

          <LyricsPlayerBar onComments={toComments} />
        </motion.section>
      )}
    </AnimatePresence>
  );
}
