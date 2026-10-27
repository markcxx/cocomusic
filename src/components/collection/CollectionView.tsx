'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ListChecks, Play } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { ErrorState } from '@/components/common/AsyncState';
import { SearchField } from '@/components/common/SearchField';
import { SelectionBar } from '@/components/music/SelectionBar';
import { SongTable, trackKey } from '@/components/music/SongTable';
import { usePlayer } from '@/components/player/player-store';
import { Page, StickyBar } from '@/components/scroll';
import { Button, IconButton, ListFooter } from '@/components/ui';
import { catalogApi, type CatalogTrack, type CollectionInfo } from '@/lib/catalog-client';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import { useSelection } from '@/lib/selection';
import { settings as appSettings } from '@/lib/settings';
import { toTrack } from '@/lib/to-track';
import { downloads } from '@/components/downloads/download-store';
import { CollectionHeader } from './CollectionHeader';
import styles from './CollectionView.module.css';

const PAGE = 50;

/** Playlist or album detail: hero, sticky toolbar (filter, multi-select), paged song table. */
export function CollectionView({ kind, id, title }: { kind: 'playlist' | 'album'; id: string; title?: string }) {
  const player = usePlayer();
  const { addToPlaylist } = useAccount();
  const [info, setInfo] = useState<CollectionInfo>();
  const [filter, setFilter] = useState('');

  const loadPage = useCallback(async (offset: number, signal: AbortSignal) => {
    const detail = kind === 'album' ? await catalogApi.album(id, signal) : await catalogApi.playlist(id, offset, PAGE, signal);
    setInfo(detail.info);
    return { items: detail.tracks, total: detail.info.trackCount, hasMore: detail.hasMore };
  }, [kind, id]);
  const list = useInfiniteList(`${kind}:${id}`, loadPage);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);

  const needle = filter.trim().toLowerCase();
  const visible = useMemo(() => (needle
    ? list.items.filter(track => `${track.title} ${track.artist} ${track.album ?? ''}`.toLowerCase().includes(needle))
    : list.items), [list.items, needle]);
  const visibleKeys = useMemo(() => visible.map(trackKey), [visible]);
  const selection = useSelection(visibleKeys);

  const playTracks = (tracks: typeof visible) => {
    const queue = tracks.map(toTrack);
    if (queue[0]) player.play(queue[0], queue);
  };

  /** Every track of the collection (albums are complete; playlists may need more pages). */
  const fetchRest = useCallback(async (have: CatalogTrack[], cap: number) => {
    const all = [...have];
    while (all.length < cap) {
      const page = await catalogApi.playlist(id, all.length, 200).catch(() => null);
      if (!page?.tracks.length) break;
      all.push(...page.tracks);
      if (!page.hasMore) break;
    }
    return all;
  }, [id]);
  const complete = kind === 'album' || !list.hasMore;

  /**
   * Play from the collection with the whole list as the queue. Playback starts
   * at once with the rows loaded so far; the remaining pages are fetched in the
   * background and appended — unless the user replaced the queue meanwhile.
   * A filtered view plays just its matches (they are all loaded already).
   */
  const playCollection = (start: CatalogTrack | undefined, mode: 'play' | 'list') => {
    const loaded = needle ? visible : list.items;
    const first = start ?? loaded[0];
    if (!first) return;
    const queue = loaded.map(toTrack);
    const startTrack = toTrack(first);
    if (mode === 'list') player.playFromList(startTrack, queue); else player.play(startTrack, queue);
    // 设置 › 播放 › 双击歌曲 = 插入: only that song joins the queue, nothing to extend.
    if (needle || complete || (mode === 'list' && appSettings.get().doubleClick === 'insert')) return;
    const before = queue.map(item => item.id).join('|');
    void fetchRest(list.items, Math.min(info?.trackCount ?? 2000, 2000)).then(all => {
      // Only extend the queue we set (the user may have played something else since).
      if (player.queueIds() !== before) return;
      player.enqueue(all.slice(list.items.length).map(toTrack));
    });
  };

  const downloadAll = async () => {
    if (complete) { await downloads.add(list.items); return; }
    await downloads.add(await fetchRest(list.items, Math.min(info?.trackCount ?? 0, 1000)));
  };
  // Keep playlist order for batch actions regardless of click order.
  const selectedTracks = () => list.items.filter(track => selection.selected.has(trackKey(track)));

  if (list.error && !list.items.length) return <Page><ErrorState message={list.error} onRetry={list.retry} /></Page>;

  return (
    <Page gap="sm">
      <CollectionHeader info={info} fallbackTitle={title} onPlayAll={() => playCollection(undefined, 'play')} onDownloadAll={() => void downloadAll()} />
      <StickyBar compactTitle={info?.name ?? title}>
        <div className={styles.toolbar}>
          <span className={styles.count}>
            歌曲 <small>{info?.trackCount ?? '—'}</small>
            {needle && <small className={styles.matches}>匹配 {visible.length} 首</small>}
          </span>
          <IconButton label="播放全部" onClick={() => playCollection(undefined, 'play')} disabled={!visible.length}>
            <Play size={16} strokeWidth={0} fill="currentColor" />
          </IconButton>
          <AnimatePresence initial={false} mode="wait">
            {selection.active ? (
              <motion.span key="selecting" className={styles.selectHint} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}>
                点击行勾选，Shift 连选
              </motion.span>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}>
                <Button variant="ghost" icon={<ListChecks size={15} strokeWidth={1.5} />} onClick={selection.start} disabled={!visible.length}>批量操作</Button>
              </motion.span>
            )}
          </AnimatePresence>
          <SearchField value={filter} onChange={setFilter} placeholder="在列表中搜索" label="筛选歌曲" className={styles.filter} />
        </div>
      </StickyBar>
      <SongTable
        tracks={visible}
        loading={list.loading}
        showAlbum={kind === 'playlist'}
        selection={selection}
        playlistId={kind === 'playlist' ? id : undefined}
        onRemoved={trackId => list.removeWhere(track => track.id === trackId)}
        onPlayTrack={playCollection}
        animateFrom={needle ? 0 : Math.max(0, list.items.length - PAGE)}
        emptyText={needle ? '没有匹配的歌曲' : '暂无公开歌曲'}
      />
      <div ref={sentinel}>
        <ListFooter error={list.error} onRetry={list.retry} loading={list.loadingMore} loadingText="正在加载更多歌曲" done={!list.loading && !list.hasMore && list.items.length > PAGE && !needle} doneText={`已显示全部 ${list.items.length} 首`} />
      </div>
      <SelectionBar
        selection={selection}
        onPlay={() => { playTracks(selectedTracks()); selection.exit(); }}
        onQueue={() => { player.enqueue(selectedTracks().map(toTrack)); selection.exit(); }}
        onCollect={async playlistId => { await addToPlaylist(playlistId, selectedTracks().map(track => track.id)); selection.exit(); }}
        onDownload={() => { void downloads.add(selectedTracks()); selection.exit(); }}
      />
    </Page>
  );
}
