'use client';

import { useCallback, useMemo } from 'react';
import { FilterRow } from '@/components/common/FilterRow';
import { ErrorState } from '@/components/common/AsyncState';
import { Tabs } from '@/components/common/Tabs';
import { useNavigation } from '@/components/layout/navigation';
import { ArtistCard } from '@/components/music/ArtistCard';
import { CardGrid } from '@/components/music/CardGrid';
import { PlaylistCard } from '@/components/music/PlaylistCard';
import { SongTable } from '@/components/music/SongTable';
import { CollapsingHeader, Page, StickyBar } from '@/components/scroll';
import { ListFooter, toast } from '@/components/ui';
import { MvCardGrid } from '@/components/mv/MvGrid';
import { catalogApi, mvApi, type CatalogAlbum, type CatalogArtist, type CatalogPlaylist, type CatalogSource, type CatalogTrack, type MvSummary, type SearchType } from '@/lib/catalog-client';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import { isSource, SOURCE_NAMES } from '@/server/music/ids';
import { usePlayer } from '@/components/player/player-store';
import { fetchCollectionTracks, type CollectionRef } from '@/lib/collection-tracks';
import { QUEUE_LIMIT } from '@/lib/me-client';
import { useSettings } from '@/lib/settings';
import { MV_FEATURES } from '@/server/music/mv-features';
import { toTrack } from '@/lib/to-track';
import { BestMatch } from './BestMatch';
import styles from './SearchResultsView.module.css';

/** Catalog search types plus MV, which has its own endpoint. */
export type SearchTab = SearchType | 'mv';
const allTabs: Array<{ type: SearchTab; label: string }> = [
  { type: 'song', label: '单曲' },
  { type: 'playlist', label: '歌单' },
  { type: 'album', label: '专辑' },
  { type: 'artist', label: '歌手' },
  { type: 'mv', label: 'MV' },
];
const PAGE: Record<SearchTab, number> = { song: 50, playlist: 30, album: 30, artist: 30, mv: 24 };
type Item = CatalogTrack | CatalogPlaylist | CatalogAlbum | CatalogArtist | MvSummary;

const sourceOptions = Object.entries(SOURCE_NAMES).map(([id, label]) => ({ id, label }));
type SearchProps = { keyword: string; type: SearchTab; source?: CatalogSource };

export function SearchResultsView({ keyword, type, source: selectedSource }: SearchProps) {
  const { navigate, replace } = useNavigation();
  const preferred = useSettings().catalogSource;
  const source = selectedSource ?? preferred;
  const player = usePlayer();
  const tabs = allTabs.filter(tab => tab.type !== 'mv' || MV_FEATURES[source].search);
  const limit = PAGE[type];
  const loadPage = useCallback(async (offset: number, signal: AbortSignal) => {
    const result = type === 'mv'
      ? await mvApi.search(keyword, offset, limit, signal, source)
      : await catalogApi.search(keyword, type, offset, limit, signal, source);
    return { items: result.items as Item[], total: result.total, hasMore: result.hasMore };
  }, [keyword, type, limit, source]);
  const list = useInfiniteList(`${source}:${type}:${keyword}`, loadPage);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore, source, type]);
  const label = allTabs.find(tab => tab.type === type)!.label;
  const items = list.items;
  const songs = useMemo(() => type === 'song' ? (items as CatalogTrack[]).map(toTrack) : [], [items, type]);

  const playCollection = async (kind: CollectionRef['kind'], id: string) => {
    try {
      const tracks = await fetchCollectionTracks({ kind, id, source }, [], QUEUE_LIMIT);
      if (tracks.length) player.play(tracks[0], tracks);
      else toast.info('暂无可播放的歌曲');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '歌曲加载失败');
    }
  };

  return (
    <Page gap="sm">
      <CollapsingHeader
        title={<>搜索 <span className={styles.keyword}>“{keyword}”</span></>}
        subtitle={list.loading ? '正在搜索…' : list.error && !items.length ? undefined : `找到 ${list.total.toLocaleString('zh-CN')} 个${label}结果`}
      />
      <StickyBar compactTitle={`“${keyword}”`}>
        <Tabs items={tabs.map(tab => tab.label)} value={label} onChange={next => replace({ name: 'search', keyword, source: selectedSource, type: tabs.find(tab => tab.label === next)!.type })} label="结果类型" />
      </StickyBar>
      <FilterRow label="搜索源" options={sourceOptions} value={source} allowAll={false} onChange={next => {
        if (isSource(next) && next !== source) replace({ name: 'search', keyword, type, source: next });
      }} />
      {type === 'song' && <BestMatch keyword={keyword} source={source} />}

      {list.error && !list.items.length ? <ErrorState message={list.error} onRetry={list.retry} /> : (
        <>
          {type === 'song' && (
            <SongTable tracks={songs} loading={list.loading} animateFrom={Math.max(0, list.items.length - limit)} emptyText={`没有找到与“${keyword}”相关的歌曲`} />
          )}
          {type === 'playlist' && (
            <CardGrid loading={list.loading}>
              {(items as CatalogPlaylist[]).map(playlist => (
                <PlaylistCard key={playlist.id} playlist={playlist} subtitle={[playlist.trackCount ? `${playlist.trackCount}首` : '', playlist.creator].filter(Boolean).join(' · ')} onOpen={() => navigate({ name: 'playlist', id: playlist.id, source, title: playlist.name })} onPlay={() => void playCollection('playlist', playlist.id)} />
              ))}
            </CardGrid>
          )}
          {type === 'album' && (
            <CardGrid loading={list.loading}>
              {(items as CatalogAlbum[]).map(album => (
                <PlaylistCard key={album.id} playlist={{ id: album.id, source: album.source, name: album.name, cover: album.cover, trackCount: album.trackCount }} subtitle={album.artist} onOpen={() => navigate({ name: 'album', id: album.id, source, title: album.name })} onPlay={() => void playCollection('album', album.id)} />
              ))}
            </CardGrid>
          )}
          {type === 'artist' && (
            <CardGrid loading={list.loading} variant="artist">
              {(items as CatalogArtist[]).map(artist => <ArtistCard key={artist.id} artist={artist} />)}
            </CardGrid>
          )}
          {type === 'mv' && <MvCardGrid items={items as MvSummary[]} loading={list.loading} />}
          {!list.loading && !list.items.length && type !== 'song' && <p className={styles.empty}>没有找到与“{keyword}”相关的{label}</p>}
        </>
      )}

      <div ref={sentinel}>
        <ListFooter error={items.length ? list.error : undefined} onRetry={list.retry} loading={list.loadingMore} done={!list.loading && !list.hasMore && list.items.length > 0} doneText="没有更多结果了" />
      </div>
    </Page>
  );
}
