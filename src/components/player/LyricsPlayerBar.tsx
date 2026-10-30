'use client';

import { Copy, Download, Link2, ListMusic, ListPlus, MoreHorizontal, Plus, Settings2, SquarePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { CreatePlaylistDialog } from '@/components/account/CreatePlaylistDialog';
import { LikeButton } from '@/components/account/LikeButton';
import { useAccount } from '@/components/account/account-store';
import { useDesktopLyrics } from '@/components/desktop-lyrics/use-desktop-lyrics';
import { downloads } from '@/components/downloads/download-store';
import { useNavigation } from '@/components/layout/navigation';
import { IconButton, Menu, Slider, toast, type MenuItem } from '@/components/ui';
import { settings, useSettings } from '@/lib/settings';
import { shareUrl } from '@/lib/share-links';
import type { AudioQuality, CatalogTrack } from '@/server/music/types';
import { CommentButton, PlayModeButton, PlayPauseButton, SkipButton, VolumeControl } from './controls';
import { MvButton } from './mv/MvButton';
import { formatTime, usePlaybackPosition, usePlayer } from './player-store';
import { useSongStats } from './use-song-stats';
import styles from './LyricsPlayerBar.module.css';

const QUALITY_LABELS: Record<AudioQuality, string> = { standard: '标准', higher: '较高', exhigh: '极高', lossless: '无损', hires: 'Hi-Res' };
const QUALITY_ORDER: AudioQuality[] = ['standard', 'higher', 'exhigh', 'lossless', 'hires'];

/** Thin full-width progress line along the bar's top edge; the time shows in the thumb tooltip. */
function Progress() {
  const { duration, seek } = usePlayer();
  const position = usePlaybackPosition();
  return (
    <div className={styles.progress} data-lyrics-progress>
      <Slider value={Math.min(position, duration)} max={duration} onCommit={seek} label="播放进度" formatValue={formatTime} size="sm" />
    </div>
  );
}

/** The playing song as a catalog track (for downloads and playlist edits). */
function useCatalogTrack(): CatalogTrack | null {
  const { track } = usePlayer();
  if (!track.songId) return null;
  return { id: track.songId, source: track.source ?? 'netease', title: track.title, artist: track.artist, album: track.album, albumId: track.albumId, cover: track.cover, duration: track.duration };
}

/** 极高 / 无损 badge: shows the stream actually playing; click to change the preferred quality. */
function QualityButton() {
  const player = usePlayer();
  const preferred = useSettings().quality;
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const playing = (player.level && player.level in QUALITY_LABELS ? player.level : preferred) as AudioQuality;
  const items: MenuItem[] = [
    { type: 'section', label: '在线播放音质' },
    ...QUALITY_ORDER.map((quality): MenuItem => ({
      label: QUALITY_LABELS[quality],
      selected: quality === preferred,
      onSelect: () => {
        settings.set('quality', quality);
        player.reloadStream();
        toast.info(`已切换为${QUALITY_LABELS[quality]}音质，无权限时会自动降级`);
      },
    })),
  ];
  return (
    <>
      <span ref={anchor} style={{ display: 'inline-flex' }}>
        <IconButton label={`音质：${QUALITY_LABELS[playing]}`} tone="muted" onClick={() => setOpen(value => !value)} active={open} disabled={!player.track.songId}>
          <span className={styles.qualityBadge}>{player.trial ? '试听' : QUALITY_LABELS[playing]}</span>
        </IconButton>
      </span>
      <Menu open={open} anchor={anchor} items={items} onClose={() => setOpen(false)} align="end" />
    </>
  );
}

/** Add the playing song to one of the user's own playlists. */
function AddToPlaylistButton() {
  const { profile, playlists, addToPlaylist, openLogin } = useAccount();
  const platform = useSettings().catalogSource;
  const song = useCatalogTrack();
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const foreign = Boolean(song && song.source !== platform);
  const items: MenuItem[] = [
    { type: 'section', label: '添加到歌单' },
    { label: '新建歌单…', icon: <Plus size={15} strokeWidth={1.5} />, onSelect: () => setCreating(true) },
    ...playlists.filter(item => item.own).map((item): MenuItem => ({
      label: item.liked ? '我喜欢的音乐' : item.name,
      icon: <ListPlus size={15} strokeWidth={1.5} />,
      hint: item.trackCount !== undefined ? `${item.trackCount}` : undefined,
      onSelect: () => { if (song) void addToPlaylist(item.id, [song.id]); },
    })),
  ];
  return (
    <>
      <span ref={anchor} style={{ display: 'inline-flex' }}>
        <IconButton
          label={foreign ? '其他平台的歌曲，切换到该平台后可收藏' : '收藏到歌单'}
          tone="muted"
          disabled={!song || foreign}
          active={open}
          onClick={() => (profile ? setOpen(value => !value) : openLogin())}
        >
          <SquarePlus size={19} strokeWidth={1.4} />
        </IconButton>
      </span>
      <Menu open={open} anchor={anchor} items={items} onClose={() => setOpen(false)} align="end" />
      <CreatePlaylistDialog open={creating} onClose={() => setCreating(false)} onCreated={playlist => { if (song) void addToPlaylist(playlist.id, [song.id]); }} />
    </>
  );
}

function MoreButton() {
  const player = usePlayer();
  const { navigate } = useNavigation();
  const song = useCatalogTrack();
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(done); } catch { toast.error('复制失败'); }
  };
  const items: MenuItem[] = [
    { label: '下载', icon: <Download size={15} strokeWidth={1.5} />, disabled: !song, onSelect: () => { if (song) void downloads.add([song]); } },
    { label: '复制分享链接', icon: <Link2 size={15} strokeWidth={1.5} />, disabled: !song, onSelect: () => { if (song) void copy(shareUrl(song.source, 'song', song.id), '链接已复制'); } },
    { label: '复制歌曲信息', icon: <Copy size={15} strokeWidth={1.5} />, onSelect: () => void copy(`${player.track.title} - ${player.track.artist}`, '已复制') },
    { type: 'divider' },
    { label: '歌词页设置', icon: <Settings2 size={15} strokeWidth={1.5} />, onSelect: () => { player.closeLyrics(); navigate({ name: 'settings' }); } },
  ];
  return (
    <>
      <span ref={anchor} style={{ display: 'inline-flex' }}>
        <IconButton label="更多" tone="muted" onClick={() => setOpen(value => !value)} active={open}>
          <MoreHorizontal size={19} strokeWidth={1.4} />
        </IconButton>
      </span>
      <Menu open={open} anchor={anchor} items={items} onClose={() => setOpen(false)} align="end" />
    </>
  );
}

/**
 * Player bar for the lyrics page, laid out like a desktop client's bar:
 * song + like/comments on the left, transport + queue centred on the window,
 * quality / collect / desktop lyrics / volume / more on the right, and a thin
 * progress line along the top edge (no time labels).
 */
export function LyricsPlayerBar({ onComments }: { onComments: () => void }) {
  const player = usePlayer();
  const { track, queueOpen, setQueueOpen } = player;
  const stats = useSongStats(track.songId, track.source);
  const desktopLyrics = useDesktopLyrics();
  return (
    <footer className={styles.bar} aria-label="播放控制">
      <Progress />
      <div className={styles.row}>
        <div className={styles.song}>
          <span className={styles.meta}>
            <strong data-tooltip={track.title} data-tooltip-overflow>{track.title}</strong>
            <small data-tooltip={track.artist} data-tooltip-overflow>{track.artist}</small>
          </span>
          {track.songId && <LikeButton songId={track.songId} source={track.source} size="md" iconSize={19} count={stats.likeCount} />}
          <CommentButton count={stats.commentCount} onClick={onComments} disabled={!track.songId} />
        </div>

        <div className={styles.transport}>
          <PlayModeButton />
          {/* Same skip buttons as the main player bar. */}
          <SkipButton direction="previous" />
          <PlayPauseButton large />
          <SkipButton direction="next" />
          <span data-queue-toggle style={{ display: 'inline-flex' }}>
            <IconButton label="播放列表" tone="muted" onClick={() => setQueueOpen(!queueOpen)} active={queueOpen} pressed={queueOpen}>
              <ListMusic size={20} strokeWidth={1.4} />
            </IconButton>
          </span>
        </div>

        <div className={styles.tools}>
          <MvButton />
          <QualityButton />
          <AddToPlaylistButton />
          <IconButton label={desktopLyrics.visible ? '关闭桌面歌词' : '打开桌面歌词'} tone="muted" onClick={desktopLyrics.toggle} disabled={!desktopLyrics.available} active={desktopLyrics.visible} pressed={desktopLyrics.visible}>
            <span className={styles.ci}>词</span>
          </IconButton>
          <VolumeControl />
          <MoreButton />
        </div>
      </div>
    </footer>
  );
}
