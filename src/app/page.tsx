'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect } from 'react';
import { LikedView } from '@/components/account/LikedView';
import { ArtistView } from '@/components/artist/ArtistView';
import { ChartsView } from '@/components/charts/ChartsView';
import { CommentsView } from '@/components/comments/CommentsView';
import { easeOut } from '@/components/common/motion';
import { PlaceholderView } from '@/components/common/PlaceholderView';
import { CollectionView } from '@/components/collection/CollectionView';
import { DiscoverView } from '@/components/discover/DiscoverView';
import { HomeView } from '@/components/home/HomeView';
import { AppShell } from '@/components/layout/AppShell';
import { routeTitles, useNavigation, type Route } from '@/components/layout/navigation';
import { useScrollArea } from '@/components/scroll';
import { SearchResultsView } from '@/components/search/SearchResultsView';

function View({ route }: { route: Route }) {
  switch (route.name) {
    case 'home': return <HomeView />;
    case 'discover': return <DiscoverView />;
    case 'charts': return <ChartsView />;
    case 'playlist': return <CollectionView kind="playlist" id={route.id} title={route.title} />;
    case 'album': return <CollectionView kind="album" id={route.id} title={route.title} />;
    case 'artist': return <ArtistView id={route.id} title={route.title} />;
    case 'liked': return <LikedView />;
    case 'search': return <SearchResultsView keyword={route.keyword} type={route.type ?? 'song'} />;
    case 'comments': return <CommentsView songId={route.songId} title={route.title} artist={route.artist} cover={route.cover} />;
    default: return <PlaceholderView title={routeTitles[route.name]} />;
  }
}

/** Restore the entry's scroll offset once its view has mounted (fresh pages start at 0). */
function ScrollRestorer({ top }: { top: number }) {
  const { scrollTo } = useScrollArea();
  useLayoutEffect(() => {
    scrollTo(top);
    // Images and data may grow the page after mount; retry once content settles.
    const timer = setTimeout(() => scrollTo(top), 120);
    return () => clearTimeout(timer);
  }, [scrollTo, top]);
  return null;
}

function CurrentView() {
  const { route, entryKey, restoreScrollTop } = useNavigation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={entryKey}
        initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
        transition={{ duration: 0.26, ease: easeOut }}
      >
        <ScrollRestorer top={restoreScrollTop} />
        <View route={route} />
      </motion.div>
    </AnimatePresence>
  );
}

export default function Page() {
  return (
    <AppShell>
      <CurrentView />
    </AppShell>
  );
}
