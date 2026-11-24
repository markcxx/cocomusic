'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Import } from 'lucide-react';
import { useState } from 'react';
import { useAccount } from '@/components/account/account-store';
import { useSettings } from '@/lib/settings';
import { fadeSwap } from '@/components/common/motion';
import { Tabs } from '@/components/common/Tabs';
import { CollapsingHeader, Page, StickyBar, useScrollArea } from '@/components/scroll';
import { ImportPlaylistDialog } from '@/components/playlists/ImportPlaylistDialog';
import { Button } from '@/components/ui';
import { homeTabs, type HomeTab } from '@/lib/mock-data';
import { ArtistsTab } from './ArtistsTab';
import { FeaturedTab } from './FeaturedTab';
import { NewReleasesTab } from './NewReleasesTab';
import styles from './Home.module.css';

const panels: Record<HomeTab, () => React.JSX.Element> = {
  精选: FeaturedTab,
  新歌速递: NewReleasesTab,
  热门歌手: ArtistsTab,
};

export function HomeView() {
  const [tab, setTab] = useState<HomeTab>('精选');
  const [importing, setImporting] = useState(false);
  const { scrollY, scrollTo } = useScrollArea();
  const Panel = panels[tab];
  const { profile } = useAccount();
  const source = useSettings().catalogSource;
  const personal = tab === '精选' && (source === 'qq' || source === 'netease') && profile?.source === source;
  const title = personal ? (profile.nickname ? `Hi ${profile.nickname}，今日为你推荐` : '今日为你推荐') : '发现好音乐';

  // Switching tab while scrolled returns to just under the header, so the new panel starts in view.
  const changeTab = (next: HomeTab) => {
    if (scrollY.get() > 80) scrollTo(80, true);
    setTab(next);
  };

  return (
    <Page>
      <CollapsingHeader title={title} actions={<Button icon={<Import size={15} strokeWidth={1.4} />} onClick={() => setImporting(true)}>导入歌单</Button>} />
      <StickyBar compactTitle={personal ? '今日为你推荐' : title} className={styles.tabsBar}>
        <Tabs items={homeTabs} value={tab} onChange={changeTab} label="首页内容" />
      </StickyBar>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} className={styles.panel} role="tabpanel" aria-label={tab} {...fadeSwap}>
          <Panel />
        </motion.div>
      </AnimatePresence>
      <ImportPlaylistDialog open={importing} onClose={() => setImporting(false)} />
    </Page>
  );
}
