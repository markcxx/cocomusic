import { useEffect, type RefObject } from 'react';
import { settings as appSettings, useSettings } from '@/lib/settings';
import { useLatest } from '@/lib/use-latest';
import { isPlayable } from '@/types/music';
import { broadcastPlayer } from './player-broadcast';
import type { PlayerState } from './player-types';

type Media = {
  audioRef: RefObject<HTMLAudioElement | null>;
  mvMedia: RefObject<HTMLVideoElement | null>;
  /** Set while an MV owns playback (see openMv / closeMv). */
  mvSession: RefObject<{ id: string; playing: boolean } | null>;
};

/**
 * Everything outside the page that drives or mirrors playback: OS media
 * controls, the desktop-lyrics broadcast, the window title, in-app and global
 * shortcuts. Reads the live player through `value`; owns no state.
 */
export function usePlayerIntegrations(value: PlayerState, position: number, { audioRef, mvMedia, mvSession }: Media) {
  const { track, trial, playing } = value;
  const { titleShowsTrack } = useSettings();
  // System media controls (keyboard media keys, OS now-playing panels).
  const controls = useLatest(value);
  /** Shortcuts and system controls pause/resume whatever is playing: the MV while one is open. */
  const toggleActive = () => {
    const video = mvSession.current && mvMedia.current;
    if (!video) { controls.current.togglePlay(); return; }
    if (video.paused) void video.play().catch(() => {}); else video.pause();
  };
  useEffect(() => {
    if (!('mediaSession' in navigator) || !isPlayable(track)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork: track.cover ? [{ src: new URL(track.cover, window.location.href).href, sizes: '200x200' }] : [],
    });
    const handlers: Array<[MediaSessionAction, () => void]> = [
      ['play', () => { if (mvSession.current) { void mvMedia.current?.play().catch(() => {}); return; } if (!controls.current.playing) controls.current.togglePlay(); }],
      ['pause', () => { if (mvSession.current) { mvMedia.current?.pause(); return; } if (controls.current.playing) controls.current.togglePlay(); }],
      ['previoustrack', () => controls.current.previous()],
      ['nexttrack', () => controls.current.next()],
    ];
    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
    }
  }, [track, controls, mvMedia, mvSession]);

  // Desktop lyrics window and other views follow playback over a broadcast channel.
  useEffect(() => { broadcastPlayer.publishTrack(track, trial); }, [track, trial]);

  // 设置 › 系统 › 窗口标题显示歌曲: taskbar / Dock window menu show what is playing.
  useEffect(() => {
    document.title = titleShowsTrack && isPlayable(track) ? `${track.title} - ${track.artist} · CoCo Music` : 'CoCo Music';
  }, [titleShowsTrack, track]);
  useEffect(() => { broadcastPlayer.publishClock(position, playing); }, [position, playing]);
  useEffect(() => broadcastPlayer.onCommand(command => {
    if (command === 'toggle') toggleActive();
    else if (command === 'next') controls.current.next();
    else if (command === 'previous') controls.current.previous();
    else if (command === 'sync') broadcastPlayer.publishTrack(controls.current.track, controls.current.trial, true);
    // toggleActive only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [controls]);

  // In-app shortcuts (设置 › 快捷键): Space play/pause; ⌘/Ctrl + ←/→ previous/next; ⌘/Ctrl + ↑/↓ volume.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!appSettings.get().appShortcuts || event.repeat || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      const combo = (event.metaKey || event.ctrlKey) && !event.shiftKey;
      if (combo && !typing) {
        const player = controls.current;
        const actions: Record<string, () => void> = {
          ArrowRight: player.next,
          ArrowLeft: player.previous,
          ArrowUp: () => player.setVolume(Math.min(1, Math.round((player.volume + 0.05) * 100) / 100)),
          ArrowDown: () => player.setVolume(Math.max(0, Math.round((player.volume - 0.05) * 100) / 100)),
        };
        const action = actions[event.key];
        if (action) { event.preventDefault(); action(); }
        return;
      }
      // ← / → (no modifier): skip within the song by 设置 › 快捷键 › 快进快退.
      const step = appSettings.get().seekStep;
      if (step && !typing && !event.metaKey && !event.ctrlKey && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        if (target?.closest('[role="slider"], [role="menu"], [role="listbox"], [role="radiogroup"]')) return;
        const delta = event.key === 'ArrowRight' ? step : -step;
        const video = mvSession.current && mvMedia.current;
        if (video) { event.preventDefault(); video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta)); return; }
        const audio = audioRef.current;
        if (!audio?.getAttribute('src')) return;
        event.preventDefault();
        controls.current.seek(audio.currentTime + delta);
        return;
      }
      if (event.code !== 'Space' || event.metaKey || event.ctrlKey) return;
      // Modal dialogs own the keyboard, except surfaces of the player itself (lyrics page).
      if (typing || target?.closest('button, [role="slider"], [role="menu"], [role="dialog"]:not([data-player-surface])')) return;
      event.preventDefault();
      toggleActive();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  // System-wide shortcuts registered by the main process (设置 › 快捷键 › 全局快捷键).
  useEffect(() => window.coco?.app?.onShortcut(action => {
    const player = controls.current;
    if (action === 'toggle') toggleActive();
    else if (action === 'next') player.next();
    else if (action === 'previous') player.previous();
    else if (action === 'volume-up') player.setVolume(Math.min(1, Math.round((player.volume + 0.05) * 100) / 100));
    else if (action === 'volume-down') player.setVolume(Math.max(0, Math.round((player.volume - 0.05) * 100) / 100));
    else if (action === 'lyrics') window.coco?.lyrics?.setDesktop('toggle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [controls]);
}
