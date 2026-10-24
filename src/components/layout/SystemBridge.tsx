'use client';

import { useEffect, useMemo } from 'react';
import { useAccount } from '@/components/account/account-store';
import { useNavigation } from '@/components/layout/navigation';
import { playModes, usePlaybackPosition, usePlayer, type PlayMode } from '@/components/player/player-store';
import { useTrackLyrics } from '@/components/player/use-track-lyrics';
import { useLatest } from '@/lib/use-latest';
import { desktopLyricColor, useSettings } from '@/lib/settings';
import { activeLineIndex, lineProgress } from '@/server/music/lrc';

/**
 * Keeps the OS surfaces in sync with the player (desktop only):
 * - pushes the player state (song, play/pause, like, mode, current lyric line)
 *   to the main process, which renders the Dock menu, the menu-bar / tray icon
 *   (with the lyric next to it on macOS), the 控制 menu and the Windows taskbar;
 * - runs the actions picked in those menus.
 * Renders nothing.
 */
export function SystemBridge() {
  const player = usePlayer();
  const { track, playing, mode, trial } = player;
  const account = useAccount();
  const { navigate } = useNavigation();
  const prefs = useSettings();
  const lyrics = useTrackLyrics(track);
  const position = usePlaybackPosition();

  // Only the line index matters, so this re-renders the bridge once per lyric line, not per frame.
  const lines = lyrics.data?.lines;
  const synced = Boolean(lyrics.data?.synced);
  const time = position + (trial?.start ?? 0) + 0.15 + prefs.lyricsOffset;
  const index = synced && lines ? activeLineIndex(lines, time) : -1;
  const lyric = index >= 0 && lines ? lines[index].text : '';
  // Sung fraction of the line in 5% steps: enough for a smooth karaoke fill without flooding IPC.
  const progress = index >= 0 && lines ? Math.round(lineProgress(lines[index], lines[index + 1], time) * 20) / 20 : 0;

  const likeable = Boolean(track.songId && account.profile && (track.source ?? 'netease') === prefs.catalogSource);
  const liked = likeable ? account.isLiked(track.songId!) : null;
  const hasTrack = Boolean(track.songId || track.localId);

  const volume = Math.round(player.volume * 100) / 100;
  const cover = track.cover && /^https:\/\//.test(track.cover) ? track.cover : '';
  const nickname = account.profile?.nickname ?? '';
  const state = useMemo<CocoSystemPlayerState>(() => ({
    hasTrack, title: track.title, artist: track.artist, playing, liked, mode, lyric, progress, volume, cover, nickname,
    showTray: prefs.showTray, trayLyrics: prefs.trayLyrics, menuBarText: prefs.menuBarText, lyricColor: desktopLyricColor(prefs).to,
  }), [hasTrack, track.title, track.artist, playing, liked, mode, lyric, progress, volume, cover, nickname, prefs]);

  useEffect(() => { window.coco?.system?.setPlayerState(state); }, [state]);

  const latest = useLatest({ player, account, navigate, track });
  useEffect(() => window.coco?.system?.onAction(action => {
    const { player: current, account: acc, navigate: go, track: song } = latest.current;
    if (action === 'toggle') current.togglePlay();
    else if (action === 'next') current.next();
    else if (action === 'previous') current.previous();
    else if (action === 'like') { if (song.songId) void acc.toggleLike(song.songId); }
    else if (action === 'settings') { current.closeLyrics(); go({ name: 'settings' }); }
    else if (action === 'account') { current.closeLyrics(); if (acc.profile) go({ name: 'settings' }); else acc.openLogin(); }
    else if (action === 'cycle-mode') current.cycleMode();
    else if (action.startsWith('volume:')) {
      const value = Number(action.slice(7));
      if (Number.isFinite(value)) current.setVolume(Math.min(1, Math.max(0, value / 100)));
    }
    else if (action.startsWith('mode:')) {
      const next = action.slice(5) as PlayMode;
      if (playModes.includes(next)) current.setMode(next);
    }
  }), [latest]);

  return null;
}
