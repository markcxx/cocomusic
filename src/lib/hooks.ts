'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from './use-latest';

export function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type InfiniteState<T> = {
  items: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
  /** Drop loaded items locally (e.g. after removing tracks from a playlist). */
  removeWhere: (predicate: (item: T) => boolean) => void;
};

type Page<T> = { items: T[]; total: number; hasMore: boolean };
type State<T> = Page<T> & { request: string; loadingMore: boolean; error: string };

/**
 * Offset-paged list keyed by `key`. Changing the key resets and reloads;
 * `loadMore` appends the next page and ignores calls while one is in flight.
 * Loading is derived from whether state belongs to the current request.
 */
export function useInfiniteList<T>(key: string, loadPage: (offset: number, signal: AbortSignal) => Promise<Page<T>>): InfiniteState<T> {
  const [revision, setRevision] = useState(0);
  const request = `${key}#${revision}`;
  const [state, setState] = useState<State<T> | null>(null);
  const loader = useLatest(loadPage);
  const latest = useLatest({ state, request });
  const controller = useRef<AbortController | null>(null);
  const paging = useRef(false);

  useEffect(() => {
    controller.current?.abort();
    paging.current = false;
    const current = new AbortController();
    controller.current = current;
    loader.current(0, current.signal)
      .then(page => { if (!current.signal.aborted) setState({ request, ...page, loadingMore: false, error: '' }); })
      .catch(error => {
        if (!current.signal.aborted) setState({ request, items: [], total: 0, hasMore: false, loadingMore: false, error: error instanceof Error ? error.message : '加载失败' });
      });
    return () => { current.abort(); controller.current?.abort(); };
  }, [request, loader]);

  const loadMore = useCallback(() => {
    const { state: snapshot, request: active } = latest.current;
    if (!snapshot || snapshot.request !== active || snapshot.loadingMore || paging.current || !snapshot.hasMore) return;
    paging.current = true;
    const current = new AbortController();
    controller.current = current;
    setState(previous => (previous ? { ...previous, loadingMore: true, error: '' } : previous));
    loader.current(snapshot.items.length, current.signal)
      .then(page => {
        if (current.signal.aborted) return;
        setState(previous => (previous?.request !== active ? previous : { ...previous, items: [...previous.items, ...page.items], total: page.total, hasMore: page.hasMore, loadingMore: false }));
      })
      .catch(error => {
        if (!current.signal.aborted) setState(previous => (previous?.request === active
          ? { ...previous, loadingMore: false, error: error instanceof Error ? error.message : '加载更多失败，请重试' } : previous));
      })
      .finally(() => { if (controller.current === current) paging.current = false; });
  }, [latest, loader]);

  const retry = useCallback(() => {
    const snapshot = latest.current.state;
    if (snapshot?.request === latest.current.request && snapshot.items.length && snapshot.error) loadMore();
    else setRevision(value => value + 1);
  }, [latest, loadMore]);
  const removeWhere = useCallback((predicate: (item: T) => boolean) => {
    setState(previous => {
      if (!previous) return previous;
      const items = previous.items.filter(item => !predicate(item));
      return { ...previous, items, total: Math.max(0, previous.total - (previous.items.length - items.length)) };
    });
  }, []);

  const ready = state?.request === request;
  return {
    items: ready ? state.items : [],
    total: ready ? state.total : 0,
    hasMore: ready ? state.hasMore : false,
    loadingMore: ready ? state.loadingMore : false,
    error: ready ? state.error : '',
    loading: !ready,
    loadMore,
    retry,
    removeWhere,
  };
}

/** Calls `onReach` whenever the returned ref's element nears the scroll viewport. */
export function useReachEnd(onReach: () => void, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useLatest(onReach);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = node.closest<HTMLElement>('[data-scroll-root]');
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) callback.current(); }, { root, rootMargin: '500px' });
    observer.observe(node);
    return () => observer.disconnect();
    // `deps` re-arm the observer when the list grows (the sentinel may still be in view).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
