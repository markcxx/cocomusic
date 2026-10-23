import type { Track } from '@/types/music';

// Placeholders until the library (liked songs, saved playlists, history) and playback are implemented.

/** Home page tabs: curated content types, not playlist categories (those live in 歌单广场). */
export const homeTabs = ['精选', '新歌速递', '热门歌手'] as const;
export type HomeTab = (typeof homeTabs)[number];

export const savedPlaylists = [
  { id: 'daily-favorites', name: '日常收藏夹', coverSeed: 'saved-1' },
  { id: 'night-alone', name: '一个人的夜晚', coverSeed: 'saved-2' },
  { id: 'city-walk', name: '城市漫游', coverSeed: 'saved-3' },
];

/** Shown in the player before anything has been played. */
export const initialTrack: Track = {
  id: 'placeholder:qingtian', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, coverSeed: 'qingtian',
};
