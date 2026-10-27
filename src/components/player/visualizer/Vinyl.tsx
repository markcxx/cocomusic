'use client';

import { Cover } from '@/components/common/Cover';
import { cn } from '@/lib/cn';
import styles from './Vinyl.module.css';

/**
 * Black vinyl with fine grooves and the artwork as its centre label, plus a
 * white tonearm that swings onto the record while playing (drawn in SVG, so it
 * scales with the disc). The record turns only while playing.
 */
export function Vinyl({ seed, src, playing, className }: { seed: string; src?: string; playing: boolean; className?: string }) {
  return (
    <div className={cn(styles.vinyl, playing && styles.playing, className)}>
      <div className={styles.disc}>
        <span className={styles.grooves} aria-hidden />
        <span className={styles.sheen} aria-hidden />
        <Cover seed={seed} src={src} radius={999} className={styles.label} />
        <span className={styles.spindle} aria-hidden />
      </div>
      <svg className={styles.arm} viewBox="0 0 60 120" aria-hidden>
        <defs>
          <linearGradient id="vinyl-arm" x1="0" x2="1">
            <stop offset="0" stopColor="#f4f4f8" />
            <stop offset="1" stopColor="#c9cad6" />
          </linearGradient>
        </defs>
        {/* Pivot, bent arm, head shell. */}
        <circle cx="12" cy="10" r="8" fill="url(#vinyl-arm)" />
        <circle cx="12" cy="10" r="3.2" fill="#a9abba" />
        <path d="M12 12 C 13 44, 18 70, 40 96" fill="none" stroke="url(#vinyl-arm)" strokeWidth="4" strokeLinecap="round" />
        <rect x="35" y="92" width="11" height="17" rx="2.5" transform="rotate(-42 40 100)" fill="url(#vinyl-arm)" />
      </svg>
    </div>
  );
}
