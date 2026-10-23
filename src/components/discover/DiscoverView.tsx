'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { FilterRow } from '@/components/common/FilterRow';
import { useNavigation } from '@/components/layout/navigation';
import { CardGrid } from '@/components/music/CardGrid';
import { PlaylistCard } from '@/components/music/PlaylistCard';
import { CollapsingHeader, Page, StickyBar, useScrollArea } from '@/components/scroll';
import { Button, ListFooter } from '@/components/ui';
import { catalogApi, useCatalog, type CatalogPlaylist, type PlaylistOrder } from '@/lib/catalog-client';
import { useInfiniteList, useReachEnd } from '@/lib/hooks';
import styles from './Discover.module.css';

const orders = [
  { id: 'hot', label: '热门' },
  { id: 'quality', label: '精品' },
];
const PAGE = 24;

/**
 * 歌单广场 with web-style filters: one labelled row per category group plus a
 * 排序 row, each collapsing extra options behind 更多. The full filter block
 * scrolls with the page; a slim summary of the active filter stays pinned.
 */
export function DiscoverView() {
  const { navigate } = useNavigation();
  const { scrollY, scrollTo } = useScrollArea();
  const categories = useCatalog(catalogApi.categories, 'categories');
  const groups = categories.data?.groups ?? [];
  const [category, setCategory] = useState('');
  const [order, setOrder] = useState<PlaylistOrder>('hot');
  const orderLabel = orders.find(item => item.id === order)!.label;
  const filtersRef = useRef<HTMLDivElement>(null);

  // The API pages by an opaque cursor; remember the cursor for each loaded offset.
  const cursors = useRef(new Map<number, string | undefined>());
  const loadPage = useCallback(async (offset: number, signal: AbortSignal) => {
    if (offset === 0) cursors.current = new Map();
    const page = await catalogApi.playlists({ category, order, cursor: offset ? cursors.current.get(offset) : undefined, limit: PAGE }, signal);
    cursors.current.set(offset + page.items.length, page.cursor);
    return { items: page.items, total: page.total, hasMore: page.hasMore && Boolean(page.cursor) };
  }, [category, order]);
  const list = useInfiniteList<CatalogPlaylist>(`${category}|${order}`, loadPage);
  const sentinel = useReachEnd(list.loadMore, [list.items.length, list.hasMore]);

  // After changing a filter far down the page, bring results back into view.
  const refilter = (apply: () => void) => {
    const filtersBottom = (filtersRef.current?.offsetTop ?? 0) + (filtersRef.current?.offsetHeight ?? 0);
    if (scrollY.get() > filtersBottom) scrollTo(filtersBottom, true);
    apply();
  };

  return (
    <Page gap="sm">
      <CollapsingHeader title="歌单广场" subtitle="按语种、风格、场景和情感找到喜欢的歌单" />

      <div ref={filtersRef} className={styles.filters}>
        {categories.error ? <ErrorState message={categories.error} onRetry={categories.retry} /> : !groups.length ? (
          <div className={styles.filterSkeleton}>{Array.from({ length: 5 }, (_, index) => <SkeletonBlock key={index} className={styles.skeletonRow} />)}</div>
        ) : (
          <>
            {groups.map(group => (
              <FilterRow
                key={group.id}
                label={group.label}
                options={group.options.map(option => ({ id: option, label: option }))}
                // One category at a time across all groups; 全部 in any row clears it.
                value={group.options.includes(category) ? category : ''}
                onChange={value => refilter(() => setCategory(value))}
              />
            ))}
            <FilterRow label="排序" options={orders} value={order} allowAll={false} onChange={value => refilter(() => setOrder(value as PlaylistOrder))} />
          </>
        )}
      </div>

      <StickyBar compactTitle="歌单广场">
        <div className={styles.summary}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={category || 'all'} className={styles.chip} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              {category || '全部歌单'} · {orderLabel}
              {category && (
                <button type="button" onClick={() => refilter(() => setCategory(''))} aria-label="清除分类">
                  <X size={12} strokeWidth={1.8} />
                </button>
              )}
            </motion.span>
          </AnimatePresence>
          <Button variant="ghost" icon={<SlidersHorizontal size={14} strokeWidth={1.5} />} onClick={() => scrollTo(0, true)}>修改筛选</Button>
          {!list.loading && <span className={styles.total}>共 {list.total.toLocaleString('zh-CN')} 张歌单</span>}
        </div>
      </StickyBar>

      {list.error && !list.items.length ? <ErrorState message={list.error} onRetry={list.retry} /> : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${category}|${order}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <CardGrid loading={list.loading}>
              {list.items.map(playlist => (
                <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => navigate({ name: 'playlist', id: playlist.id, title: playlist.name })} />
              ))}
            </CardGrid>
          </motion.div>
        </AnimatePresence>
      )}

      <div ref={sentinel}>
        <ListFooter loading={list.loadingMore} done={!list.loading && !list.hasMore && list.items.length > 0} doneText="已经到底了" />
      </div>
    </Page>
  );
}
