'use client';

import { useEffect } from 'react';

/** Capture also covers nested scrollers and portaled menus or dialogs. */
export function ScrollbarVisibility() {
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const onScroll = (event: Event) => {
      const element = event.target === document ? document.scrollingElement : event.target;
      if (!(element instanceof Element)) return;
      clearTimeout(timers.get(element));
      element.setAttribute('data-scrolling', '');
      timers.set(element, setTimeout(() => {
        element.removeAttribute('data-scrolling');
        timers.delete(element);
      }, 800));
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      for (const [element, timer] of timers) {
        clearTimeout(timer);
        element.removeAttribute('data-scrolling');
      }
    };
  }, []);
  return null;
}
