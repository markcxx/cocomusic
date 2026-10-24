'use client';

import { motion } from 'framer-motion';
import { Heart, QrCode } from 'lucide-react';
import { CollectionView } from '@/components/collection/CollectionView';
import { Page } from '@/components/scroll';
import { Button, Spinner } from '@/components/ui';
import { useAccount } from './account-store';
import styles from './LikedView.module.css';

/** 我喜欢: the account's 我喜欢的音乐 playlist, or a login prompt. */
export function LikedView() {
  const { profile, likedPlaylist, openLogin } = useAccount();

  if (profile === undefined || (profile && !likedPlaylist)) {
    return <Page><div className={styles.gate}><Spinner size={22} /></div></Page>;
  }
  if (!profile || !likedPlaylist) {
    return (
      <Page>
        <div className={styles.gate}>
          <motion.span className={styles.heart} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
            <Heart size={32} strokeWidth={1.4} />
          </motion.span>
          <h1>我喜欢的音乐</h1>
          <p>登录后，这里会同步你在当前曲库红心过的歌曲</p>
          <Button variant="primary" icon={<QrCode size={15} strokeWidth={1.5} />} onClick={openLogin}>扫码登录</Button>
        </div>
      </Page>
    );
  }
  return <CollectionView kind="playlist" id={likedPlaylist.id} title="我喜欢的音乐" />;
}
