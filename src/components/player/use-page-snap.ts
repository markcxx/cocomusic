'use client';

import { animate, useMotionValue, type MotionValue } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from '@/lib/use-latest';

/** Fraction of the viewport the user must pull before releasing commits to the other page. */
const COMMIT_RATIO = 0.22;
/** Pixels/second that commits regardless of distance (a quick flick). */
const FLING_VELOCITY = 1100;
/**
 * Wheel streams have no "release"; this much silence ends a gesture. Trackpads
 * stream at ~60Hz; mouse wheels tick in coarse steps that can be 150ms+ apart.
 */
const IDLE_TRACKPAD_MS = 140;
const IDLE_WHEEL_MS = 260;
/**
 * Input gap that separates two gestures at a boundary (nested list edge, or just
 * after a page change). Generous on purpose: slow mouse ticks inside one swipe
 * must not count as a new gesture. Each event inside the hold extends it.
 */
const EDGE_HOLD_MS = 420;
/** Pull is damped as it grows: like iOS rubber banding, never quite 1:1. */
const DAMP = 0.9;
const rubber = (distance: number, range: number) => (range * distance) / (range + Math.abs(distance) * DAMP);
/** Inverse of `rubber`: the pull that produces a visible offset (resume mid-bounce). */
const unrubber = (offset: number, range: number) => {
  const clamped = Math.sign(offset) * Math.min(Math.abs(offset), (range / DAMP) * 0.98);
  return (range * clamped) / (range - Math.abs(clamped) * DAMP);
};

const spring = { type: 'spring' as const, stiffness: 320, damping: 36, mass: 0.9 };

export type PageSnap = {
  /** 0 = lyrics, 1 = comments. */
  page: 0 | 1;
  /** Track translation in px (0 → -height). Bind to the pages container's `y`. */
  y: MotionValue<number>;
  goTo: (page: 0 | 1) => void;
  /** Wheel handler for the whole page; `canScrollInner` lets nested scrollers consume the event first. */
  onWheel: (event: WheelEvent) => void;
};

/**
 * Two full-height pages stacked vertically, moved as a unit. Wheel/trackpad input
 * drags the track with resistance; when input pauses it either springs back or,
 * past COMMIT_RATIO (or on a flick), animates the next page fully into place.
 *
 * Nested scrollers (`[data-scroll-native]`, e.g. the lyric column or the comment
 * list) keep the wheel until they hit an edge in the gesture's direction.
 */
export function usePageSnap(viewport: () => HTMLElement | null, enabled: boolean): PageSnap {
  const y = useMotionValue(0);
  const [page, setPage] = useState<0 | 1>(0);
  const pageRef = useLatest(page);
  const gesture = useRef<{ pull: number; idle?: ReturnType<typeof setTimeout>; samples: Array<{ t: number; pull: number }> } | null>(null);
  const animation = useRef<ReturnType<typeof animate> | null>(null);

  const height = useCallback(() => viewport()?.clientHeight ?? window.innerHeight, [viewport]);

  /**
   * After a page change, the rest of that wheel burst (trackpad momentum, extra
   * notches) must not scroll the new page. Input is swallowed until it pauses.
   */
  const lockedUntil = useRef(0);
  /** Last time a nested scroller consumed the wheel; edges only hand over after a pause. */
  const nestedAt = useRef(0);

  const settle = useCallback((target: 0 | 1) => {
    animation.current?.stop();
    if (target !== pageRef.current) lockedUntil.current = performance.now() + EDGE_HOLD_MS;
    setPage(target);
    animation.current = animate(y, -target * height(), spring);
  }, [y, height, pageRef]);

  const goTo = useCallback((target: 0 | 1) => {
    if (gesture.current?.idle) clearTimeout(gesture.current.idle);
    gesture.current = null;
    settle(target);
  }, [settle]);

  // Keep the resting position correct when the window resizes.
  useEffect(() => {
    const element = viewport();
    if (!element || !enabled) return;
    const observer = new ResizeObserver(() => { if (!gesture.current) y.set(-pageRef.current * element.clientHeight); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewport, enabled, y, pageRef]);

  const release = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    const h = height();
    // Velocity over the last ~100ms of input (px/s, positive = towards comments).
    const now = performance.now();
    const recent = current.samples.filter(sample => now - sample.t < 120);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const velocity = first && last && last.t > first.t ? ((last.pull - first.pull) / (last.t - first.t)) * 1000 : 0;
    const from = pageRef.current;
    const towardsOther = from === 0 ? current.pull > 0 : current.pull < 0;
    const far = Math.abs(current.pull) > h * COMMIT_RATIO;
    const flick = from === 0 ? velocity > FLING_VELOCITY : velocity < -FLING_VELOCITY;
    settle(towardsOther && (far || flick) ? (from === 0 ? 1 : 0) : from);
  }, [height, pageRef, settle]);

  const onWheel = useCallback((event: WheelEvent) => {
    if (!enabled || event.ctrlKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const delta = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
    const from = pageRef.current;
    const now = performance.now();

    if (now < lockedUntil.current) {
      event.preventDefault();
      lockedUntil.current = now + EDGE_HOLD_MS;
      return;
    }

    // A nested scroller takes the wheel while it can still move in this direction,
    // unless a page drag is already underway (then the drag keeps the gesture).
    if (!gesture.current) {
      const nested = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-scroll-native]');
      if (nested) {
        const atTop = nested.scrollTop <= 0;
        const atBottom = nested.scrollTop + nested.clientHeight >= nested.scrollHeight - 1;
        if ((delta < 0 && !atTop) || (delta > 0 && !atBottom)) { nestedAt.current = now; return; }
        // Hit the edge: this wheel stream stops here. Every further event extends the
        // hold, so only input after a real pause (a new gesture) pulls the page.
        if (now - nestedAt.current < EDGE_HOLD_MS) { nestedAt.current = now; event.preventDefault(); return; }
      }
      // Only pulls towards the other page start a drag (no overscroll past either end).
      if ((from === 0 && delta <= 0) || (from === 1 && delta >= 0)) return;
      animation.current?.stop();
      // Resume from wherever a spring-back left the track, not from zero.
      const offset = -y.get() - from * height();
      gesture.current = { pull: unrubber(offset, height()), samples: [] };
    }

    event.preventDefault();
    const current = gesture.current;
    if (!current) return;
    const h = height();
    current.pull += delta;
    // Pull may not go past the resting position on the near side.
    current.pull = from === 0 ? Math.max(0, current.pull) : Math.min(0, current.pull);
    current.samples.push({ t: performance.now(), pull: current.pull });
    if (current.samples.length > 12) current.samples.shift();
    y.set(-from * h - rubber(current.pull, h));

    if (current.idle) clearTimeout(current.idle);
    // Line-mode or large whole-number steps are a notched mouse wheel.
    const notched = event.deltaMode === 1 || (Math.abs(delta) >= 50 && Number.isInteger(delta));
    current.idle = setTimeout(release, notched ? IDLE_WHEEL_MS : IDLE_TRACKPAD_MS);
  }, [enabled, height, pageRef, release, y]);

  // Reset to the lyrics when the page is closed/reopened.
  useEffect(() => {
    if (enabled) return;
    animation.current?.stop();
    if (gesture.current?.idle) clearTimeout(gesture.current.idle);
    gesture.current = null;
    y.set(0);
    const timer = setTimeout(() => setPage(0), 0);
    return () => clearTimeout(timer);
  }, [enabled, y]);

  useEffect(() => () => {
    animation.current?.stop();
    if (gesture.current?.idle) clearTimeout(gesture.current.idle);
  }, []);

  return { page, y, goTo, onWheel };
}
