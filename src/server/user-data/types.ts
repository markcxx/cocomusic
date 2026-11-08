import type { CatalogSource } from '../music/types';
import type { Track } from '../../types/music';

/** Shapes and limits of the data kept in coco.db, shared with the client. */

/** Name length limit, shared with the platforms' playlist dialogs. */
export const PLAYLIST_NAME_MAX = 40;
/** Same bound as the play queue: keeps a playlist (and the queue it becomes) manageable. */
export const PLAYLIST_TRACK_LIMIT = 2000;
export const QUEUE_LIMIT = 2000;
export const RECENT_PLAYS_LIMIT = 300;

/** Platform playlist or album a 本地歌单 was copied from (导入歌单 / 存为本地歌单). */
export type PlaylistOrigin = { kind: 'playlist' | 'album'; source: CatalogSource; id: string };

/** 本地歌单 without its songs (sidebar, menus). `cover` falls back to the first song with artwork. */
export interface LocalPlaylistSummary {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  origin?: PlaylistOrigin;
  trackCount: number;
  /** Epoch ms. */
  createdAt: number;
  updatedAt: number;
}

/** Entries are player tracks, so one playlist mixes NetEase, QQ and Kugou songs with local files. */
export interface LocalPlaylist extends LocalPlaylistSummary {
  tracks: Track[];
}

/** 最近播放: one entry per song; replaying moves it to the top and bumps the count. */
export type RecentPlay = { track: Track; playedAt: number; count: number };

/** Saved play queue (restored paused on launch) and where the current song was. */
export type PlayerSnapshot = { queue: Track[]; currentId?: string; position?: { id: string; t: number } };
