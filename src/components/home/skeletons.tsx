import { SkeletonBlock } from '@/components/common/AsyncState';
import styles from './Home.module.css';

export function PlaylistSkeleton({ count }: { count: number }) {
  return (
    <div className={styles.playlistGrid} aria-busy="true" aria-label="正在加载">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <SkeletonBlock className={styles.skeletonCover} />
          <SkeletonBlock className={styles.skeletonLine} />
          <SkeletonBlock className={styles.skeletonLineShort} />
        </div>
      ))}
    </div>
  );
}

export function TrackSkeleton({ count }: { count: number }) {
  return (
    <div className={styles.trackGrid} aria-busy="true" aria-label="正在加载">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.skeletonTrack}>
          <SkeletonBlock className={styles.skeletonThumb} />
          <div>
            <SkeletonBlock className={styles.skeletonLine} />
            <SkeletonBlock className={styles.skeletonLineShort} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ count }: { count: number }) {
  return (
    <div className={styles.chartGrid} aria-busy="true" aria-label="正在加载">
      {Array.from({ length: count }, (_, index) => <SkeletonBlock key={index} className={styles.skeletonChart} />)}
    </div>
  );
}
