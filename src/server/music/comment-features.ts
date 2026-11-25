import type { CatalogSource } from './types';

/**
 * What each platform's comment threads support, shared by the API routes and
 * the UI. `post` covers new comments, replies and deleting one's own.
 * QQ exposes no comment-like endpoint on its public gateway; Kugou's write
 * endpoints are not implemented.
 */
export interface CommentFeatures {
  /** Playlists and albums have threads too. */
  collections: boolean;
  /** Replies under a comment can be listed (楼层). */
  replies: boolean;
  post: boolean;
  like: boolean;
  /** Longest comment upstream accepts. */
  maxLength: number;
}

const KUGOU: CommentFeatures = { collections: true, replies: true, post: false, like: false, maxLength: 0 };

export const COMMENT_FEATURES: Record<CatalogSource, CommentFeatures> = {
  netease: { collections: true, replies: true, post: true, like: true, maxLength: 140 },
  qq: { collections: true, replies: true, post: true, like: false, maxLength: 300 },
  kugou: KUGOU,
  'kugou-lite': KUGOU,
};
