'use client';

import { motion, useTransform } from 'framer-motion';
import { Download, HardDriveDownload, Headphones, Heart, Play, Share2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { BadgedIcon } from '@/components/common/BadgedIcon';
import { Cover } from '@/components/common/Cover';
import { ExpandableText } from '@/components/common/ExpandableText';
import { useScrollArea } from '@/components/scroll';
import { useAccount } from '@/components/account/account-store';
import { Button, toast } from '@/components/ui';
import { formatCount, type CollectionInfo } from '@/lib/catalog-client';
import { useSettings } from '@/lib/settings';
import { shareUrl } from '@/lib/share-links';
import { SOURCE_NAMES } from '@/server/music/ids';
import styles from './CollectionHeader.module.css';

/** Copies the platform's public page URL. */
async function copyLink(info: CollectionInfo) {
  const url = shareUrl(info.source, info.kind, info.id);
  try {
    await navigator.clipboard.writeText(url);
    toast.success('链接已复制');
  } catch {
    toast.error('复制失败');
  }
}

export const formatDate = (ms?: number) => (ms ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms) : '');

/**
 * Detail hero shared by platform playlists, albums and 本地歌单. The cover is
 * pinned to the top of the row so a long description grows downward without
 * moving it; the description expands with an animated height. On scroll the
 * block fades, handing off to the sticky bar. `ready` false shows skeletons.
 */
export function CollectionHero({ ready, seed, cover, eyebrow, title, owner, stats, description, actions }: {
  ready: boolean;
  /** Placeholder artwork seed (stable per collection). */
  seed: string;
  cover?: string;
  eyebrow: string;
  title?: string;
  /** Creator / date line. */
  owner?: ReactNode;
  stats?: ReactNode;
  description?: string;
  actions: ReactNode;
}) {
  const { scrollY } = useScrollArea();
  const coverScale = useTransform(scrollY, [0, 220], [1, 0.86], { clamp: true });
  const fade = useTransform(scrollY, [40, 240], [1, 0], { clamp: true });
  const lift = useTransform(scrollY, [0, 240], [0, -20], { clamp: true });
  return (
    <header className={styles.header}>
      <div className={styles.tint} aria-hidden>
        {cover && <Cover seed={seed} src={cover} className={styles.tintCover} />}
      </div>
      <motion.div className={styles.content} style={{ opacity: fade, y: lift }}>
        <motion.div className={styles.coverWrap} style={{ scale: coverScale }}>
          {ready ? <Cover seed={seed} src={cover} className={styles.cover} radius={16} /> : <SkeletonBlock className={styles.cover} />}
        </motion.div>
        <div className={styles.meta}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title ?? <SkeletonBlock className={styles.titleSkeleton} />}</h1>
          {owner && <div className={styles.owner}>{owner}</div>}
          {ready && stats && <div className={styles.stats}>{stats}</div>}
          {description && <ExpandableText text={description} lines={2} lineHeight={22} className={styles.description} />}
          <div className={styles.actions}>{actions}</div>
        </div>
      </motion.div>
    </header>
  );
}

/** Secondary text in the owner line (dates, labels). */
export function HeroDim({ children }: { children: ReactNode }) {
  return <span className={styles.dim}>{children}</span>;
}

/**
 * Platform playlist / album hero. 收藏 is offered for playlists of the selected
 * platform (its account is the one signed in); any collection can be copied
 * into a 本地歌单.
 */
export function CollectionHeader({ info, fallbackTitle, onPlayAll, onDownloadAll, onSaveLocally }: {
  info?: CollectionInfo;
  fallbackTitle?: string;
  onPlayAll: () => void;
  onDownloadAll?: () => void;
  /** 存为本地歌单; resolves when the copy is saved. */
  onSaveLocally: () => Promise<void>;
}) {
  const { isSubscribed, isOwnPlaylist, toggleSubscribe } = useAccount();
  const platform = useSettings().catalogSource;
  const [saving, setSaving] = useState(false);
  const native = info?.source === platform;
  const own = info && native ? isOwnPlaylist(info.id) : false;
  const subscribed = info && native ? isSubscribed(info.id) : false;
  // Upstream count is a snapshot from page load; add the user's own successful toggles on top.
  const [delta, setDelta] = useState<{ id?: string; value: number }>({ value: 0 });
  const localDelta = delta.id === info?.id ? delta.value : 0;
  const subscribeCount = info?.subscribedCount === undefined ? undefined : Math.max(0, info.subscribedCount + localDelta);
  const onSubscribe = async () => {
    if (!info) return;
    const was = subscribed;
    if (await toggleSubscribe(info)) setDelta({ id: info.id, value: localDelta + (was ? -1 : 1) });
  };
  const saveLocally = async () => {
    setSaving(true);
    try { await onSaveLocally(); } finally { setSaving(false); }
  };

  const label = info?.kind === 'album' ? '专辑' : '歌单';
  const eyebrow = [label, info && !native ? SOURCE_NAMES[info.source] : '', info?.tags?.length ? info.tags.join(' / ') : ''].filter(Boolean).join(' · ');

  return (
    <CollectionHero
      ready={Boolean(info)}
      seed={info ? `${info.source}:${info.kind}:${info.id}` : 'collection'}
      cover={info?.cover}
      eyebrow={eyebrow}
      title={info?.name ?? fallbackTitle}
      owner={info?.owner && (
        <>
          {info.owner.avatar && <img src={info.owner.avatar} alt="" className={styles.avatar} referrerPolicy="no-referrer" />}
          <span>{info.owner.name}</span>
          {info.createdAt && <HeroDim>{formatDate(info.createdAt)} {info.kind === 'album' ? '发行' : '创建'}</HeroDim>}
          {info.company && <HeroDim>{info.company}</HeroDim>}
        </>
      )}
      stats={info && (
        <>
          <span>{info.trackCount} 首</span>
          {info.playCount ? <span><Headphones size={12} strokeWidth={1.6} />{formatCount(info.playCount)}</span> : null}
          {info.subscribedCount ? <span><Heart size={12} strokeWidth={1.6} />{formatCount(info.subscribedCount)}</span> : null}
        </>
      )}
      description={info?.description}
      actions={(
        <>
          <Button variant="primary" icon={<Play size={16} strokeWidth={0} fill="currentColor" />} onClick={onPlayAll} disabled={!info}>播放全部</Button>
          {info?.kind === 'playlist' && native && !own && (
            <Button
              icon={(
                // Subscribed: solid red heart, count beside it (a filled shape is never cut away).
                <BadgedIcon count={subscribeCount} reserve solid={subscribed}>
                  <Heart size={16} strokeWidth={1.5} fill={subscribed ? 'currentColor' : 'none'} className={subscribed ? styles.subscribedHeart : undefined} />
                </BadgedIcon>
              )}
              onClick={() => void onSubscribe()}
              variant={subscribed ? 'primary' : 'soft'}
              className={subscribeCount ? styles.badgedButton : undefined}
            >
              {subscribed ? '已收藏' : '收藏'}
            </Button>
          )}
          <Button icon={<HardDriveDownload size={16} strokeWidth={1.5} />} disabled={!info || saving} onClick={() => void saveLocally()} title="复制到本地歌单，无需登录，可以继续添加其他平台的歌曲">
            {saving ? '保存中…' : '存为本地歌单'}
          </Button>
          <Button icon={<Download size={16} strokeWidth={1.5} />} disabled={!info || !onDownloadAll} onClick={onDownloadAll} title="下载全部歌曲">下载</Button>
          <Button icon={<Share2 size={16} strokeWidth={1.5} />} disabled={!info} onClick={() => info && void copyLink(info)}>分享</Button>
        </>
      )}
    />
  );
}
