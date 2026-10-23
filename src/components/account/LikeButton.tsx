'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { BadgedIcon } from '@/components/common/BadgedIcon';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAccount } from './account-store';
import styles from './LikeButton.module.css';

/**
 * Red heart bound to the account's liked songs (`songId` is the platform id).
 * With `count`, the total is embedded in the heart's top-right corner.
 */
export function LikeButton({ songId, size = 'sm', iconSize = 16, count, className }: { songId: string; size?: 'sm' | 'md'; iconSize?: number; count?: number; className?: string }) {
  const { isLiked, toggleLike } = useAccount();
  const liked = isLiked(songId);
  const label = liked ? '取消喜欢' : '喜欢';
  return (
    <IconButton
      label={label}
      tooltip={count ? `${label} · ${count.toLocaleString('zh-CN')} 人喜欢` : label}
      pressed={liked}
      size={size}
      tone="muted"
      className={cn(liked && styles.liked, count !== undefined && styles.badged, className)}
      onClick={() => void toggleLike(songId)}
    >
      <BadgedIcon count={count}>
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
