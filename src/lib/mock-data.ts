import type { Track } from '@/types/music';

/** Home page tabs: curated content types, not playlist categories (those live in 歌单广场). */
export const homeTabs = ['精选', '新歌速递', '热门歌手'] as const;
export type HomeTab = (typeof homeTabs)[number];

/**
 * Player state before anything has been chosen. No `songId`, so every
 * playback control treats it as "nothing to play"; the UI shows an empty state.
 */
export const emptyTrack: Track = {
  id: 'empty',
  title: '',
  artist: '',
  coverSeed: 'empty',
};

export const isEmptyTrack = (track: Track) => !track.songId && !track.localId;
