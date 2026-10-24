'use client';

import { History, Play, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchField } from '@/components/common/SearchField';
import { usePlayer } from '@/components/player/player-store';
import { CollapsingHeader, Page, StickyBar } from '@/components/scroll';
import { Button, ConfirmDialog, IconButton } from '@/components/ui';
import { recentPlays, useRecentPlays } from '@/lib/recent-plays';
import { TrackList } from './TrackList';
import styles from './Library.module.css';

const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

/** 刚刚 / n分钟前 / 今天 14:03 / 昨天 09:12 / 10月3日 */
function when(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const day = new Date(ms).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  if (day === today) return `今天 ${timeFormat.format(ms)}`;
  if (today - day === 86_400_000) return `昨天 ${timeFormat.format(ms)}`;
  return dateFormat.format(ms);
}

/** Songs that actually started playing on this device, newest first. */
export function RecentView() {
  const player = usePlayer();
  const plays = useRecentPlays();
  const [filter, setFilter] = useState('');
  const [clearing, setClearing] = useState(false);
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(() => (needle ? plays.filter(item => `${item.track.title} ${item.track.artist} ${item.track.album ?? ''}`.toLowerCase().includes(needle)) : plays), [plays, needle]);

  return (
    <Page gap="sm">
      <CollapsingHeader
        title="最近播放"
        subtitle={plays.length ? `最近播放过的 ${plays.length} 首歌曲，仅保存在本机` : '播放过的歌曲会出现在这里'}
        actions={(
          <>
            <Button variant="primary" icon={<Play size={15} strokeWidth={0} fill="currentColor" />} disabled={!visible.length} onClick={() => player.play(visible[0].track, visible.map(item => item.track))}>播放全部</Button>
            <Button icon={<Trash2 size={15} strokeWidth={1.5} />} disabled={!plays.length} onClick={() => setClearing(true)}>清空记录</Button>
          </>
        )}
      />
      {plays.length > 0 && (
        <StickyBar compactTitle="最近播放">
          <div className={styles.toolbar}>
            <span className={styles.count}>歌曲 <small>{plays.length}</small>{needle && <small className={styles.matches}>匹配 {visible.length} 首</small>}</span>
            <SearchField value={filter} onChange={setFilter} placeholder="在最近播放中搜索" label="筛选最近播放" className={styles.filter} />
          </div>
        </StickyBar>
      )}
      <TrackList
        metaLabel="播放时间"
        emptyText={plays.length
          ? '没有匹配的歌曲'
          : <><History size={32} strokeWidth={1.2} /><span>还没有播放记录，去发现音乐听听吧</span></>}
        rows={visible.map(item => ({
          track: item.track,
          meta: <span data-tooltip={item.count > 1 ? `播放过 ${item.count} 次` : undefined}>{when(item.playedAt)}{item.count > 1 ? ` · ${item.count} 次` : ''}</span>,
          actions: <IconButton label="删除记录" size="sm" tone="muted" onClick={() => recentPlays.remove(item.track.id)}><X size={15} strokeWidth={1.5} /></IconButton>,
        }))}
      />
      <ConfirmDialog
        open={clearing}
        onClose={() => setClearing(false)}
        title="清空最近播放"
        tone="danger"
        confirmLabel="清空"
        message="将删除本机上的全部播放记录，歌曲本身不受影响。"
        onConfirm={() => recentPlays.clear()}
      />
    </Page>
  );
}
