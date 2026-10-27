'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { BadgedIcon } from '@/components/common/BadgedIcon';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SOURCE_NAMES } from '@/server/music/ids';
import { useSettings } from '@/lib/settings';
import type { CatalogSource } from '@/server/music/types';
import { useAccount } from './account-store';
import styles from './LikeButton.module.css';

/**
 * Red heart bound to the account's liked songs (`songId` is the platform id).
 * With `count`, the total is embedded in the outline heart's top-right corner
 * (hidden once liked). The button keeps its width either way.
 * Songs from a platform other than the selected one cannot be liked (the
 * signed-in account belongs to the selected platform).
 */
export function LikeButton({ songId, source, size = 'sm', iconSize = 16, count, className }: { songId: string; source?: CatalogSource; size?: 'sm' | 'md'; iconSize?: number; count?: number; className?: string }) {
  const { isLiked, toggleLike } = useAccount();
  const platform = useSettings().catalogSource;
  const foreign = Boolean(source && source !== platform);
  const liked = !foreign && isLiked(songId);
  const label = foreign ? `${SOURCE_NAMES[source!]}的歌曲，切换到该平台后可收藏` : liked ? '取消喜欢' : '喜欢';
  // The total sits on the outline heart only; once liked, the red heart stands alone.
  const shown = liked ? undefined : count;
  return (
    <IconButton
      label={label}
      tooltip={label}
      pressed={liked}
      size={size}
      disabled={foreign}
      tone="muted"
      className={cn(styles.button, liked && styles.liked, count !== undefined && styles.badged, className)}
      onClick={() => void toggleLike(songId)}
    >
      {/* Same treatment as 评论: digits tuck into the glyph's corner, strokes cut away beneath them. */}
      <BadgedIcon count={shown}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={String(liked)}
            className={styles.icon}
            initial={{ scale: liked ? 0.3 : 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 14 }}
          >
            <Heart size={iconSize} strokeWidth={1.4} fill={liked ? 'currentColor' : 'none'} />
          </motion.span>
        </AnimatePresence>
      </BadgedIcon>
    </IconButton>
  );
}
