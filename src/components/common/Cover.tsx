'use client';

import { Music2 } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { resolveCoverUrl } from '@/lib/cover-quality';
import { useSettings } from '@/lib/settings';
import styles from './Cover.module.css';

function hash(seed: string) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Hue of the seeded placeholder gradient (for tinting things to match a cover). */
export const coverHue = (seed: string) => hash(seed) % 360;

/**
 * Artwork with a seeded gradient underneath. A real `src` fades in once loaded;
 * if it is missing or fails, the gradient remains as the placeholder.
 */
export function Cover({ seed, src, size, radius, className, alt = '', empty = false, 'data-flow-shape': flowShape }: {
  /** Marks the artwork the cover flow grows out of and returns into. */
  'data-flow-shape'?: boolean;
  seed: string;
  src?: string;
  size?: number;
  radius?: number;
  className?: string;
  alt?: string;
  /** Neutral placeholder (no seeded colour), e.g. the player before anything is chosen. */
  empty?: boolean;
}) {
  const coverQuality = useSettings().coverQuality;
  const resolvedSrc = resolveCoverUrl(src, coverQuality, size);
  const [status, setStatus] = useState<{ src?: string; state: 'loading' | 'loaded' | 'error' }>({ src: resolvedSrc, state: 'loading' });
  const state = status.src === resolvedSrc ? status.state : 'loading';
  const h = hash(seed);
  const hue = h % 360;
  const style = {
    '--hue-a': `${hue}`,
    '--hue-b': `${(hue + 36 + (h >> 9) % 60) % 360}`,
    '--light-x': `${20 + (h >> 3) % 60}%`,
    '--light-y': `${15 + (h >> 6) % 50}%`,
    width: size,
    height: size,
    borderRadius: radius,
  } as CSSProperties;

  const showImage = resolvedSrc && state !== 'error';
  return (
    <span className={cn(styles.cover, empty && styles.empty, showImage && state === 'loading' && styles.loading, className)} style={style} data-flow-shape={flowShape || undefined} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      {showImage ? (
        <img
          key={resolvedSrc}
          src={resolvedSrc}
          alt=""
          className={cn(styles.image, state === 'loaded' && styles.loaded)}
          draggable={false}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus({ src: resolvedSrc, state: 'loaded' })}
          onError={() => setStatus({ src: resolvedSrc, state: 'error' })}
        />
      ) : (
        <Music2 className={styles.glyph} strokeWidth={1.25} aria-hidden />
      )}
    </span>
  );
}
