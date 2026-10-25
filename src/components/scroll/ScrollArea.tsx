'use client';

import { useMotionValue, type MotionValue } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useLatest } from '@/lib/use-latest';
import styles from './ScrollArea.module.css';
import { createWheelMotion } from './wheel-motion';

type ScrollContextValue = {
  /** Live scrollTop as a motion value: drive animations without re-rendering. */
  scrollY: MotionValue<number>;
  element: () => HTMLDivElement | null;
  scrollTo: (top: number, smooth?: boolean) => void;
};

const ScrollContext = createContext<ScrollContextValue | null>(null);

/**
 * Wheel input is eased toward its target (inertia-like) instead of jumping.
 * Trackpads already deliver smooth deltas, so small or fractional deltas pass through.
 */
function useSmoothWheel(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const stop = useRef<() => void>(() => undefined);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const motion = createWheelMotion(element, {
      request: callback => requestAnimationFrame(callback),
      cancel: id => cancelAnimationFrame(id),
    });
    stop.current = motion.stop;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // Nested scrollers (dropdowns, lists) keep their own native behaviour.
      const nested = (event.target as HTMLElement).closest('[data-scroll-native]');
      if (nested && nested !== element) return;
      const pixels = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
      const looksLikeTrackpad = event.deltaMode === 0 && (Math.abs(pixels) < 40 || !Number.isInteger(pixels));
      if (looksLikeTrackpad) { motion.stop(); return; }
      event.preventDefault();
      motion.by(pixels);
    };
    // Keep the target in sync when something else scrolls (keyboard, scrollbar drag, scrollTo).
    const onScroll = motion.sync;
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      motion.stop();
      stop.current = () => undefined;
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('scroll', onScroll);
    };
  }, [ref, enabled]);
  return useCallback(() => stop.current(), []);
}

export function ScrollArea({ children, className, id, onScrollTop, nativeWheel = false }: {
  children: ReactNode;
  className?: string;
  id?: string;
  onScrollTop?: (top: number) => void;
  /**
   * Plain browser wheel scrolling, marked `data-scroll-native` so an enclosing
   * gesture (e.g. the lyrics page snap) can take over at the scroll edges.
   */
  nativeWheel?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollY = useMotionValue(0);
  const report = useLatest(onScrollTop);
  const stopWheel = useSmoothWheel(ref, !nativeWheel);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      scrollY.set(element.scrollTop);
      report.current?.(element.scrollTop);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [scrollY, report]);

  const element = useCallback(() => ref.current, []);
  const scrollTo = useCallback((top: number, smooth = false) => {
    stopWheel();
    ref.current?.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    scrollY.set(top);
  }, [scrollY, stopWheel]);

  return (
    <ScrollContext.Provider value={{ scrollY, element, scrollTo }}>
      <div ref={ref} id={id} className={cn(styles.scroll, className)} data-scroll-root="true" data-scroll-native={nativeWheel || undefined}>{children}</div>
    </ScrollContext.Provider>
  );
}

export function useScrollArea() {
  const value = useContext(ScrollContext);
  if (!value) throw new Error('ScrollArea is required');
  return value;
}
