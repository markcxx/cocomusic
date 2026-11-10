import { persistentStorage } from '@/lib/persistent-storage';
import { playModes, type PlayMode } from './play-mode';

/** Volume and play mode live on this device only (the queue is kept by the app server). */
const VOLUME_KEY = 'coco:volume';
const MODE_KEY = 'coco:play-mode';
export const DEFAULT_VOLUME = 0.62;

const readStored = (key: string) => {
  try { return persistentStorage.getItem(key); } catch { return null; }
};
const writeStored = (key: string, value: string) => {
  try { persistentStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

export const readVolume = () => {
  const raw = readStored(VOLUME_KEY);
  const value = Number(raw);
  return raw !== null && Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_VOLUME;
};
export const readMode = (): PlayMode => {
  const raw = readStored(MODE_KEY);
  return playModes.includes(raw as PlayMode) ? (raw as PlayMode) : 'loop';
};
export const saveVolume = (volume: number) => writeStored(VOLUME_KEY, String(volume));
export const saveMode = (mode: PlayMode) => writeStored(MODE_KEY, mode);
