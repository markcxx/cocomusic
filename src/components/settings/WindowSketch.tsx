import { cn } from '@/lib/cn';
import type { WindowEffect } from '@/lib/settings';
import styles from './WindowSketch.module.css';

function Sketch({ effect, dark, className }: { effect: WindowEffect; dark: boolean; className?: string }) {
  return (
    <span className={cn(styles.thumb, styles[effect], dark && styles.dark, className)}>
      <span className={styles.window}>
        <span className={styles.sidebar}><i /><i /><i /></span>
        <span className={styles.sheet}><i /><i /></span>
        <span className={styles.bar} />
      </span>
    </span>
  );
}

/**
 * The app window in miniature, drawn the way `effect` renders it. `scheme`
 * is the sketch's own (not the page's), so 浅色 / 深色 tiles can sit side by
 * side; 'split' shows both, cut diagonally, for 跟随系统.
 */
export function WindowSketch({ effect, scheme }: { effect: WindowEffect; scheme: 'light' | 'dark' | 'split' }) {
  if (scheme === 'split') return <><Sketch effect={effect} dark={false} /><Sketch effect={effect} dark className={styles.half} /></>;
  return <Sketch effect={effect} dark={scheme === 'dark'} />;
}
