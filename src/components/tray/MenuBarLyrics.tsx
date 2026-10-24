'use client';

import { Heart, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import styles from './MenuBarLyrics.module.css';

/**
 * macOS menu-bar item, rendered offscreen and copied into the status-bar icon
 * (electron/main/tray-windows.ts). Fixed width equal to the four hover buttons:
 * lyric on the left, app glyph on the right. The lyric fills word by word in a vivid blue and scrolls
 * to keep the sung part in view when the line is wider than the strip.
 * Hovering the item swaps the lyric for 上一首 / 播放 / 下一首 / 喜欢 (clicks
 * are hit-tested by main against the same four equal slots).
 */
export function MenuBarLyrics() {
  const [state, setState] = useState<CocoTrayState | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.menubar = 'true';
    return window.coco?.tray?.onState(next => { if ('hasTrack' in next) setState(next); });
  }, []);

  const line = state?.lyric || (state?.hasTrack ? `${state.title} - ${state.artist}` : 'CoCo Music');
  const progress = state?.lyric ? state.progress : 1;

  // Scroll so the sung edge stays around 60% of the viewport (only when the line overflows).
  useLayoutEffect(() => {
    const box = viewport.current?.clientWidth ?? 0;
    const width = text.current?.scrollWidth ?? 0;
    const overflow = width - box;
    setShift(overflow > 0 ? Math.min(overflow, Math.max(0, width * progress - box * 0.6)) : 0);
  }, [line, progress]);

  if (!state) return null;
  const dark = state.menuBarDark;
  return (
    <div className={cn(styles.strip, dark ? styles.dark : styles.light)}>
      {state.hover ? (
        // Bare outline glyphs like the system menu bar (no button plates).
        <div className={styles.buttons}>
          <span><SkipBack size={15} strokeWidth={1.7} /></span>
          <span>{state.playing ? <Pause size={15} strokeWidth={1.7} /> : <Play size={15} strokeWidth={1.7} />}</span>
          <span><SkipForward size={15} strokeWidth={1.7} /></span>
          <span className={cn(state.liked && styles.liked, state.liked === null && styles.off)}><Heart size={15} strokeWidth={1.7} fill="currentColor" /></span>
        </div>
      ) : (
        <div ref={viewport} className={cn(styles.viewport, shift > 0 && styles.fadeLeft)}>
          <span ref={text} className={styles.line} style={{ transform: `translateX(${-shift}px)` }}>
            <span className={styles.base}>{line}</span>
            <span className={styles.sung} style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }} aria-hidden>{line}</span>
          </span>
        </div>
      )}
      <img className={styles.glyph} src="/images/menubar-glyph.svg" alt="" />
    </div>
  );
}
