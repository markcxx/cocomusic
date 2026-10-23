import type { CatalogProvider } from '../types';
import { neteaseAccount } from './account';
import { artistAlbums, artistInfo, artistSongs } from './artists';
import { albumDetail, playlistDetail } from './collections';
import { categories, charts, featured, newReleases, playlists, topArtists } from './discovery';
import { bestMatch, search, searchDiscovery, suggest } from './search';
import { SOURCE } from './mappers';
import { comments, lyrics, songSource, songStats } from './playback';

export const neteaseProvider: CatalogProvider = {
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
  account: neteaseAccount,
};
