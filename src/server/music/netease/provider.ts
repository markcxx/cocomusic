import type { CatalogProvider } from '../types';
import { neteaseAccount } from './account';
import { artistAlbums, artistBiography, artistInfo, artistSongs } from './artists';
import { albumDetail, playlistDetail } from './collections';
import { categories, charts, dailySongs, personalFm, featured, newReleases, playlists, topArtists } from './discovery';
import { bestMatch, search, searchDiscovery, suggest } from './search';
import { SOURCE } from './mappers';
import { commentActions, commentReplies, comments } from './comments';
import { downloadSource, lyrics, songSource, songStats } from './playback';

export const neteaseProvider: CatalogProvider = {
  source: SOURCE,
  songSource,
  downloadSource,
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
  artistBiography,
  artistSongs,
  artistAlbums,
  account: neteaseAccount,
};
