'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSettings } from '@/lib/settings';

/** In-app routes. Detail and search routes carry their parameters. */
export type Route =
  | { name: 'home' }
  | { name: 'discover' }
  | { name: 'artists' }
  | { name: 'charts' }
  | { name: 'liked' }
  | { name: 'recent' }
  | { name: 'local' }
  | { name: 'downloads' }
  | { name: 'settings' }
  | { name: 'playlist'; id: string; title?: string }
  | { name: 'album'; id: string; title?: string }
  | { name: 'artist'; id: string; title?: string }
  | { name: 'search'; keyword: string; type?: 'song' | 'playlist' | 'album' | 'artist' }
  /** Song comments; carries display info so the header renders before data loads. */
  | { name: 'comments'; songId: string; source?: 'netease' | 'qq' | 'kugou'; title?: string; artist?: string; cover?: string }
  /** The song's official MV; same display info as comments. */
  | { name: 'mv'; songId: string; source?: 'netease' | 'qq' | 'kugou'; title?: string; artist?: string; cover?: string };

export type RouteName = Route['name'];

export const routeTitles: Record<RouteName, string> = {
  home: '首页',
  discover: '发现音乐',
  artists: '歌手',
  charts: '排行榜',
  liked: '我喜欢',
  recent: '最近播放',
  local: '本地音乐',
  downloads: '下载管理',
  settings: '设置',
  playlist: '歌单',
  album: '专辑',
  artist: '歌手',
  search: '搜索',
  comments: '评论',
  mv: 'MV',
};

export const routeKey = (route: Route) => {
  switch (route.name) {
    case 'playlist': case 'album': case 'artist': return `${route.name}:${route.id}`;
    case 'search': return `search:${route.keyword}:${route.type ?? 'song'}`;
    case 'comments': case 'mv': return `${route.name}:${route.source ?? 'netease'}:${route.songId}`;
    default: return route.name;
  }
};

/** `id` is stable for the entry's lifetime so pages keep their state across history rewrites. */
type Entry = { id: number; route: Route; scrollTop: number };
type History = { stack: Entry[]; index: number; source: string };

/** Routes whose ids belong to one platform; they are dropped when the user switches platform. */
const PLATFORM_ROUTES = new Set<RouteName>(['playlist', 'album', 'artist', 'search', 'liked']);
/** Song pages carry their own source, but the stack still drops them on a platform switch. */
const SONG_ROUTES = new Set<RouteName>(['comments', 'mv']);


type NavigationState = {
  route: Route;
  /** Unique per history entry; pages key their state and animations on it. */
  entryKey: string;
  navigate: (route: Route) => void;
  /** Change params of the current page without adding history (e.g. search tab). */
  replace: (route: Route) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  /** Scroll offset to restore when returning to this entry. */
  restoreScrollTop: number;
  /** Pages report scroll here so back/forward lands where the user left. */
  rememberScroll: (top: number) => void;
};

const NavigationContext = createContext<NavigationState | null>(null);

/**
 * Single-window history (no URL bar): back/forward restore each page's scroll
 * position, and detail/search routes keep their parameters.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const source = useSettings().catalogSource;
  const [history, setHistory] = useState<History>(() => ({ stack: [{ id: 0, route: { name: 'home' }, scrollTop: 0 }], index: 0, source }));
  const scrollRef = useRef(0);

  // Switching platform (设置 › 曲库): ids of the old platform are meaningless on the new one.
  // Keep platform-neutral entries (home, settings, local…) and drop the rest; the
  // current page stays mounted when it is neutral, otherwise we land on home.
  if (history.source !== source) {
    const currentEntry = history.stack[history.index];
    const keep = history.stack.filter(entry => !PLATFORM_ROUTES.has(entry.route.name) && !SONG_ROUTES.has(entry.route.name));
    let stack = keep;
    let index = stack.indexOf(currentEntry);
    if (index < 0) {
      // A fresh home entry; ids only need to be unique within this stack.
      const id = Math.max(0, ...history.stack.map(entry => entry.id)) + 1;
      stack = [...keep.filter(entry => entry.route.name !== 'home'), { id, route: { name: 'home' }, scrollTop: 0 }];
      index = stack.length - 1;
    }
    setHistory({ stack, index, source });
  }

  const commitScroll = (state: History) => {
    const stack = state.stack.slice();
    stack[state.index] = { ...stack[state.index], scrollTop: scrollRef.current };
    return stack;
  };

  const navigate = useCallback((route: Route) => {
    setHistory(previous => {
      if (routeKey(previous.stack[previous.index].route) === routeKey(route)) return previous;
      const id = Math.max(0, ...previous.stack.map(entry => entry.id)) + 1;
      const stack = [...commitScroll(previous).slice(0, previous.index + 1), { id, route, scrollTop: 0 }];
      scrollRef.current = 0;
      return { ...previous, stack, index: stack.length - 1 };
    });
  }, []);

  const replace = useCallback((route: Route) => {
    setHistory(previous => {
      const stack = previous.stack.slice();
      stack[previous.index] = { ...stack[previous.index], route, scrollTop: scrollRef.current };
      return { ...previous, stack };
    });
  }, []);

  const go = useCallback((delta: number) => {
    setHistory(previous => {
      const index = Math.min(previous.stack.length - 1, Math.max(0, previous.index + delta));
      if (index === previous.index) return previous;
      const stack = commitScroll(previous);
      scrollRef.current = stack[index].scrollTop;
      return { ...previous, stack, index };
    });
  }, []);
  const back = useCallback(() => go(-1), [go]);
  const forward = useCallback(() => go(1), [go]);
  const rememberScroll = useCallback((top: number) => { scrollRef.current = top; }, []);

  const current = history.stack[history.index];
  const value = useMemo<NavigationState>(() => ({
    route: current.route,
    // The platform is part of the key so pages with local state (selected category, paging) start fresh.
    entryKey: `${history.source}:${current.id}:${routeKey(current.route)}`,
    navigate,
    replace,
    back,
    forward,
    canBack: history.index > 0,
    canForward: history.index < history.stack.length - 1,
    restoreScrollTop: current.scrollTop,
    rememberScroll,
  }), [current, history.index, history.source, history.stack.length, navigate, replace, back, forward, rememberScroll]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('NavigationProvider is required');
  return value;
}
