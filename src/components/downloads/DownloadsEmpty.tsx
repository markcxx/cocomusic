'use client';

import { motion } from 'framer-motion';
import { Compass, FileText, FolderCog, Gauge, Settings2, TrendingUp } from 'lucide-react';
import { useNavigation } from '@/components/layout/navigation';
import { Button } from '@/components/ui';
import type { DownloadSettings } from '@/lib/local-client';
import styles from './DownloadsEmpty.module.css';

const QUALITY_LABEL: Record<string, string> = { standard: '标准', higher: '较高', exhigh: '极高 320k', lossless: '无损', hires: 'Hi-Res' };
const NAMING_LABEL: Record<string, string> = { 'artist-title': '歌手 - 歌名', 'title-artist': '歌名 - 歌手', title: '歌名' };

/** Floating record + cloud + arrow, drawn inline so it follows the theme colour. */
function Illustration() {
  return (
    <svg className={styles.art} viewBox="0 0 220 160" aria-hidden>
      <defs>
        <linearGradient id="dl-disc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-tint-strong)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
        <linearGradient id="dl-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="146" rx="62" ry="7" fill="rgba(var(--accent-strong-rgb), 0.1)" />
      <g className={styles.disc}>
        <circle cx="110" cy="92" r="44" fill="url(#dl-disc)" />
        <circle cx="110" cy="92" r="34" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
        <circle cx="110" cy="92" r="26" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
        <circle cx="110" cy="92" r="13" fill="#fff" fillOpacity="0.9" />
        <circle cx="110" cy="92" r="3" fill="var(--accent-strong)" />
      </g>
      <g className={styles.cloud}>
        <path d="M58 52a16 16 0 0 1 30-8 13 13 0 0 1 20 10 11 11 0 0 1-2 22H60a14 14 0 0 1-2-24z" fill="url(#dl-cloud)" stroke="rgba(var(--accent-strong-rgb),0.16)" />
        <path d="M84 50v16m0 0-6-6m6 6 6-6" stroke="var(--accent-strong)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <g className={styles.note}>
        <path d="M164 40v26a7 7 0 1 1-4-6.3V44l18-4v20a7 7 0 1 1-4-6.3V36z" fill="var(--accent-strong)" fillOpacity="0.75" />
      </g>
      <circle className={styles.sparkle} cx="44" cy="104" r="3" fill="var(--accent)" />
      <circle className={styles.sparkle} cx="180" cy="110" r="2.5" fill="var(--accent)" style={{ animationDelay: '-1.2s' }} />
    </svg>
  );
}

/**
 * Empty state for 下载管理. With no records at all it explains how downloads
 * work and shows the current settings; an empty tab gets a short hint.
 */
export function DownloadsEmpty({ firstTime, tab, settings, folder, onChangeFolder }: {
  firstTime: boolean;
  tab: '下载中' | '已下载';
  settings: DownloadSettings | null;
  folder: string;
  onChangeFolder?: () => void;
}) {
  const { navigate } = useNavigation();

  if (!firstTime) {
    return (
      <div className={styles.compact}>
        <Illustration />
        <p>{tab === '下载中' ? '下载任务都完成了' : '已下载的歌曲会出现在这里'}</p>
        <span>{tab === '下载中' ? '新的下载会显示进度，切换页面也会继续' : '下载完成的歌曲同时会加入本地音乐'}</span>
      </div>
    );
  }

  const facts = [
    { icon: Gauge, label: '下载音质', value: settings ? QUALITY_LABEL[settings.quality] ?? settings.quality : '—' },
    { icon: FileText, label: '文件命名', value: settings ? NAMING_LABEL[settings.naming] : '—' },
    { icon: FolderCog, label: '保存位置', value: folder || '—', path: true },
  ];

  return (
    <motion.div className={styles.hero} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <Illustration />
      <h2>把喜欢的音乐带回家</h2>
      <p className={styles.lead}>
        在歌曲列表点击 <span className={styles.chip}>下载</span>，或在歌单、专辑页一键下载全部。
        {settings?.lyrics ? '歌词会一起保存为 .lrc 文件，' : ''}下载完成后可以离线播放，也会出现在本地音乐中。
      </p>

      <div className={styles.facts}>
        {facts.map(({ icon: Icon, label, value, path }) => (
          <div key={label} className={styles.fact}>
            <Icon size={15} strokeWidth={1.6} />
            <span className={styles.factLabel}>{label}</span>
            <span className={path ? styles.factPath : styles.factValue} data-tooltip={path ? value : undefined}>{value}</span>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <Button variant="primary" icon={<Compass size={15} strokeWidth={1.6} />} onClick={() => navigate({ name: 'discover' })}>去发现音乐</Button>
        <Button icon={<TrendingUp size={15} strokeWidth={1.6} />} onClick={() => navigate({ name: 'charts' })}>看看排行榜</Button>
        <Button variant="ghost" icon={<Settings2 size={15} strokeWidth={1.6} />} onClick={() => navigate({ name: 'settings' })}>下载设置</Button>
        {onChangeFolder && <Button variant="ghost" icon={<FolderCog size={15} strokeWidth={1.6} />} onClick={onChangeFolder}>更改目录</Button>}
      </div>
    </motion.div>
  );
}
