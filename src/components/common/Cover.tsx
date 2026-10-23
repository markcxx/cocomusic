'use client';

import { Music2 } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import styles from './Cover.module.css';

function hash(seed: string) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/**
 * Artwork with a seeded gradient underneath. A real `src` fades in once loaded;
 * if it is missing or fails, the gradient remains as the placeholder.
 */
export function Cover({ seed, src, size, radius, className, alt = '' }: {
  seed: string;
  src?: string;
  size?: number;
  radius?: number;
  className?: string;
  alt?: string;
}) {
  const [status, setStatus] = useState<{ src?: string; state: 'loading' | 'loaded' | 'error' }>({ src, state: 'loading' });
  const state = status.src === src ? status.state : 'loading';
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

  const showImage = src && state !== 'error';
  return (
    <span className={cn(styles.cover, showImage && state === 'loading' && styles.loading, className)} style={style} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      {showImage ? (
        <img
          key={src}
          src={src}
          alt=""
          className={cn(styles.image, state === 'loaded' && styles.loaded)}
          draggable={false}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus({ src, state: 'loaded' })}
          onError={() => setStatus({ src, state: 'error' })}
        />
      ) : (
        <Music2 className={styles.glyph} strokeWidth={1.25} aria-hidden />
      )}
    </span>
  );
}
