'use client';

import { useCallback, useMemo, useState } from 'react';
import { ErrorState } from '@/components/common/AsyncState';
import { useNavigation } from '@/components/layout/navigation';
import { SelectionBar } from '@/components/music/SelectionBar';
import { SongTable } from '@/components/music/SongTable';
import { usePlayer } from '@/components/player/player-store';
import { Page } from '@/components/scroll';
import { ListFooter, toast } from '@/components/ui';
import { downloads } from '@/components/downloads/download-store';
import { catalogApi, type CatalogSource, type CollectionInfo } from '@/lib/catalog-client';
import { fetchCollectionTracks, saveCollectionLocally, type CollectionRef } from '@/lib/collection-tracks';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import { settings as appSettings } from '@/lib/settings';
import { catalogTracks, toTrack } from '@/lib/to-track';
import type { Track } from '@/types/music';
import { CollectionHeader } from './CollectionHeader';
import { CollectionToolbar, useTrackFilter } from './CollectionToolbar';

const PAGE = 50;
/** Queue and download batches stop here (the queue holds 2000). */
const QUEUE_CAP = 2000;
const DOWNLOAD_CAP = 1000;

/**
 * Playlist or album detail: hero, sticky toolbar (filter, multi-select), paged
 * song table. `source` opens a collection of another platform than the
 * selected one (imported links, links from mixed lists).
 */
export function CollectionView({ kind, id, source, title }: { kind: 'playlist' | 'album'; id: string; source?: CatalogSource; title?: string }) {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const [info, setInfo] = useState<CollectionInfo>();
  const ref = useMemo<CollectionRef>(() => ({ kind, id, source }), [kind, id, source]);

  const loadPage = useCallback(async (offset: number, signal: AbortSignal) => {
    const detail = kind === 'album' ? await catalogApi.album(id, signal, source) : await catalogApi.playlist(id, offset, PAGE, signal, source);
    setInfo(detail.info);
    return { items: detail.tracks.map(toTrack), total: detail.info.trackCount, hasMore: detail.hasMore };
  }, [kind, id, source]);
  const list = useInfiniteList<Track>(`${kind}:${source ?? ''}:${id}`, loadPage);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);
  const { filter, setFilter, filtering, visible, selection, selectedTracks } = useTrackFilter(list.items);
  const complete = kind === 'album' || !list.hasMore;

  /**
   * Play from the collection with the whole list as the queue. Playback starts
   * at once with the rows loaded so far; the remaining pages are fetched in the
   * background and appended — unless the user replaced the queue meanwhile.
   * A filtered view plays just its matches (they are all loaded already).
   */
  const playCollection = (start: Track | undefined, mode: 'play' | 'list') => {
    const queue = filtering ? visible : list.items;
    const first = start ?? queue[0];
    if (!first) return;
    if (mode === 'list') player.playFromList(first, queue); else player.play(first, queue);
    // 设置 › 播放 › 双击歌曲 = 插入: only that song joins the queue, nothing to extend.
    if (filtering || complete || (mode === 'list' && appSettings.get().doubleClick === 'insert')) return;
    const before = queue.map(item => item.id).join('|');
    void fetchCollectionTracks(ref, list.items, Math.min(info?.trackCount ?? QUEUE_CAP, QUEUE_CAP)).then(all => {
      // Only extend the queue we set (the user may have played something else since).
      if (player.queueIds() !== before) return;
      player.enqueue(all.slice(list.items.length));
    }).catch(() => undefined);
  };

  const downloadAll = async () => {
    const all = complete ? list.items : await fetchCollectionTracks(ref, list.items, Math.min(info?.trackCount ?? 0, DOWNLOAD_CAP));
    await downloads.add(catalogTracks(all));
  };

  const saveLocally = async () => {
    if (!info) return;
    try {
      const playlist = await saveCollectionLocally(ref, info, complete ? list.items : []);
      toast.success(`已存为本地歌单「${playlist.name}」，共 ${playlist.trackCount} 首`);
      navigate({ name: 'local-playlist', id: playlist.id, title: playlist.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  if (list.error && !list.items.length) return <Page><ErrorState message={list.error} onRetry={list.retry} /></Page>;

  const playlistRef = kind === 'playlist' ? { kind: 'platform' as const, id } : undefined;
  return (
    <Page gap="sm">
      <CollectionHeader info={info} fallbackTitle={title} onPlayAll={() => playCollection(undefined, 'play')} onDownloadAll={() => void downloadAll()} onSaveLocally={saveLocally} />
      <CollectionToolbar
        title={info?.name ?? title}
        total={info?.trackCount}
        filter={filter}
        onFilter={setFilter}
        visibleCount={visible.length}
        selection={selection}
        onPlayAll={() => playCollection(undefined, 'play')}
      />
      <SongTable
        tracks={visible}
        loading={list.loading}
        showAlbum={kind === 'playlist'}
        selection={selection}
        playlist={playlistRef}
        onRemoved={trackId => list.removeWhere(track => track.id === trackId)}
        onPlayTrack={playCollection}
        animateFrom={filtering ? 0 : Math.max(0, list.items.length - PAGE)}
        emptyText={filtering ? '没有匹配的歌曲' : '暂无公开歌曲'}
      />
      <div ref={sentinel}>
        <ListFooter error={list.error} onRetry={list.retry} loading={list.loadingMore} loadingText="正在加载更多歌曲" done={!list.loading && !list.hasMore && list.items.length > PAGE && !filtering} doneText={`已显示全部 ${list.items.length} 首`} />
      </div>
      <SelectionBar
        selection={selection}
        selectedTracks={selectedTracks}
        playlist={playlistRef}
        onPlay={() => { const tracks = selectedTracks(); if (tracks[0]) player.play(tracks[0], tracks); selection.exit(); }}
        onQueue={() => { player.enqueue(selectedTracks()); selection.exit(); }}
        onDownload={() => { void downloads.add(catalogTracks(selectedTracks())); selection.exit(); }}
      />
    </Page>
  );
}
