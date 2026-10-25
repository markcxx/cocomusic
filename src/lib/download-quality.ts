import type { AudioQuality, CatalogSource } from '@/server/music/types';

export const QUALITY_LABELS: Record<AudioQuality, string> = { standard: '标准', higher: '较高', exhigh: '极高', lossless: '无损', hires: 'Hi-Res' };
export const QUALITY_HINTS: Record<AudioQuality, string> = { standard: '体积小，适合日常收听', higher: '兼顾清晰度与文件大小', exhigh: '高码率音频', lossless: '保留更多音频细节', hires: '高解析度音频' };
export const downloadQualities = (source: CatalogSource): AudioQuality[] => source === 'netease'
  ? ['standard', 'higher', 'exhigh', 'lossless', 'hires']
  : source === 'qq' ? ['standard', 'higher', 'exhigh', 'lossless'] : ['standard', 'exhigh', 'lossless'];

export interface DownloadOptions {
  quality: AudioQuality;
  lyrics: boolean;
  allowTrial: boolean;
  /** Explicit consent to use a lower quality if account entitlements change. */
  allowFallback: boolean;
}
export interface DownloadQualityOption {
  quality: AudioQuality;
  available: boolean;
  trial: boolean;
  reason?: string;
}
