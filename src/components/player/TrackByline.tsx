import { PlatformIcon } from '@/components/layout/PlatformPill';
import { SOURCE_NAMES } from '@/server/music/ids';
import type { CatalogSource } from '@/server/music/types';
import styles from './TrackByline.module.css';

export function TrackByline({ artist, album, platform }: { artist: string; album?: string; platform?: CatalogSource }) {
  const source = platform && `播放音源 · ${SOURCE_NAMES[platform]}`;
  return (
    <span className={styles.byline}>
      <span className={styles.text} data-tooltip={artist} data-tooltip-overflow>{artist}</span>
      {album && <span className={styles.text} data-tooltip={album} data-tooltip-overflow> · {album}</span>}
      <span className={styles.sourceSlot}>
        {platform && (
          <span className={styles.source} data-playback-source data-tooltip={source} role="img" aria-label={source}>
            <PlatformIcon source={platform} size={14} />
          </span>
        )}
      </span>
    </span>
  );
}
