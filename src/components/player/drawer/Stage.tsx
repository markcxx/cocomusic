'use client';

import { AnimatePresence, motion, useTransform, type MotionValue } from 'framer-motion';
import dynamic from 'next/dynamic';
import { Cover } from '@/components/common/Cover';
import { cn } from '@/lib/cn';
import { isRingTemplate, useSettings } from '@/lib/settings';
import { LyricsDuo } from '../LyricsDuo';
import { LyricsPanel } from '../LyricsPanel';
import { usePlayer } from '../player-store';
import { Vinyl } from '../visualizer/Vinyl';
import { MirrorVisualizer, RingVisualizer, useVisualizer } from '../visualizer/Visualizer';
import styles from './Stage.module.css';
const RoamingPlayer = dynamic(() => import('../roaming/RoamingPlayer'), { ssr: false });

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
export function Stage({ progress }: { progress: MotionValue<number> }) {
  const { track, playing, trial } = usePlayer();
  const prefs = useSettings();
  const layout = prefs.lyricsLayout;
  const opacity = useTransform(progress, [0, 0.8], [1, 0]);
  const scale = useTransform(progress, [0, 1], [1, 0.94]);
  const { template } = useVisualizer();
  const ringTemplate = isRingTemplate(template);
  if (prefs.lyricsVisualizer === 'roaming') return (
    <motion.div className={styles.roamingStage} style={{ opacity, scale }}>
      <RoamingPlayer />
    </motion.div>
  );
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
            <LyricsPanel centered={layout === 'lyrics'} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
