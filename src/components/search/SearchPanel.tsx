'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Clock3, Disc3, ListMusic, Mic2, Music2, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { catalogApi, useCatalog, type CatalogAlbum, type CatalogArtist, type CatalogPlaylist, type CatalogTrack, type Resource, type SearchDiscovery } from '@/lib/catalog-client';
import { cn } from '@/lib/cn';
import { searchHistory, useSearchHistory } from '@/lib/search-history';
import { Highlight } from './Highlight';
import styles from './SearchPanel.module.css';

/** Every keyboard-reachable row in the panel, in display order. */
export type PanelItem =
  | { kind: 'keyword'; keyword: string }
  | { kind: 'song'; track: CatalogTrack }
  | { kind: 'artist'; artist: CatalogArtist }
  | { kind: 'album'; album: CatalogAlbum }
  | { kind: 'playlist'; playlist: CatalogPlaylist };

type Props = {
  keyword: string;
  discovery: Resource<SearchDiscovery>;
  active: number;
  onHover: (index: number) => void;
  onActivate: (item: PanelItem) => void;
  onItems: (items: PanelItem[]) => void;
};

function Row({ index, active, onHover, onActivate, item, children, className }: { index: number; item: PanelItem; children: ReactNode; className?: string } & Pick<Props, 'active' | 'onHover' | 'onActivate'>) {
  return (
    <button
      type="button"
      id={`search-option-${index}`}
      role="option"
      aria-selected={active === index}
      className={cn(styles.row, active === index && styles.active, className)}
      onPointerEnter={() => onHover(index)}
      onClick={() => onActivate(item)}
    >
      {children}
    </button>
  );
}

function Empty({ props }: { props: Props }) {
  const history = useSearchHistory();
  const { discovery } = props;
  const hotList = discovery.data?.hot;
  const hot = useMemo(() => hotList ?? [], [hotList]);
  const items = useMemo<PanelItem[]>(() => [
    ...history.map(keyword => ({ kind: 'keyword' as const, keyword })),
    ...hot.map(entry => ({ kind: 'keyword' as const, keyword: entry.keyword })),
  ], [history, hot]);
  const { onItems } = props;
  useEffect(() => onItems(items), [items, onItems]);

  return (
    <>
      {history.length > 0 && (
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <span>搜索历史</span>
            <button type="button" className={styles.clearAll} onClick={() => searchHistory.clear()} aria-label="清空搜索历史" data-tooltip="清空搜索历史">
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </header>
          <div className={styles.chips}>
            {history.map((entry, index) => (
              <span key={entry} className={cn(styles.chip, props.active === index && styles.chipActive)} onPointerEnter={() => props.onHover(index)}>
                <button type="button" id={`search-option-${index}`} role="option" aria-selected={props.active === index} onClick={() => props.onActivate({ kind: 'keyword', keyword: entry })}>{entry}</button>
                <button type="button" className={styles.chipRemove} onClick={() => searchHistory.remove(entry)} aria-label={`删除 ${entry}`}>
                  <X size={11} strokeWidth={1.8} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
      <section className={styles.section}>
        <header className={styles.sectionHeader}><span>热搜榜</span></header>
        {discovery.loading && !hot.length ? (
          <div className={styles.hotGrid}>{Array.from({ length: 10 }, (_, i) => <SkeletonBlock key={i} className={styles.skeletonRow} />)}</div>
        ) : (
          <ol className={styles.hotGrid}>
            {hot.map((entry, index) => {
              const position = history.length + index;
              return (
                <li key={entry.keyword}>
                  <Row index={position} item={{ kind: 'keyword', keyword: entry.keyword }} {...props} className={styles.hotRow}>
                    <span className={cn(styles.hotRank, index < 3 && styles.hotTop)}>{index + 1}</span>
                    <span className={styles.hotText}>
                      <strong>{entry.keyword}</strong>
                      {entry.note && <small>{entry.note}</small>}
                    </span>
                    {entry.badge && <span className={cn(styles.badge, styles[`badge_${entry.badge}`])}>{{ hot: '热', new: '新', up: '升' }[entry.badge]}</span>}
                  </Row>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

function Suggestions({ keyword, props }: { keyword: string; props: Props }) {
  const { data, loading } = useCatalog(signal => catalogApi.suggest(keyword, signal), `suggest:${keyword}`);
  const items = useMemo<PanelItem[]>(() => {
    const list: PanelItem[] = [{ kind: 'keyword', keyword }];
    for (const word of data?.keywords ?? []) if (word !== keyword) list.push({ kind: 'keyword', keyword: word });
    for (const track of data?.songs ?? []) list.push({ kind: 'song', track });
    for (const artist of data?.artists ?? []) list.push({ kind: 'artist', artist });
    for (const album of data?.albums ?? []) list.push({ kind: 'album', album });
    for (const playlist of data?.playlists ?? []) list.push({ kind: 'playlist', playlist });
    return list;
  }, [data, keyword]);
  const { onItems } = props;
  useEffect(() => onItems(items), [items, onItems]);

  const groups: Array<{ kind: PanelItem['kind']; label: string; icon: ReactNode }> = [
    { kind: 'song', label: '单曲', icon: <Music2 size={13} strokeWidth={1.6} /> },
    { kind: 'artist', label: '歌手', icon: <Mic2 size={13} strokeWidth={1.6} /> },
    { kind: 'album', label: '专辑', icon: <Disc3 size={13} strokeWidth={1.6} /> },
    { kind: 'playlist', label: '歌单', icon: <ListMusic size={13} strokeWidth={1.6} /> },
  ];
  const completions = items.filter(item => item.kind === 'keyword');

  return (
    <>
      <section className={styles.section}>
        {completions.map((item, index) => item.kind === 'keyword' && (
          <Row key={item.keyword} index={index} item={item} {...props}>
            <Search size={14} strokeWidth={1.5} className={styles.rowIcon} />
            <span className={styles.rowText}>{index === 0 ? <>搜索 “<strong>{item.keyword}</strong>”</> : <Highlight text={item.keyword} match={keyword} />}</span>
          </Row>
        ))}
      </section>
      {loading && !data && (
        <section className={styles.section}>{Array.from({ length: 4 }, (_, i) => <SkeletonBlock key={i} className={styles.skeletonRow} />)}</section>
      )}
      {groups.map(group => {
        const entries = items.map((item, index) => ({ item, index })).filter(entry => entry.item.kind === group.kind);
        if (!entries.length) return null;
        return (
          <section key={group.kind} className={styles.section}>
            <header className={styles.sectionHeader}><span className={styles.groupLabel}>{group.icon}{group.label}</span></header>
            {entries.map(({ item, index }) => (
              <Row key={`${item.kind}:${index}`} index={index} item={item} {...props}>
                <SuggestionContent item={item} keyword={keyword} />
              </Row>
            ))}
          </section>
        );
      })}
    </>
  );
}

function SuggestionContent({ item, keyword }: { item: PanelItem; keyword: string }) {
  switch (item.kind) {
    case 'song':
      return <><Cover seed={`s:${item.track.id}`} src={item.track.cover} size={32} radius={6} /><span className={styles.rowText}><Highlight text={item.track.title} match={keyword} /><small> — {item.track.artist}</small></span></>;
    case 'artist':
      return <><Cover seed={`a:${item.artist.id}`} src={item.artist.avatar} size={32} radius={999} /><span className={styles.rowText}><Highlight text={item.artist.name} match={keyword} />{item.artist.alias && <small> {item.artist.alias}</small>}</span></>;
    case 'album':
      return <><Cover seed={`al:${item.album.id}`} src={item.album.cover} size={32} radius={6} /><span className={styles.rowText}><Highlight text={item.album.name} match={keyword} /><small> — {item.album.artist}</small></span></>;
    case 'playlist':
      return <><Cover seed={`p:${item.playlist.id}`} src={item.playlist.cover} size={32} radius={6} /><span className={styles.rowText}><Highlight text={item.playlist.name} match={keyword} />{item.playlist.trackCount ? <small> · {item.playlist.trackCount}首</small> : null}</span></>;
    default:
      return null;
  }
}

export function SearchPanel(props: Props) {
  return (
    <motion.div
      id="search-panel"
      role="listbox"
      className={styles.panel}
      data-scroll-native
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={props.keyword ? 'suggest' : 'empty'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          {props.keyword ? <Suggestions keyword={props.keyword} props={props} /> : <Empty props={props} />}
        </motion.div>
      </AnimatePresence>
      <footer className={styles.footer}>
        <Clock3 size={12} strokeWidth={1.5} />
        <span>↑↓ 选择 · Enter 确认 · Esc 关闭</span>
      </footer>
    </motion.div>
  );
}
