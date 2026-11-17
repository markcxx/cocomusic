export type CoverQuality = 'standard' | 'high' | 'original';

/**
 * Upgrade CDN artwork URLs for large displays (lyrics stage, cover flow, detail
 * headers) while keeping small list thumbnails lightweight.
 */
export function resolveCoverUrl(src: string | undefined, quality: CoverQuality, size?: number): string | undefined {
  if (!src) return undefined;
  if (quality === 'standard' || (size !== undefined && size < 100)) return src;

  // NetEase: ...jpg?param=200y200
  if (/[?&]param=\d+y\d+/i.test(src)) {
    if (quality === 'original') return src.replace(/([?&])param=\d+y\d+&?/i, (_, sep: string) => (sep === '?' ? '?' : '&')).replace(/[?&]$/, '');
    return src.replace(/([?&]param=)\d+y\d+/i, '$1800y800');
  }

  // QQ Music: https://y.gtimg.cn/music/photo_new/T002R300x300M000...jpg
  if (/y\.gtimg\.cn\/music\/photo_new\/T00[12]R\d+x\d+M000/i.test(src)) {
    return src.replace(/(T00[12]R)\d+x\d+(M000)/i, '$1800x800$2');
  }

  // Kugou: https://imge.kugou.com/stdmusic/400/2020...jpg
  if (/kugou\.com\/stdmusic\/\d+\//i.test(src)) {
    return src.replace(/(\/stdmusic\/)\d+(\/)/i, '$1800$2');
  }

  return src;
}

/** Download a cover image at the configured quality via same-origin proxy so CORS never opens a web tab. */
export async function downloadCoverImage(src: string | undefined, name: string, quality: CoverQuality) {
  const url = resolveCoverUrl(src, quality);
  if (!url) throw new Error('该歌曲暂无封面');
  const safeName = (name || 'cover').replace(/[\\/:*?"<>|]/g, '_').trim() || 'cover';
  const sameOrigin = url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:');
  const fetchUrl = sameOrigin
    ? url
    : `/api/music/cover?url=${encodeURIComponent(url)}&name=${encodeURIComponent(safeName)}`;

  const response = await fetch(fetchUrl);
  if (!response.ok) throw new Error(`封面下载失败 (${response.status})`);
  const blob = await response.blob();
  const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${safeName}${ext}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
