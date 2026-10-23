'use client';

import { motion } from 'framer-motion';
import { ChevronRight, Minus, Play, Triangle } from 'lucide-react';
import { Cover } from '@/components/common/Cover';
import { riseItem } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { usePlayer } from '@/components/player/player-store';
import { cn } from '@/lib/cn';
import type { CatalogChart } from '@/lib/catalog-client';
import { toTrack } from '@/lib/to-track';
import type { Trend } from '@/types/music';
import { Equalizer } from './Equalizer';
import styles from './ChartCard.module.css';

function TrendMark({ trend }: { trend?: Trend }) {
  if (trend === 'new') return <span className={styles.trendNew} data-tooltip="新上榜">新</span>;
  if (trend === 'up') return <Triangle className={styles.trendUp} size={9} fill="currentColor" strokeWidth={0} aria-label="上升" />;
  if (trend === 'down') return <Triangle className={styles.trendDown} size={9} fill="currentColor" strokeWidth={0} aria-label="下降" />;
  if (trend === 'same') return <Minus className={styles.trendSame} size={12} strokeWidth={1.5} aria-label="持平" />;
  return <span aria-hidden />;
}

/**
 * Ranking card. The artwork is a staggered stack of the top-three track covers
 * (#1 in front); hovering fans the stack out.
 */
export function ChartCard({ chart }: { chart: CatalogChart }) {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const queue = chart.entries.map(entry => toTrack(entry.track));
  const [first, second, third] = queue;
  if (!first) return null;

  return (
    <motion.article className={styles.card} variants={riseItem}>
      <header className={styles.header}>
        <button type="button" className={styles.title} onClick={() => navigate({ name: 'playlist', id: chart.id, title: chart.name })}>
          <h3>{chart.name}</h3>
          <ChevronRight size={15} strokeWidth={1.6} className={styles.titleChevron} />
        </button>
        {chart.updateLabel && <span>{chart.updateLabel}</span>}
      </header>
      <div className={styles.body}>
        <button type="button" className={styles.stack} onClick={() => player.play(first, queue)} aria-label={`播放${chart.name}`}>
          {third && <Cover seed={third.coverSeed} src={third.cover} className={cn(styles.layer, styles.third)} />}
          {second && <Cover seed={second.coverSeed} src={second.cover} className={cn(styles.layer, styles.second)} />}
          <span className={cn(styles.layer, styles.first)}>
            <Cover seed={first.coverSeed} src={first.cover} className={styles.firstCover} />
            <span className={styles.firstScrim} aria-hidden />
            <span className={styles.stackPlay} aria-hidden>
              <Play size={22} strokeWidth={0} fill="currentColor" />
            </span>
          </span>
        </button>
        <ol className={styles.list}>
          {chart.entries.map((entry, index) => {
            const track = queue[index];
            const current = player.track.id === track.id;
            return (
              <li key={track.id}>
                <button type="button" className={cn(styles.row, current && styles.rowCurrent)} onClick={() => player.play(track, queue)}>
                  <span className={styles.rank}>{current && player.playing ? <Equalizer /> : entry.rank}</span>
                  <span className={styles.song}>
                    <strong>{track.title}</strong>
                    <span> — {track.artist}</span>
                  </span>
                  <TrendMark trend={entry.trend} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </motion.article>
  );
}
