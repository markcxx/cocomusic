'use client';
import { useEffect, useRef, useState } from 'react';
import type Player from 'video.js/dist/types/player';
import { useLatest } from '@/lib/use-latest';
import { usePlayer } from '../player-store';
import type { MusicVideo } from '@/server/music/mv';

export type VideoState = { playing: boolean; buffering: boolean; ended: boolean; time: number; duration: number; volume: number; muted: boolean; rate: number; pip: boolean };

/**
 * Video.js owns decoding/lifecycle; shared app components own presentation.
 * Starting the video joins the player's MV session (music pauses); a quality
 * switch rebuilds the source and resumes at the same time and state.
 */
export function useVideoPlayer(mv: MusicVideo, quality: string, onError: (message: string) => void) {
  const audio = usePlayer();
  const latest = useLatest({ audio, onError });
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Player | null>(null);
  // Opening the page plays the MV; later rebuilds keep whatever the user chose.
  const resume = useRef({ time: 0, paused: false, muted: false, rate: 1 });
  const [state, setState] = useState<VideoState>({ playing: false, buffering: true, ended: false, time: 0, duration: 0, volume: audio.volume, muted: false, rate: 1, pip: false });
  useEffect(() => {
    const detach = latest.current.audio.setMvMedia;
    let disposed = false;
    let player: Player | undefined;
    void import('video.js').then(({ default: videojs }) => {
      if (disposed || !host.current) return;
      const element = document.createElement('video-js');
      host.current.appendChild(element);
      const selected = mv.qualities.find(q => q.id === quality) ?? mv.qualities[0];
      player = videojs(element, { controls: false, autoplay: false, preload: 'auto', fill: true, playsinline: true, poster: mv.cover || latest.current.audio.track.cover, sources: [{ src: selected.url, type: 'video/mp4' }] });
      instance.current = player;
      const video = player;
      const sync = () => setState({ playing: !video.paused(), buffering: false, ended: video.ended(), time: video.currentTime() || 0, duration: Number.isFinite(video.duration()) ? video.duration()! : 0, volume: video.volume() ?? 0, muted: video.muted() ?? false, rate: video.playbackRate() || 1, pip: Boolean(document.pictureInPictureEnabled) });
      video.ready(() => {
        if (disposed) return;
        latest.current.audio.setMvMedia(video.el()?.querySelector('video') ?? null);
      });
      video.on(['play', 'pause', 'playing', 'timeupdate', 'durationchange', 'volumechange', 'ratechange', 'ended'], sync);
      video.on('play', () => latest.current.audio.openMv());
      video.on('waiting', () => setState(current => ({ ...current, buffering: true })));
      video.on('volumechange', () => latest.current.audio.setVolume(video.volume() ?? 0));
      video.one('loadedmetadata', () => {
        video.muted(resume.current.muted); video.playbackRate(resume.current.rate);
        video.currentTime(Math.min(resume.current.time, Math.max(0, (video.duration() || Infinity) - .1)));
        sync();
        if (!resume.current.paused) void video.play()?.catch(sync);
      });
      video.on('error', () => latest.current.onError('视频暂时无法播放，请重试或切换清晰度。'));
    }).catch(() => latest.current.onError('播放器加载失败，请重试'));
    return () => {
      disposed = true;
      if (player) { resume.current = { time: player.currentTime() || 0, paused: player.paused(), muted: player.muted() ?? false, rate: player.playbackRate() || 1 }; player.dispose(); }
      instance.current = null;
      detach(null);
    };
  }, [mv, quality, latest]);
  return { host, state,
    toggle: () => { const p = instance.current; if (p?.paused()) void p.play()?.catch(() => {}); else p?.pause(); },
    seek: (time: number) => instance.current?.currentTime(Math.max(0, Math.min(state.duration, time))),
    setVolume: (value: number) => { instance.current?.muted(false); instance.current?.volume(value); },
    toggleMute: () => instance.current?.muted(!instance.current.muted()),
    setRate: (rate: number) => instance.current?.playbackRate(rate),
    pictureInPicture: () => { const media = instance.current?.el()?.querySelector('video'); if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {}); else if (media) void media.requestPictureInPicture().catch(() => {}); },
  };
}
