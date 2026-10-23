'use client';

import { useCallback } from 'react';
import { ErrorState } from '@/components/common/AsyncState';
import { Tabs } from '@/components/common/Tabs';
import { useNavigation } from '@/components/layout/navigation';
import { ArtistCard } from '@/components/music/ArtistCard';
import { CardGrid } from '@/components/music/CardGrid';
import { PlaylistCard } from '@/components/music/PlaylistCard';
import { SongTable } from '@/components/music/SongTable';
import { CollapsingHeader, Page, StickyBar } from '@/components/scroll';
import { ListFooter } from '@/components/ui';
import { catalogApi, type CatalogAlbum, type CatalogArtist, type CatalogPlaylist, type CatalogTrack, type SearchType } from '@/lib/catalog-client';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import { BestMatch } from './BestMatch';
import styles from './SearchResultsView.module.css';

const tabs: Array<{ type: SearchType; label: string }> = [
  { type: 'song', label: '单曲' },
  { type: 'playlist', label: '歌单' },
  { type: 'album', label: '专辑' },
  { type: 'artist', label: '歌手' },
];
const PAGE: Record<SearchType, number> = { song: 50, playlist: 30, album: 30, artist: 30 };
type Item = CatalogTrack | CatalogPlaylist | CatalogAlbum | CatalogArtist;

export function SearchResultsView({ keyword, type }: { keyword: string; type: SearchType }) {
  const { replace, navigate } = useNavigation();
  const loadPage = useCallback(async (offset: number, signal: AbortSignal) => {
    const result = await catalogApi.search(keyword, type, offset, PAGE[type], signal);
    return { items: result.items as Item[], total: result.total, hasMore: result.hasMore };
  }, [keyword, type]);
  const list = useInfiniteList(`${type}:${keyword}`, loadPage);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore, type]);
  const label = tabs.find(tab => tab.type === type)!.label;

  return (
    <Page gap="sm">
      <CollapsingHeader
        title={<>搜索 <span className={styles.keyword}>“{keyword}”</span></>}
        subtitle={list.loading ? '正在搜索…' : `找到 ${list.total.toLocaleString('zh-CN')} 个${label}结果`}
      />
      <StickyBar compactTitle={`“${keyword}”`}>
        <Tabs items={tabs.map(tab => tab.label)} value={label} onChange={next => replace({ name: 'search', keyword, type: tabs.find(tab => tab.label === next)!.type })} label="结果类型" />
      </StickyBar>

      {type === 'song' && <BestMatch keyword={keyword} />}

      {list.error && !list.items.length ? <ErrorState message={list.error} onRetry={list.retry} /> : (
        <>
          {type === 'song' && (
            <SongTable tracks={list.items as CatalogTrack[]} loading={list.loading} animateFrom={Math.max(0, list.items.length - PAGE.song)} emptyText={`没有找到与“${keyword}”相关的歌曲`} />
          )}
          {type === 'playlist' && (
            <CardGrid loading={list.loading}>
              {(list.items as CatalogPlaylist[]).map(playlist => (
                <PlaylistCard key={playlist.id} playlist={playlist} subtitle={[playlist.trackCount ? `${playlist.trackCount}首` : '', playlist.creator].filter(Boolean).join(' · ')} onOpen={() => navigate({ name: 'playlist', id: playlist.id, title: playlist.name })} />
              ))}
            </CardGrid>
          )}
          {type === 'album' && (
            <CardGrid loading={list.loading}>
              {(list.items as CatalogAlbum[]).map(album => (
                <PlaylistCard key={album.id} playlist={{ id: album.id, source: album.source, name: album.name, cover: album.cover, trackCount: album.trackCount }} subtitle={album.artist} onOpen={() => navigate({ name: 'album', id: album.id, title: album.name })} />
              ))}
            </CardGrid>
          )}
          {type === 'artist' && (
            <CardGrid loading={list.loading} variant="artist">
              {(list.items as CatalogArtist[]).map(artist => <ArtistCard key={artist.id} artist={artist} />)}
            </CardGrid>
          )}
          {!list.loading && !list.items.length && type !== 'song' && <p className={styles.empty}>没有找到与“{keyword}”相关的{label}</p>}
        </>
      )}

      <div ref={sentinel}>
        <ListFooter loading={list.loadingMore} done={!list.loading && !list.hasMore && list.items.length > 0} doneText="没有更多结果了" />
      </div>
    </Page>
  );
}
