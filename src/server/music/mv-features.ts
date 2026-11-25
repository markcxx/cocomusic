import type { CatalogSource } from './types';

/** Browsable MV lists: 榜单 (ranked), 热门 and 最新. Search and artist videos are separate capabilities. */
export type MvBrowseKind = 'top' | 'hot' | 'latest';
export type MvListKind = MvBrowseKind | 'search' | 'artist';

/** Region filter shared by every browsable list; '' is 全部. */
export const MV_AREAS = [
  { id: '', label: '全部' },
  { id: 'mainland', label: '内地' },
  { id: 'hktw', label: '港台' },
  { id: 'western', label: '欧美' },
  { id: 'korea', label: '韩国' },
  { id: 'japan', label: '日本' },
] as const;
export type MvArea = (typeof MV_AREAS)[number]['id'];

export const MV_BROWSE_LABELS: Record<MvBrowseKind, string> = { top: '榜单', hot: '热门', latest: '最新' };

/** What each platform exposes for finding MVs. Free of Node imports so pages can read it. */
export const MV_FEATURES: Record<CatalogSource, { browse: MvBrowseKind[]; search: boolean; artist: boolean }> = {
  netease: { browse: ['top', 'hot', 'latest'], search: true, artist: true },
  qq: { browse: ['top', 'hot', 'latest'], search: true, artist: true },
  kugou: { browse: [], search: true, artist: true },
  'kugou-lite': { browse: [], search: true, artist: true },
};
