'use client';

import { AnimatePresence, motion, useTransform } from 'framer-motion';
import { BookOpen, ListPlus, Play } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { useNavigation } from '@/components/layout/navigation';
import { CardGrid } from '@/components/music/CardGrid';
import { PlaylistCard } from '@/components/music/PlaylistCard';
import { SongTable } from '@/components/music/SongTable';
import { usePlayer } from '@/components/player/player-store';
import { Page, StickyBar, useScrollArea } from '@/components/scroll';
import { Button, ListFooter, toast } from '@/components/ui';
import { catalogApi, useCatalog, type CatalogAlbum, type CatalogTrack } from '@/lib/catalog-client';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import { toTrack } from '@/lib/to-track';
import styles from './ArtistView.module.css';

const tabs = ['热门歌曲', '专辑', '歌手简介'] as const;
type Tab = (typeof tabs)[number];

function Songs({ id }: { id: string }) {
  const load = useCallback((offset: number, signal: AbortSignal) => catalogApi.artistSongs(id, offset, 50, signal), [id]);
  const list = useInfiniteList<CatalogTrack>(`artist-songs:${id}`, load);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);
  if (list.error && !list.items.length) return <ErrorState message={list.error} onRetry={list.retry} />;
  return (
    <>
      <SongTable tracks={list.items} loading={list.loading} animateFrom={Math.max(0, list.items.length - 50)} />
      <div ref={sentinel}><ListFooter error={list.error} onRetry={list.retry} loading={list.loadingMore} done={!list.loading && !list.hasMore && list.items.length > 0} doneText={`共 ${list.items.length} 首`} /></div>
    </>
  );
}

function Albums({ id }: { id: string }) {
  const { navigate } = useNavigation();
  const load = useCallback((offset: number, signal: AbortSignal) => catalogApi.artistAlbums(id, offset, 30, signal), [id]);
  const list = useInfiniteList<CatalogAlbum>(`artist-albums:${id}`, load);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);
  if (list.error && !list.items.length) return <ErrorState message={list.error} onRetry={list.retry} />;
  const year = (ms?: number) => (ms ? new Date(ms).getFullYear() : '');
  return (
    <>
      <CardGrid loading={list.loading}>
        {list.items.map(album => (
          <PlaylistCard
            key={album.id}
            playlist={{ id: album.id, source: album.source, name: album.name, cover: album.cover, trackCount: album.trackCount }}
            subtitle={[year(album.publishTime), album.trackCount ? `${album.trackCount}首` : ''].filter(Boolean).join(' · ')}
            onOpen={() => navigate({ name: 'album', id: album.id, title: album.name })}
          />
        ))}
      </CardGrid>
      {!list.loading && !list.error && !list.items.length && <p className={styles.empty}>平台暂未提供这位歌手的专辑</p>}
      <div ref={sentinel}><ListFooter error={list.error} onRetry={list.retry} loading={list.loadingMore} done={!list.loading && !list.hasMore && list.items.length > 0} doneText={`共 ${list.items.length} 张专辑`} /></div>
    </>
  );
}

function Biography({ id }: { id: string }) {
  const info = useCatalog(signal => catalogApi.artistBiography(id, signal), `artist-biography:${id}`);
  if (info.error) return <ErrorState message={info.error} onRetry={info.retry} />;
  if (info.loading) return <div className={styles.biography} aria-busy="true"><SkeletonBlock className={styles.bioSkeleton} /><SkeletonBlock className={styles.bioSkeleton} /></div>;
  const biography = info.data;
  if (!biography?.brief && !biography?.sections.length) return <p className={styles.empty}>平台暂未提供这位歌手的详细介绍</p>;
  return <div className={styles.biography}>
    {biography.brief && <section><h2><BookOpen size={18} strokeWidth={1.5} />歌手简介</h2><p>{biography.brief}</p></section>}
    {biography.sections.map((section, index) => <section key={`${section.title}:${index}`}><h2>{section.title}</h2><p>{section.text}</p></section>)}
  </div>;
}

/** Artist page: tinted hero with avatar and biography, sticky tabs for songs / albums. */
export function ArtistView({ id, title }: { id: string; title?: string }) {
  const player = usePlayer();
  const { scrollY } = useScrollArea();
  const info = useCatalog(signal => catalogApi.artist(id, signal), `artist:${id}`);
  const [tab, setTab] = useState<Tab>('热门歌曲');
  const [busy, setBusy] = useState(false);
  const fade = useTransform(scrollY, [40, 240], [1, 0], { clamp: true });
  const lift = useTransform(scrollY, [0, 240], [0, -20], { clamp: true });
  const avatarScale = useTransform(scrollY, [0, 220], [1, 0.86], { clamp: true });
  const artist = info.data;

  const playTop = async (enqueue = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const page = await catalogApi.artistSongs(id, 0, 50);
      const queue = page.items.map(toTrack);
      if (!queue[0]) { toast.info('这位歌手暂时没有可播放的歌曲'); return; }
      if (enqueue) { player.enqueue(queue); toast.success(`已将 ${queue.length} 首歌曲加入播放队列`); }
      else player.play(queue[0], queue);
    } catch (error) { toast.error(error instanceof Error ? error.message : '歌曲加载失败，请重试'); }
    finally { setBusy(false); }
  };

  if (info.error) return <Page><ErrorState message={info.error} onRetry={info.retry} /></Page>;

  return (
    <Page gap="sm">
      <header className={styles.hero}>
        <div className={styles.tint} aria-hidden>{artist && <Cover seed={`artist:${id}`} src={artist.cover ?? artist.avatar} className={styles.tintCover} />}</div>
        <motion.div className={styles.heroContent} style={{ opacity: fade, y: lift }}>
          <motion.div className={styles.avatarWrap} style={{ scale: avatarScale }}>
            {artist ? <Cover seed={`artist:${id}`} src={artist.avatar} className={styles.avatar} radius={999} /> : <SkeletonBlock className={styles.avatar} />}
          </motion.div>
          <div className={styles.meta}>
            <span className={styles.eyebrow}>歌手{artist?.identity ? ` · ${artist.identity}` : ''}</span>
            <h1>{artist?.name ?? title ?? <SkeletonBlock className={styles.titleSkeleton} />}</h1>
            {artist?.alias.length ? <p className={styles.alias}>{artist.alias.join(' / ')}</p> : null}
            {artist && (
              <div className={styles.stats}>
                {artist.songCount !== undefined && <span><strong>{artist.songCount}</strong> 首歌曲</span>}
                {artist.albumCount !== undefined && <span><strong>{artist.albumCount}</strong> 张专辑</span>}
              </div>
            )}
            {artist?.description && <p className={styles.description}>{artist.description}</p>}
            <div className={styles.actions}>
              <Button variant="primary" icon={<Play size={16} strokeWidth={0} fill="currentColor" />} onClick={() => void playTop()} disabled={!artist || busy}>{busy ? '正在加载…' : '播放热门歌曲'}</Button>
              <Button icon={<ListPlus size={16} strokeWidth={1.5} />} onClick={() => void playTop(true)} disabled={!artist || busy}>加入播放队列</Button>
            </div>
          </div>
        </motion.div>
      </header>

      <StickyBar compactTitle={artist?.name ?? title}>
        <Tabs items={tabs} value={tab} onChange={setTab} label="歌手内容" />
      </StickyBar>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} {...fadeSwap}>
          {tab === '热门歌曲' ? <Songs id={id} /> : tab === '专辑' ? <Albums id={id} /> : <Biography id={id} />}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
