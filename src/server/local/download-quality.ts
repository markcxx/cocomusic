import { downloadQualities, QUALITY_LABELS, type DownloadOptions, type DownloadQualityOption } from '../../lib/download-quality';
import type { AudioQuality, CatalogProvider, SongSource } from '../music/types';

export const resolveDownload = (provider: CatalogProvider, id: string, quality: AudioQuality) =>
  (provider.downloadSource ?? provider.songSource)(id, quality);

/** Probe the authenticated platform, never infer song access from a VIP badge. URLs stay server-side. */
export async function inspectDownloadQualities(provider: CatalogProvider, id: string): Promise<{ options: DownloadQualityOption[] }> {
  const options = await Promise.all(downloadQualities(provider.source).map(async quality => {
    try {
      const source = await resolveDownload(provider, id, quality);
      const available = source.level === quality;
      return { quality, available, trial: Boolean(source.trial), reason: available ? undefined : source.level ? `当前仅提供${QUALITY_LABELS[source.level as AudioQuality] ?? source.level}${source.trial ? '试听' : ''}` : '平台未确认实际音质' };
    } catch (error) {
      return { quality, available: false, trial: false, reason: error instanceof Error ? error.message : '暂时无法确认权限' };
    }
  }));
  return { options };
}

export function assertDownloadAccess(source: SongSource, options: Pick<DownloadOptions, 'quality' | 'allowTrial' | 'allowFallback'>) {
  if (source.trial && !options.allowTrial) throw new Error('当前账号仅能获取试听片段，请在下载弹窗明确允许保存试听片段');
  if (!source.level) throw new Error('平台未确认实际音质，请稍后重试');
  if (!options.allowFallback && source.level !== options.quality) throw new Error(`所选${QUALITY_LABELS[options.quality]}音质不可用${source.level ? `，平台实际提供 ${QUALITY_LABELS[source.level as AudioQuality] ?? source.level}` : '，平台未确认实际音质'}。请重新选择音质或允许自动降级`);
}
