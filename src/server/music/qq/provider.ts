import type { CatalogProvider } from '../types';
import { qqAccount } from './account';
import { albumDetail, artistAlbums, artistInfo, artistSongs, bestMatch, categories, charts, dailySongs, personalFm, featured, newReleases, playlistDetail, playlists, search, searchDiscovery, suggest, topArtists } from './catalog';
import { SOURCE } from './mappers';
import { commentActions, commentReplies, comments } from './comments';
import { lyrics, songSource, songStats } from './playback';

export const qqProvider: CatalogProvider = {
  source: SOURCE,
  songSource,
  lyrics,
  songStats,
  comments,
  commentReplies,
  commentActions,
  featured,
  personalFm,
  dailySongs,
  newReleases,
  artists: topArtists,
  charts,
  categories,
  playlists,
  playlistDetail,
  albumDetail,
  search,
  bestMatch,
  suggest,
  searchDiscovery,
  artistInfo,
  artistSongs,
  artistAlbums,
  account: qqAccount,
};
