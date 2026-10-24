'use client';

import { ArrowRightToLine, Heart, LogIn, Mic2, Pause, PictureInPicture2, Play, Power, Repeat, Repeat1, Settings, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useSchemeAndAccent } from '@/components/settings/ApplyAppearance';
import { Slider } from '@/components/ui';
import { cn } from '@/lib/cn';
import styles from './TrayPanel.module.css';

const MODE_ICONS = { loop: Repeat, shuffle: Shuffle, one: Repeat1, order: ArrowRightToLine } as const;
const MODE_LABELS = { loop: '列表循环', shuffle: '随机播放', one: '单曲循环', order: '顺序播放' } as const;

const send = (action: string) => window.coco?.tray?.action(action);

/**
 * Right-click popup of the tray / menu-bar icon (window: electron/main/tray-windows.ts).
 * Laid out like a player's tray menu: transport on top, then like · song ·
 * mode, volume, feature toggles, settings, account and quit. Main pushes the
 * player state; every button sends an action back.
 */
export function TrayPanel() {
  useSchemeAndAccent();
  const [state, setState] = useState<CocoTrayState | null>(null);
  const [opened, setOpened] = useState(0);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  // Local volume while dragging, so the thumb does not jump back between IPC round trips.
  const [dragVolume, setDragVolume] = useState<number | null>(null);

  useEffect(() => window.coco?.tray?.onState(next => {
    if (typeof (next as { opened?: number }).opened === 'number' && !('hasTrack' in next)) { setOpened((next as { opened: number }).opened); return; }
    setState(next);
  }), []);

  // The window fits the card: report its layout height whenever it changes.
  // offsetHeight ignores the opening animation's scale; a detached or not yet
  // laid out card (height 0) must never shrink the window, which used to cut
  // the panel off below the song row.
  useLayoutEffect(() => {
    if (!card) return;
    const report = () => {
      const height = card.offsetHeight;
      if (card.isConnected && height > 0) window.coco?.tray?.resize(height + 16);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(card);
    return () => observer.disconnect();
  }, [card]);

  if (!state) return null;
  const ModeIcon = MODE_ICONS[state.mode];
  const volume = dragVolume ?? Math.round(state.volume * 100);
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const loggedIn = Boolean(state.nickname);

  return (
    <div className={styles.frame}>
      {/* Re-keying only replays the opening animation; the ref follows the new node. */}
      <div ref={setCard} key={opened} className={styles.card} role="menu" aria-label="CoCo Music">
        <div className={styles.transport}>
          <button type="button" className={styles.round} onClick={() => send('previous')} disabled={!state.hasTrack} aria-label="上一首" data-tooltip="上一首">
            <SkipBack size={16} strokeWidth={2} fill="currentColor" />
          </button>
          <button type="button" className={cn(styles.round, styles.play)} onClick={() => send('toggle')} disabled={!state.hasTrack} aria-label={state.playing ? '暂停' : '播放'} data-tooltip={state.playing ? '暂停' : '播放'}>
            {state.playing ? <Pause size={20} strokeWidth={0} fill="currentColor" /> : <Play size={20} strokeWidth={0} fill="currentColor" className={styles.playGlyph} />}
          </button>
          <button type="button" className={styles.round} onClick={() => send('next')} disabled={!state.hasTrack} aria-label="下一首" data-tooltip="下一首">
            <SkipForward size={16} strokeWidth={2} fill="currentColor" />
          </button>
        </div>

        <div className={styles.nowPlaying}>
          <button
            type="button"
            className={cn(styles.icon, state.liked && styles.liked)}
            onClick={() => send('like')}
            disabled={state.liked === null}
            aria-pressed={state.liked === true}
            aria-label={state.liked ? '取消喜欢' : '喜欢'}
            data-tooltip={state.liked === null ? (state.hasTrack ? '登录当前平台后可收藏' : '喜欢') : state.liked ? '取消喜欢' : '喜欢'}
          >
            <Heart size={17} strokeWidth={1.6} fill={state.liked ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className={styles.song} onClick={() => send('show')} data-tooltip={state.hasTrack ? `${state.title} - ${state.artist}` : undefined}>
            <strong>{state.hasTrack ? state.title : '未在播放'}</strong>
            {state.hasTrack && <small>{state.artist}</small>}
          </button>
          <button type="button" className={styles.icon} onClick={() => send('cycle-mode')} aria-label={MODE_LABELS[state.mode]} data-tooltip={MODE_LABELS[state.mode]}>
            <ModeIcon size={17} strokeWidth={1.6} />
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.volume}>
          <button type="button" className={styles.icon} onClick={() => send(`volume:${volume > 0 ? 0 : 62}`)} aria-label={volume > 0 ? '静音' : '取消静音'} data-tooltip={volume > 0 ? '静音' : '取消静音'}>
            <VolumeIcon size={17} strokeWidth={1.6} />
          </button>
          <Slider
            value={volume}
            max={100}
            size="sm"
            label="音量"
            formatValue={value => `${Math.round(value)}%`}
            onChange={value => { setDragVolume(Math.round(value)); send(`volume:${Math.round(value)}`); }}
            onCommit={value => { send(`volume:${Math.round(value)}`); setDragVolume(null); }}
          />
          <span className={styles.volumeValue}>{volume}</span>
        </div>

        <Item icon={<Mic2 size={16} strokeWidth={1.6} />} label={state.desktopLyrics ? '关闭桌面歌词' : '显示桌面歌词'} active={state.desktopLyrics} onClick={() => send('lyrics')} />
        {state.desktopLyrics && <Item label={state.desktopLyricsLocked ? '解锁桌面歌词' : '锁定桌面歌词'} inset onClick={() => send('lyrics-lock')} />}
        <Item icon={<PictureInPicture2 size={16} strokeWidth={1.6} />} label={state.mini ? '退出迷你模式' : '迷你模式'} active={state.mini} onClick={() => send('mini')} />

        <div className={styles.divider} />
        <Item icon={<Settings size={16} strokeWidth={1.6} />} label="设置" onClick={() => send('settings')} />

        <div className={styles.divider} />
        <Item icon={<LogIn size={16} strokeWidth={1.6} />} label={loggedIn ? `账号：${state.nickname}` : '登录账号'} onClick={() => send('account')} />
        <Item icon={<Power size={16} strokeWidth={1.6} />} label="退出 CoCo Music" danger onClick={() => send('quit')} />
      </div>
    </div>
  );
}

function Item({ icon, label, onClick, active, danger, inset }: { icon?: React.ReactNode; label: string; onClick: () => void; active?: boolean; danger?: boolean; inset?: boolean }) {
  return (
    <button type="button" role="menuitem" className={cn(styles.item, active && styles.itemActive, danger && styles.danger, inset && styles.inset)} onClick={onClick}>
      <span className={styles.itemIcon}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
