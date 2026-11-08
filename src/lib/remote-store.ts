'use client';

import { useSyncExternalStore } from 'react';
import { storageReady } from './me-client';

/**
 * In-memory mirror of data the app server keeps, for useSyncExternalStore.
 * Loads on first use (after the one-time import of earlier data); `undefined`
 * until then. Writers update the mirror right away and send the change.
 */
export function remoteStore<T>(load: () => Promise<T>) {
  let value: T | undefined;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());

  /** Reload from the server (also used to resync after a failed write). */
  const refresh = () => {
    // Collections merge with imported data, so they load even if the hand-over has to wait.
    loading = storageReady()
      .then(() => load())
      .then(next => { value = next; emit(); })
      .catch(error => {
        // Try again on the next subscriber instead of caching the failure.
        loading = null;
        console.error('[storage] load failed', error);
      });
    return loading;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (!loading) void refresh();
    return () => { listeners.delete(listener); };
  };

  return {
    get: () => value,
    /** Change the loaded value (ignored before the first load, which brings the server's state). */
    update(change: (current: T) => T) {
      if (value === undefined) return;
      value = change(value);
      emit();
    },
    refresh,
    use: () => useSyncExternalStore(subscribe, () => value, () => undefined),
  };
}
