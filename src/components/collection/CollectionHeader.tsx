'use client';

import { motion, useTransform } from 'framer-motion';
import { Download, Headphones, Heart, Play, Share2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { BadgedIcon } from '@/components/common/BadgedIcon';
import { Cover } from '@/components/common/Cover';
import { ExpandableText } from '@/components/common/ExpandableText';
import { useScrollArea } from '@/components/scroll';
import { useAccount } from '@/components/account/account-store';
import { Button, toast } from '@/components/ui';
import { formatCount, type CollectionInfo } from '@/lib/catalog-client';
import styles from './CollectionHeader.module.css';

/** Copies the platform's public page URL. */
async function copyLink(info: CollectionInfo) {
  const url = `https://music.163.com/#/${info.kind}?id=${info.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success('链接已复制');
  } catch {
    toast.error('复制失败');
  }
}

const date = (ms?: number) => (ms ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms) : '');

/**
 * Detail hero (playlist / album). The cover is pinned to the top of the row so a
 * long description grows downward without moving it; the description expands
 * with an animated height. On scroll the block fades, handing off to the sticky bar.
 */
export function CollectionHeader({ info, fallbackTitle, onPlayAll, extraActions }: {
  info?: CollectionInfo;
  fallbackTitle?: string;
  onPlayAll: () => void;
  /** Extra buttons after the defaults (e.g. 批量操作). */
  extraActions?: ReactNode;
}) {
  const { scrollY } = useScrollArea();
  const coverScale = useTransform(scrollY, [0, 220], [1, 0.86], { clamp: true });
  const fade = useTransform(scrollY, [40, 240], [1, 0], { clamp: true });
  const lift = useTransform(scrollY, [0, 240], [0, -20], { clamp: true });
  const { isSubscribed, isOwnPlaylist, toggleSubscribe } = useAccount();
  const label = info?.kind === 'album' ? '专辑' : '歌单';
  const seed = info ? `${info.source}:${info.kind}:${info.id}` : 'collection';
  const own = info ? isOwnPlaylist(info.id) : false;
  const subscribed = info ? isSubscribed(info.id) : false;
  // Upstream count is a snapshot from page load; follow the user's own toggle on top of it.
  // Upstream count is a snapshot from page load; add the user's own successful toggles on top.
  const [delta, setDelta] = useState<{ id?: string; value: number }>({ value: 0 });
  const localDelta = delta.id === info?.id ? delta.value : 0;
  const subscribeCount = info?.subscribedCount === undefined ? undefined : Math.max(0, info.subscribedCount + localDelta);
  const onSubscribe = async () => {
    if (!info) return;
    const was = subscribed;
    if (await toggleSubscribe(info)) setDelta({ id: info.id, value: localDelta + (was ? -1 : 1) });
  };

  return (
    <header className={styles.header}>
      <div className={styles.tint} aria-hidden>
        {info?.cover && <Cover seed={seed} src={info.cover} className={styles.tintCover} />}
      </div>
      <motion.div className={styles.content} style={{ opacity: fade, y: lift }}>
        <motion.div className={styles.coverWrap} style={{ scale: coverScale }}>
          {info ? <Cover seed={seed} src={info.cover} className={styles.cover} radius={16} /> : <SkeletonBlock className={styles.cover} />}
        </motion.div>
        <div className={styles.meta}>
          <span className={styles.eyebrow}>{label}{info?.tags?.length ? ` · ${info.tags.join(' / ')}` : ''}</span>
          <h1>{info?.name ?? fallbackTitle ?? <SkeletonBlock className={styles.titleSkeleton} />}</h1>
          {info?.owner && (
            <div className={styles.owner}>
              {info.owner.avatar && <img src={info.owner.avatar} alt="" className={styles.avatar} referrerPolicy="no-referrer" />}
              <span>{info.owner.name}</span>
              {info.createdAt && <span className={styles.dim}>{date(info.createdAt)} {info.kind === 'album' ? '发行' : '创建'}</span>}
              {info.company && <span className={styles.dim}>{info.company}</span>}
            </div>
          )}
          {info && (
            <div className={styles.stats}>
              <span>{info.trackCount} 首</span>
              {info.playCount ? <span><Headphones size={12} strokeWidth={1.6} />{formatCount(info.playCount)}</span> : null}
              {info.subscribedCount ? <span><Heart size={12} strokeWidth={1.6} />{formatCount(info.subscribedCount)}</span> : null}
            </div>
          )}
          {info?.description && <ExpandableText text={info.description} lines={2} lineHeight={22} className={styles.description} />}
          <div className={styles.actions}>
            <Button variant="primary" icon={<Play size={16} strokeWidth={0} fill="currentColor" />} onClick={onPlayAll} disabled={!info}>播放全部</Button>
            {info?.kind === 'playlist' && !own && (
                <Button
                  icon={<BadgedIcon count={subscribeCount} reserve><Heart size={16} strokeWidth={1.5} fill={subscribed ? 'currentColor' : 'none'} /></BadgedIcon>}
                  onClick={() => void onSubscribe()}
                  variant={subscribed ? 'primary' : 'soft'}
                  title={subscribeCount ? `${subscribeCount.toLocaleString('zh-CN')} 人收藏` : undefined}
                  className={subscribeCount ? styles.badgedButton : undefined}
                >
                  {subscribed ? '已收藏' : '收藏'}
                </Button>
            )}
            <Button icon={<Download size={16} strokeWidth={1.5} />} disabled title="下载功能即将接入">下载</Button>
            <Button icon={<Share2 size={16} strokeWidth={1.5} />} disabled={!info} onClick={() => info && void copyLink(info)}>分享</Button>
            {extraActions}
          </div>
        </div>
      </motion.div>
    </header>
  );
}
