export type Trend = 'up' | 'down' | 'same' | 'new';

/** A track as the player sees it. */
export interface Track {
  /** `netease:<id>` for catalog songs, `local:<libraryId>` for files on this machine. */
  id: string;
  title: string;
  artist: string;
  /** Individual artists of a catalog song, for linking. */
  artists?: Array<{ id: string; name: string }>;
  album?: string;
  albumId?: string;
  /** Seconds. */
  duration?: number;
  /** Platform song id; drives likes, comments, online lyrics. Downloads keep it too. */
  songId?: string;
  /** Platform of `songId` (default netease for tracks saved by older versions). */
  source?: 'netease' | 'qq' | 'kugou' | 'kugou-lite';
  /** Library id of a local file; when set, playback streams the file instead of the network. */
  localId?: string;
  /** Catalog song requires a paid membership upstream (informational only). */
  vip?: boolean;
  /** Local file is a downloaded preview clip (its own .lrc only; no online lyrics fallback). */
  trialClip?: boolean;
  /** Real artwork URL when known; otherwise the seeded placeholder is drawn. */
  cover?: string;
  /** Seed for the placeholder artwork (and its loading backdrop). */
  coverSeed: string;
}

/** Whether a track has anything to play (catalog stream or local file). */
export const isPlayable = (track: Track) => Boolean(track.localId || (track.songId && ((track.source !== 'kugou' && track.source !== 'kugou-lite') || /^[0-9a-f]{32}(\.\d{0,20}){0,2}$/i.test(track.songId))));
