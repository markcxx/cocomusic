import type { CatalogProvider } from '../types';
import { neteaseAccount } from './account';
import { artistAlbums, artistBiography, artistInfo, artistSongs } from './artists';
import { albumDetail, playlistDetail } from './collections';
import { categories, charts, dailySongs, featured, newReleases, playlists, topArtists } from './discovery';
import { bestMatch, search, searchDiscovery, suggest } from './search';
import { SOURCE } from './mappers';
import { comments, downloadSource, lyrics, songSource, songStats } from './playback';

export const neteaseProvider: CatalogProvider = {
  source: SOURCE,
  songSource,
  downloadSource,
  lyrics,
  songStats,
  comments,
  featured,
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
