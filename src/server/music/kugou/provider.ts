import type { CatalogProvider } from '../types';
import { kugouAccount } from './account';
import { albumDetail, artistAlbums, artistInfo, artistSongs, bestMatch, categories, charts, featured, newReleases, playlistDetail, playlists, search, searchDiscovery, suggest, topArtists } from './catalog';
import { SOURCE } from './mappers';
import { comments, lyrics, songSource, songStats } from './playback';

export const kugouProvider: CatalogProvider = {
  source: SOURCE,
  songSource,
  lyrics,
  songStats,
  comments,
  featured,
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
  account: kugouAccount,
};
