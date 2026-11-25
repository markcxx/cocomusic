'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Film } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { FilterRow } from '@/components/common/FilterRow';
import { fadeSwap } from '@/components/common/motion';
import { SearchField } from '@/components/common/SearchField';
import { Tabs } from '@/components/common/Tabs';
import { useNavigation } from '@/components/layout/navigation';
import { CollapsingHeader, Page, StickyBar } from '@/components/scroll';
import { mvApi, type MvArea, type MvBrowseKind } from '@/lib/catalog-client';
import { useSettings } from '@/lib/settings';
import { SOURCE_NAMES } from '@/server/music/ids';
import { MV_AREAS, MV_BROWSE_LABELS, MV_FEATURES } from '@/server/music/mv-features';
import { MvList } from './MvGrid';
import styles from './MvDiscoverView.module.css';

const PAGE = 24;
const areaOptions = MV_AREAS.map(area => ({ id: area.id, label: area.label }));

function MvSearch() {
  const { navigate } = useNavigation();
  const [keyword, setKeyword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = keyword.trim();
    if (value) navigate({ name: 'search', keyword: value, type: 'mv' });
  };
  return (
    <form className={styles.search} onSubmit={submit} role="search">
      <SearchField value={keyword} onChange={setKeyword} placeholder="搜索 MV，回车确认" label="搜索 MV" />
    </form>
  );
}

/** MV 发现: the selected platform's ranked, hot and latest videos, filtered by region. */
export function MvDiscoverView() {
  const platform = useSettings().catalogSource;
  const { browse } = MV_FEATURES[platform];
  const [picked, setPicked] = useState<MvBrowseKind>('top');
  const [area, setArea] = useState<MvArea>('');
  const kind = browse.includes(picked) ? picked : browse[0];
  const load = useCallback((offset: number, signal: AbortSignal) => mvApi.browse(kind!, area, offset, PAGE, signal), [kind, area]);
  const labels = browse.map(item => MV_BROWSE_LABELS[item]);

  return (
    <Page gap="sm">
      <CollapsingHeader
        title="MV"
        subtitle={kind ? `${SOURCE_NAMES[platform]}的 MV 榜单、热门与最新视频` : `${SOURCE_NAMES[platform]}的 MV 可以搜索，或在歌手页查看`}
        actions={<MvSearch />}
      />
      {kind ? (
        <>
          <StickyBar compactTitle="MV">
            <div className={styles.bar}>
              <Tabs items={labels} value={MV_BROWSE_LABELS[kind]} onChange={label => setPicked(browse.find(item => MV_BROWSE_LABELS[item] === label)!)} label="MV 列表" />
            </div>
          </StickyBar>
          <FilterRow label="地区" options={areaOptions} value={area} onChange={value => setArea(value as MvArea)} allowAll={false} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${kind}:${area}`} {...fadeSwap}>
              <MvList listKey={`mvs:${platform}:${kind}:${area}`} load={load} pageSize={PAGE} ranked={kind === 'top'} emptyText="这个地区暂时没有 MV" />
            </motion.div>
          </AnimatePresence>
        </>
      ) : (
        <div className={styles.notice}>
          <span className={styles.noticeIcon}><Film size={26} strokeWidth={1.3} /></span>
          <strong>{SOURCE_NAMES[platform]}暂不提供 MV 榜单</strong>
          <p>可以在上方搜索 MV，或打开歌手页的“MV”标签查看歌手的视频。</p>
        </div>
      )}
    </Page>
  );
}
