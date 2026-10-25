'use client';

import { motion } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { FilterRow } from '@/components/common/FilterRow';
import { staggerList } from '@/components/common/motion';
import { ArtistCard } from '@/components/music/ArtistCard';
import { CollapsingHeader, Page, StickyBar, useScrollArea } from '@/components/scroll';
import { Button, ListFooter } from '@/components/ui';
import { ARTIST_FILTERS, type ArtistFilterKey } from '@/lib/artist-directory';
import { catalogApi, type CatalogArtist, type CatalogSource } from '@/lib/catalog-client';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import { useSettings } from '@/lib/settings';
import filters from '@/components/discover/Discover.module.css';
import styles from './ArtistsView.module.css';

function Directory({ source }: { source: CatalogSource }) {
  const { scrollTo } = useScrollArea();
  const [selection, setSelection] = useState({ area: '', type: '', genre: '', initial: '' });
  const groups = ARTIST_FILTERS[source];
  const load = useCallback((offset: number, signal: AbortSignal) => catalogApi.artistDirectory({ ...selection, offset, limit: 48 }, signal), [selection]);
  const key = `${source}:${JSON.stringify(selection)}`;
  const list = useInfiniteList<CatalogArtist>(key, load);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);
  const selected = groups.map(group => group.options.find(option => option.id === selection[group.key])?.label).filter(Boolean);
  const change = (key: ArtistFilterKey, value: string) => { setSelection(previous => ({ ...previous, [key]: value })); scrollTo(0, true); };
  return <Page gap="sm">
    <CollapsingHeader title="歌手" subtitle="按地区、类型与首字母，发现你喜欢的声音" />
    <div className={filters.filters}>
      {groups.map(group => <FilterRow key={group.key} label={group.label} options={group.options} value={selection[group.key]} allowAll={group.key !== 'initial'} onChange={value => change(group.key, value)} />)}
    </div>
    <StickyBar compactTitle="歌手">
      <div className={filters.summary}>
        <span className={filters.chip}>{selected.join(' · ') || '歌手'}</span>
        <Button variant="ghost" icon={<SlidersHorizontal size={14} strokeWidth={1.5} />} onClick={() => scrollTo(0, true)}>修改筛选</Button>
        <span className={filters.total}>{list.loading ? '正在加载' : `已加载 ${list.items.length.toLocaleString('zh-CN')} 位歌手`}</span>
      </div>
    </StickyBar>
    {list.error && !list.items.length ? <ErrorState message={list.error} onRetry={list.retry} /> : list.loading ? <div className={styles.grid} aria-busy="true">{Array.from({ length: 18 }, (_, index) => <div key={index} className={styles.skeleton}><SkeletonBlock className={styles.avatar} /><SkeletonBlock className={styles.name} /></div>)}</div> : <motion.div key={key} className={styles.grid} variants={staggerList} initial="hidden" animate="show">{list.items.map(artist => <ArtistCard key={artist.id} artist={artist} />)}</motion.div>}
    {!list.loading && !list.error && !list.items.length && <div className={styles.empty}><p>没有找到符合条件的歌手</p><Button onClick={() => setSelection({ area: '', type: '', genre: '', initial: '' })}>清除筛选</Button></div>}
    <div ref={sentinel}><ListFooter loading={list.loadingMore} error={list.items.length ? list.error : ''} onRetry={list.retry} done={!list.loading && !list.hasMore && list.items.length > 0} doneText="已经到底了" /></div>
    {list.hasMore && !list.loadingMore && !list.error && <div className={styles.more}><Button onClick={list.loadMore}>加载更多歌手</Button></div>}
  </Page>;
}

/** A platform switch resets filters whose ids belong to the previous catalog. */
export function ArtistsView() {
  const source = useSettings().catalogSource;
  return <Directory key={source} source={source} />;
}
