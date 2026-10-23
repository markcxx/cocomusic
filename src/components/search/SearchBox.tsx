'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigation } from '@/components/layout/navigation';
import { usePlayer } from '@/components/player/player-store';
import { catalogApi, useCatalog } from '@/lib/catalog-client';
import { useDebounced } from '@/lib/hooks';
import { searchHistory } from '@/lib/search-history';
import { toTrack } from '@/lib/to-track';
import { SearchPanel, type PanelItem } from './SearchPanel';
import styles from './SearchBox.module.css';

/**
 * Top-bar search: focusing opens a panel with history + hot searches; typing
 * switches it to live suggestions. Arrow keys move through every row, Enter
 * activates it (or searches the typed text), Escape closes.
 */
export function SearchBox() {
  const { navigate, route } = useNavigation();
  const player = usePlayer();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const keyword = useDebounced(query.trim(), 180);
  const items = useRef<PanelItem[]>([]);
  const setItems = useCallback((list: PanelItem[]) => { items.current = list; }, []);

  const discovery = useCatalog(catalogApi.searchDiscovery, 'search-discovery');
  const placeholder = discovery.data?.placeholder;

  // Keep the box in sync when navigation lands on a new search keyword
  // (adjusting state during render, per React's "you might not need an effect").
  const routeKeyword = route.name === 'search' ? route.keyword : null;
  const [syncedKeyword, setSyncedKeyword] = useState(routeKeyword);
  if (routeKeyword !== syncedKeyword) {
    setSyncedKeyword(routeKeyword);
    if (routeKeyword !== null) setQuery(routeKeyword);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  // Keyboard highlight resets whenever the panel's content changes.
  const panelKey = `${open}:${keyword}`;
  const [activeFor, setActiveFor] = useState(panelKey);
  if (activeFor !== panelKey) {
    setActiveFor(panelKey);
    setActive(-1);
  }

  const submit = (value: string) => {
    const text = value.trim();
    if (!text) return;
    searchHistory.add(text);
    setQuery(text);
    setOpen(false);
    input.current?.blur();
    navigate({ name: 'search', keyword: text, type: 'song' });
  };

  const activate = (item: PanelItem) => {
    switch (item.kind) {
      case 'keyword': submit(item.keyword); break;
      case 'song': player.play(toTrack(item.track)); setOpen(false); break;
      case 'artist': setOpen(false); navigate({ name: 'artist', id: item.artist.id, title: item.artist.name }); break;
      case 'album': setOpen(false); navigate({ name: 'album', id: item.album.id, title: item.album.name }); break;
      case 'playlist': setOpen(false); navigate({ name: 'playlist', id: item.playlist.id, title: item.playlist.name }); break;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = items.current.length;
    if (event.key === 'ArrowDown' && count) { event.preventDefault(); setOpen(true); setActive(index => (index + 1) % count); }
    else if (event.key === 'ArrowUp' && count) { event.preventDefault(); setActive(index => (index <= 0 ? count - 1 : index - 1)); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items.current[active];
      if (item) activate(item);
      else submit(query || placeholder || '');
    } else if (event.key === 'Escape') { setOpen(false); input.current?.blur(); }
  };

  return (
    <div ref={box} className={styles.box}>
      <motion.div className={styles.field} data-open={open} animate={{ width: open ? 480 : 360 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
        <motion.span className={styles.icon} animate={{ scale: open ? 1.08 : 1, rotate: open ? -8 : 0 }}>
          <Search size={17} strokeWidth={1.4} aria-hidden />
        </motion.span>
        <input
          ref={input}
          type="search"
          value={query}
          onChange={event => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder || '搜索歌曲、歌手、歌单'}
          aria-label="搜索歌曲、歌手、歌单"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-panel"
          aria-activedescendant={active >= 0 ? `search-option-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <AnimatePresence>
          {query && (
            <motion.button type="button" className={styles.clear} onClick={() => { setQuery(''); input.current?.focus(); }} aria-label="清空搜索" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
              <X size={14} strokeWidth={1.6} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {open && (
          <SearchPanel
            keyword={keyword}
            discovery={discovery}
            active={active}
            onHover={setActive}
            onActivate={activate}
            onItems={setItems}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
