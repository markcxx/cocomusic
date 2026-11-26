'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import type { LyricLine } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { interludeAt, lineProgress } from '@/server/music/lrc';
import { usePlaybackPosition } from './player-store';
import styles from './LyricsLines.module.css';

const LEAD_SECONDS = 0.25;

/**
 * Word-by-word fluid karaoke + long-note vocal lift for the active lyric line.
 * Subscribes to playback position locally so inactive lines in the scroll list
 * never re-render at 60fps.
 */
export function ActiveLyricText({ line, next, offsetSeconds }: {
  line: LyricLine;
  next?: LyricLine;
  offsetSeconds: number;
}) {
  const position = usePlaybackPosition();
  const { lyricsKaraoke, lyricsOffset, reduceMotion } = useSettings();
  const time = position + offsetSeconds + LEAD_SECONDS + lyricsOffset;

  if (!lyricsKaraoke || reduceMotion) {
    return <span className={styles.lineText}>{line.text}</span>;
  }

  if (line.words?.length) {
    return (
      <span className={cn(styles.lineText, styles.wordLine)}>
        {line.words.map((word, idx) => {
          if (!word.text.trim()) return <span key={idx}>{word.text}</span>;
          const dur = Math.max(0.04, word.end - word.start);
          const p = time <= word.start ? 0 : time >= word.end ? 1 : (time - word.start) / dur;
          const singing = p > 0 && p < 1;
          // Smooth bell curve (0 → 1 → 0) lifts sustained notes and blooms a soft vocal halo.
          const arc = singing ? Math.sin(p * Math.PI) : 0;
          const longNote = dur >= 0.45;
          const lift = singing ? -(longNote ? Math.min(3.4, 1.3 + dur * 1.6) : 1.0) * arc : 0;
          const scale = singing && longNote ? 1 + Math.min(0.045, dur * 0.022) * arc : 1;
          const glow = singing ? (longNote ? Math.min(0.95, 0.35 + dur * 0.45) : 0.24) * arc : 0;
          return (
            <span
              key={idx}
              className={cn(styles.word, p >= 1 && styles.wordSung, singing && styles.wordSinging)}
              style={singing ? {
                '--word-fill': `${(p * 100).toFixed(1)}%`,
                transform: `translate3d(0, ${lift.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`,
                filter: glow > 0.06 ? `drop-shadow(0 0 ${(8 + glow * 10).toFixed(1)}px rgba(255, 255, 255, ${(glow * 0.55).toFixed(2)}))` : undefined,
              } as CSSProperties : undefined}
            >
              {word.text}
            </span>
          );
        })}
      </span>
    );
  }

  const fill = lineProgress(line, next, time);
  return (
    <span
      className={cn(styles.lineText, styles.lineSweep)}
      style={{ '--line-fill': `${(fill * 100).toFixed(1)}%` } as CSSProperties}
    >
      {line.text}
    </span>
  );
}

/**
 * Three-dot breathing indicator ("• • •") shown during intros and ≥5.5s
 * instrumental bridges; dots light up sequentially as the next vocal approaches.
 */
export function InterludeSlot({ lines, active, slotAfterIndex, offsetSeconds, centered }: {
  lines: readonly LyricLine[];
  active: number;
  slotAfterIndex: number;
  offsetSeconds: number;
  centered?: boolean;
}) {
  const position = usePlaybackPosition();
  const { lyricsKaraoke, lyricsOffset, reduceMotion } = useSettings();
  if (!lyricsKaraoke || reduceMotion) return null;
  const state = interludeAt(lines, active, position + offsetSeconds + LEAD_SECONDS + lyricsOffset);
  const visible = state?.afterIndex === slotAfterIndex;
  const progress = visible ? state.progress : 0;
  const ready = progress > 0.86;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key={`interlude:${slotAfterIndex}`}
          className={cn(styles.interlude, centered && styles.interludeCentered, ready && styles.interludeReady)}
          initial={{ opacity: 0, height: 0, scale: 0.82 }}
          animate={{ opacity: 1, height: 34, scale: 1 }}
          exit={{ opacity: 0, height: 0, scale: 0.85 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
        >
          {[0, 1, 2].map(dot => {
            const dotStart = dot / 3;
            const lit = Math.min(1, Math.max(0, (progress - dotStart) * 3));
            return (
              <span
                key={dot}
                className={styles.interludeDot}
                style={{
                  opacity: 0.24 + lit * 0.76,
                  transform: `scale(${(0.84 + lit * 0.26).toFixed(3)})`,
                }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
