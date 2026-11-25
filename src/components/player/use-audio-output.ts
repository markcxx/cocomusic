import { useEffect, type RefObject } from 'react';
import { toast } from '@/components/ui/toast';
import { settings as appSettings, useSettings } from '@/lib/settings';
import { setGraphOutputDevice } from './visualizer/audio-graph';

/** 设置 › 播放: speed (keeps pitch) and output device. `loadKey` re-applies the rate after each load. */
export function useAudioOutput(audioRef: RefObject<HTMLAudioElement | null>, loadKey: number) {
  const { playbackRate, outputDevice } = useSettings();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
    audio.defaultPlaybackRate = playbackRate;
    audio.preservesPitch = true;
  }, [audioRef, playbackRate, loadKey]);

  useEffect(() => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    // Routed through the visualizer's AudioContext, the context picks the device.
    setGraphOutputDevice(audio, outputDevice);
    if (!audio?.setSinkId) return;
    audio.setSinkId(outputDevice).catch(() => {
      // Device unplugged or permission denied: fall back to the system default.
      if (outputDevice) { toast.error('所选输出设备不可用，已切换到系统默认'); appSettings.set('outputDevice', ''); }
    });
  }, [audioRef, outputDevice]);
}
