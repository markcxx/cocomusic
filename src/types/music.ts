export type Trend = 'up' | 'down' | 'same' | 'new';

/** A track as the player sees it. */
export interface Track {
  /** `netease:<id>` for catalog songs, `local:<libraryId>` for files on this machine. */
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  /** Seconds. */
  duration?: number;
  /** Platform song id; drives likes, comments, online lyrics. Downloads keep it too. */
  songId?: string;
  /** Platform of `songId` (default netease for tracks saved by older versions). */
  source?: 'netease' | 'qq' | 'kugou';
  /** Library id of a local file; when set, playback streams the file instead of the network. */
  localId?: string;
  /** Local file is a downloaded preview clip (its own .lrc only; no online lyrics fallback). */
  trialClip?: boolean;
  /** Real artwork URL when known; otherwise the seeded placeholder is drawn. */
  cover?: string;
  /** Seed for the placeholder artwork (and its loading backdrop). */
  coverSeed: string;
}

/** Whether a track has anything to play (catalog stream or local file). */
export const isPlayable = (track: Track) => Boolean(track.songId || track.localId);
