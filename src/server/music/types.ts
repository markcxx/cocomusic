/**
 * Platform-neutral catalog shapes returned by /api/music/*. Each provider
 * (netease now; qq/kugou later) maps its own payloads into these.
 */
export type CatalogSource = 'netease' | 'qq' | 'kugou';
export type Trend = 'up' | 'down' | 'same' | 'new';

export interface CatalogTrack {
  id: string;
  source: CatalogSource;
  title: string;
  artist: string;
  /** Individual artists, for linking. */
  artists?: Array<{ id: string; name: string }>;
  album?: string;
  albumId?: string;
  cover?: string;
  /** Seconds. */
  duration?: number;
  /** Track requires a paid membership upstream (informational only). */
  vip?: boolean;
}

export interface CatalogPlaylist {
  id: string;
  source: CatalogSource;
  name: string;
  cover?: string;
  trackCount?: number;
  playCount?: number;
  creator?: string;
  /** Short tag such as a category or recommendation reason. */
  tag?: string;
}

export interface CatalogAlbum {
  id: string;
  source: CatalogSource;
  name: string;
  artist: string;
  cover?: string;
  trackCount?: number;
  /** Epoch milliseconds. */
  publishTime?: number;
}

export interface CatalogArtist {
  id: string;
  source: CatalogSource;
  name: string;
  avatar?: string;
  alias?: string;
  songCount?: number;
  albumCount?: number;
}

export interface CatalogChart {
  id: string;
  source: CatalogSource;
  name: string;
  updateLabel?: string;
  cover?: string;
  /** `trend` is present only when the platform reports rank movement. */
  entries: Array<{ rank: number; track: CatalogTrack; trend?: Trend }>;
}

export interface CategoryGroup {
  id: string;
  label: string;
  options: string[];
}

/** 'hot' pages by offset; 'quality' (curated) pages by an opaque cursor. */
export type PlaylistOrder = 'hot' | 'quality';

export interface PlaylistPage {
  items: CatalogPlaylist[];
  total: number;
  hasMore: boolean;
  /** Pass back as `cursor` to fetch the next page. */
  cursor?: string;
}

export interface HomeFeatured {
  playlists: CatalogPlaylist[];
  tracks: CatalogTrack[];
  charts: CatalogChart[];
}

/** Header of a playlist or album detail page. */
export interface CollectionInfo {
  kind: 'playlist' | 'album';
  id: string;
  source: CatalogSource;
  name: string;
  cover?: string;
  description?: string;
  /** Playlist creator or album artist. */
  owner?: { name: string; avatar?: string };
  tags?: string[];
  trackCount: number;
  playCount?: number;
  subscribedCount?: number;
  /** Epoch ms: playlist creation or album release. */
  createdAt?: number;
  updatedAt?: number;
  /** Album label / publisher. */
  company?: string;
}

export interface CollectionDetail {
  info: CollectionInfo;
  tracks: CatalogTrack[];
  offset: number;
  hasMore: boolean;
}

export type SearchType = 'song' | 'playlist' | 'album' | 'artist';

export type SearchResult =
  | { type: 'song'; items: CatalogTrack[]; total: number; hasMore: boolean }
  | { type: 'playlist'; items: CatalogPlaylist[]; total: number; hasMore: boolean }
  | { type: 'album'; items: CatalogAlbum[]; total: number; hasMore: boolean }
  | { type: 'artist'; items: CatalogArtist[]; total: number; hasMore: boolean };

/** Grouped type-ahead matches for a partial keyword. */
export interface SearchSuggestion {
  keywords: string[];
  songs: CatalogTrack[];
  artists: CatalogArtist[];
  albums: CatalogAlbum[];
  playlists: CatalogPlaylist[];
}

export interface HotSearch {
  keyword: string;
  score?: number;
  /** Optional one-line note shown under the keyword. */
  note?: string;
  /** Upstream marks: hot/new/up. */
  badge?: 'hot' | 'new' | 'up';
}

export interface SearchDiscovery {
  /** Placeholder keyword shown in the empty search box. */
  placeholder?: string;
  hot: HotSearch[];
}

/* ───────────── Playback, lyrics, comments ───────────── */

/** A playable stream for one song. URLs are short-lived; fetch right before playing. */
export interface SongSource {
  id: string;
  url: string;
  /** Bits per second. */
  bitrate?: number;
  /** Platform quality label, e.g. standard / exhigh / lossless. */
  level?: string;
  /**
   * Present when only a preview clip is available (e.g. VIP songs when not entitled).
   * Seconds within the full song; the stream itself starts at `start`.
   */
  trial?: { start: number; end: number };
}

export interface LyricLine {
  /** Seconds from the start of the song. */
  time: number;
  text: string;
  /** Translated line at the same timestamp, when the platform has one. */
  translation?: string;
}

export interface Lyrics {
  lines: LyricLine[];
  /** False when the platform only has unsynced text (lines then carry time 0). */
  synced: boolean;
  /** Instrumental track: upstream marks it as having no lyrics. */
  instrumental?: boolean;
}

export interface SongStats {
  /** How many users liked (red-hearted) the song. */
  likeCount?: number;
  commentCount?: number;
}

export type CommentSort = 'recommend' | 'hot' | 'latest';

export interface SongComment {
  id: string;
  content: string;
  /** Epoch ms. */
  time: number;
  likedCount: number;
  replyCount?: number;
  /** Poster's IP region as reported upstream. */
  location?: string;
  user: { id: string; nickname: string; avatar?: string; vip?: boolean };
  /** The comment this one replies to. */
  replyTo?: { nickname: string; content: string };
}

export interface CommentPage {
  items: SongComment[];
  total: number;
  hasMore: boolean;
  /** Opaque; pass back to fetch the next page. */
  cursor?: string;
}

export interface CatalogProvider {
  source: CatalogSource;
  songSource(id: string): Promise<SongSource>;
  lyrics(id: string): Promise<Lyrics>;
  songStats(id: string): Promise<SongStats>;
  comments(id: string, sort: CommentSort, cursor: string | undefined, limit: number): Promise<CommentPage>;
  featured(): Promise<HomeFeatured>;
  newReleases(): Promise<{ tracks: CatalogTrack[]; albums: CatalogAlbum[] }>;
  artists(limit: number): Promise<CatalogArtist[]>;
  charts(limit: number): Promise<CatalogChart[]>;
  categories(): Promise<CategoryGroup[]>;
  playlists(query: { category: string; order: PlaylistOrder; cursor?: string; limit: number }): Promise<PlaylistPage>;
  playlistDetail(id: string, offset: number, limit: number): Promise<CollectionDetail>;
  albumDetail(id: string): Promise<CollectionDetail>;
  search(keyword: string, type: SearchType, offset: number, limit: number): Promise<SearchResult>;
  bestMatch(keyword: string): Promise<BestMatch>;
  artistInfo(id: string): Promise<ArtistInfo>;
  artistSongs(id: string, offset: number, limit: number): Promise<{ items: CatalogTrack[]; total: number; hasMore: boolean }>;
  artistAlbums(id: string, offset: number, limit: number): Promise<{ items: CatalogAlbum[]; total: number; hasMore: boolean }>;
  /** Present when the platform supports accounts. */
  account?: AccountProvider;
  suggest(keyword: string): Promise<SearchSuggestion>;
  searchDiscovery(): Promise<SearchDiscovery>;
}

export interface ArtistInfo {
  id: string;
  source: CatalogSource;
  name: string;
  avatar?: string;
  /** Wide banner image when available. */
  cover?: string;
  alias: string[];
  /** e.g. 歌手、作词、作曲 */
  identity?: string;
  description?: string;
  songCount?: number;
  albumCount?: number;
}

/* ───────────── Account (requires login) ───────────── */

export interface UserProfile {
  id: string;
  source: CatalogSource;
  nickname: string;
  avatar?: string;
  /** Upstream VIP level; 0 when none. */
  vipType?: number;
}

export interface UserPlaylist extends CatalogPlaylist {
  /** True for playlists the user created (incl. 我喜欢的音乐); false for subscribed ones. */
  own: boolean;
  /** The user's "我喜欢的音乐" playlist. */
  liked?: boolean;
  privacy?: 'public' | 'private';
}

export type QrLoginState =
  | { status: 'waiting' }
  | { status: 'scanned'; nickname?: string; avatar?: string }
  | { status: 'expired' }
  | { status: 'success'; profile: UserProfile };

export interface AccountProvider {
  qrCreate(): Promise<{ key: string; url: string }>;
  qrCheck(key: string): Promise<QrLoginState>;
  profile(): Promise<UserProfile | null>;
  logout(): Promise<void>;
  likedIds(): Promise<string[]>;
  likeSong(id: string, like: boolean): Promise<void>;
  userPlaylists(): Promise<UserPlaylist[]>;
  subscribePlaylist(id: string, subscribe: boolean): Promise<void>;
  createPlaylist(name: string, privacy: 'public' | 'private'): Promise<UserPlaylist>;
  deletePlaylist(id: string): Promise<void>;
  renamePlaylist(id: string, name: string): Promise<void>;
  editPlaylistTracks(playlistId: string, trackIds: string[], op: 'add' | 'del'): Promise<void>;
}

/** Top-of-results highlight when the keyword clearly names an artist/album/playlist. */
export interface BestMatch {
  artist?: CatalogArtist;
  album?: CatalogAlbum;
  playlist?: CatalogPlaylist;
}
