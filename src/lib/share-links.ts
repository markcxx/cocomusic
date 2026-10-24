import type { CatalogSource } from '@/server/music/types';

/** Public web pages for catalog items, used by 分享 / 复制链接 / 个人主页. */
export function shareUrl(source: CatalogSource | undefined, kind: 'playlist' | 'album' | 'song' | 'user', id: string) {
  const encoded = encodeURIComponent(id);
  switch (source ?? 'netease') {
    case 'qq':
      if (kind === 'playlist') return `https://y.qq.com/n/ryqq/playlist/${encoded}`;
      if (kind === 'album') return `https://y.qq.com/n/ryqq/albumDetail/${encoded}`;
      if (kind === 'song') return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(id.split('.')[0])}`;
      return `https://y.qq.com/n/ryqq/profile/like/song?uin=${encoded}`;
    case 'kugou':
      if (kind === 'playlist') return `https://www.kugou.com/songlist/${encoded}/`;
      if (kind === 'album') return `https://www.kugou.com/album/info/${encoded}/`;
      if (kind === 'song') return `https://www.kugou.com/mixsong/${encodeURIComponent(id.split('.')[2] ?? id)}.html`;
      return 'https://www.kugou.com/';
    default:
      return `https://music.163.com/#/${kind === 'user' ? 'user/home' : kind}?id=${encoded}`;
  }
}
