'use client';

import { motion } from 'framer-motion';
import { ErrorState, SkeletonBlock } from '@/components/common/AsyncState';
import { staggerList } from '@/components/common/motion';
import { ChartCard } from '@/components/music/ChartCard';
import { CollapsingHeader, Page } from '@/components/scroll';
import { catalogApi, useCatalog } from '@/lib/catalog-client';
import styles from './Charts.module.css';

export function ChartsView() {
  const { data, loading, error, retry } = useCatalog(signal => catalogApi.charts(8, signal), 'charts-8');
  return (
    <Page>
      <CollapsingHeader title="排行榜" subtitle="听见此刻的热门 · 点击榜单名称查看完整榜单" />
      {error ? <ErrorState message={error} onRetry={retry} /> : loading || !data ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 8 }, (_, index) => <SkeletonBlock key={index} className={styles.skeleton} />)}
        </div>
      ) : (
        <motion.div className={styles.grid} variants={staggerList} initial="hidden" animate="show">
          {data.charts.map(chart => <ChartCard key={chart.id} chart={chart} />)}
        </motion.div>
      )}
    </Page>
  );
}
