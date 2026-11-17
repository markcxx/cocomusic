'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { useCoverPalette } from '../visualizer/cover-tint';
import styles from './FluidBackdrop.module.css';

/**
 * Apple Music-inspired fluid gradient backdrop: four soft colour blobs sampled
 * from the album cover drift slowly across a deep tinted canvas.
 */
export function FluidBackdrop({ src, seed, playing, reduceMotion }: {
  src?: string;
  seed: string;
  playing: boolean;
  reduceMotion: boolean;
}) {
  const [c1, c2, c3, c4] = useCoverPalette(src, seed);
  const style = {
    '--c1': c1,
    '--c2': c2,
    '--c3': c3,
    '--c4': c4,
  } as CSSProperties;

  return (
    <div
      className={cn(styles.root, (!playing || reduceMotion) && styles.paused)}
      style={style}
      aria-hidden
    >
      <span className={cn(styles.blob, styles.b1)} />
      <span className={cn(styles.blob, styles.b2)} />
      <span className={cn(styles.blob, styles.b3)} />
      <span className={cn(styles.blob, styles.b4)} />
      <span className={styles.scrim} />
    </div>
  );
}
