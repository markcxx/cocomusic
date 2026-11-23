import { useLayoutEffect, useRef, useState } from 'react';

const SHORT_LIST = 40;
const BUFFER = 8;

/** Window fixed-height rows within the page's existing scroll area. */
export function useSongWindow(count: number) {
  const body = useRef<HTMLDivElement>(null);
  const virtual = count > SHORT_LIST;
  const [range, setRange] = useState({ start: 0, end: SHORT_LIST });

  useLayoutEffect(() => {
    const rows = body.current;
    const root = rows?.closest<HTMLElement>('[data-scroll-root]');
    if (!virtual || !rows || !root) return;

    const measure = () => {
      // All three measurements share screen coordinates, including the app's CSS zoom.
      const viewport = root.getBoundingClientRect();
      const bounds = rows.getBoundingClientRect();
      const height = bounds.height / count;
      if (height <= 0) return;
      const start = Math.min(count, Math.max(0, Math.floor((viewport.top - bounds.top) / height) - BUFFER));
      const end = Math.min(count, Math.max(start, Math.ceil((viewport.bottom - bounds.top) / height) + BUFFER));
      setRange(previous => previous.start === start && previous.end === end ? previous : { start, end });
    };

    measure();
    root.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(rows);
    // Covers and expandable descriptions above the table can move its starting offset.
    if (root.firstElementChild) observer.observe(root.firstElementChild);
    return () => {
      root.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [count, virtual]);

  return {
    body, virtual,
    start: virtual ? Math.min(range.start, count) : 0,
    end: virtual ? Math.min(range.end, count) : count,
  };
}
