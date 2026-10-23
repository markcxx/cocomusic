'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Ref that always holds the latest `value`, updated after render (never during).
 * Read `.current` only in effects and event handlers.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
