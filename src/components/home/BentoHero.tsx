'use client';

import { motion } from 'framer-motion';
import { Pause, Play, Radio } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { useNavigation } from '@/components/layout/navigation';
import { Equalizer } from '@/components/music/Equalizer';
import { PlaylistCover } from '@/components/music/PlaylistCard';
import { usePlayer } from '@/components/player/player-store';
import { useCoverTint } from '@/components/player/visualizer/cover-tint';
import { cn } from '@/lib/cn';
import { useRecentPlays } from '@/lib/recent-plays';
import { toTrack } from '@/lib/to-track';
import type { CatalogChart, CatalogPlaylist, CatalogSource, HomeRecommendationCard } from '@/server/music/types';
import type { Track } from '@/types/music';
import { dailySongsTitle } from './DailySongs';
import { radioPlayback } from './radio-playback';
import styles from './BentoHero.module.css';

function radioGreeting(hour: number) {
  if (hour < 5 || hour >= 22) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '听听歌';
  if (hour < 14) return '午休时间';
  if (hour < 18) return '下午茶';
  return '放松吧';
}

type BadgeStyle = 'daily' | 'favorites' | 'new' | 'radar';

function resolveBadge(title: string, subtitle?: string): { code?: string; label: string; tone: BadgeStyle } | null {
  if (title === '每日30首') return { code: 'Daily 30', label: '每日30首', tone: 'daily' };
  if (title.includes('每日推荐')) return { code: `${new Date().getDate()}日`, label: '每日推荐', tone: 'daily' };
  if (title === '百万收藏') return { code: 'Favorites', label: '百万收藏', tone: 'favorites' };
  if (title === '新歌推荐') return { code: 'New Songs', label: '新歌推荐', tone: 'new' };
  if (subtitle === '雷达歌单') return { code: 'Radar', label: '私人雷达', tone: 'radar' };
  if (subtitle === '专属场景歌单') return { code: 'For You', label: '专属场景', tone: 'radar' };
  return null;
}

export function BentoSkeleton() {
  return (
    <div className={styles.shelf} aria-hidden>
      <div className={styles.span2}><SkeletonBlock className={styles.skeletonWide} /><SkeletonBlock className={styles.skeletonLine} /></div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={styles.unit}><SkeletonBlock className={styles.skeletonSquare} /><SkeletonBlock className={styles.skeletonLine} /></div>
      ))}
    </div>
  );
}

/** Staggered 3-cover square card (1 col) for Recent Plays, matching ChartCard's tactile cover stack. */
function RecentStackCard({ fallbackChart }: { fallbackChart?: CatalogChart }) {
  const { navigate } = useNavigation();
  const player = usePlayer();
  const recent = useRecentPlays();
  const recentTracks = useMemo(() => (recent ?? []).map(item => item.track), [recent]);
  const chartTracks = useMemo(() => (fallbackChart?.entries ?? []).map(entry => toTrack(entry.track)), [fallbackChart]);

  const hasRecent = recentTracks.length > 0;
  const queue = hasRecent ? recentTracks : chartTracks;
  const [first, second, third] = queue;

  const open = () => {
    if (hasRecent) navigate({ name: 'recent' });
    else if (fallbackChart) navigate({ name: 'playlist', id: fallbackChart.id, title: fallbackChart.name });
    else navigate({ name: 'charts' });
  };

  const play = () => {
    if (first) player.play(first, queue);
    else open();
  };

  const caption = first ? `${first.title} - ${first.artist}` : (hasRecent ? '继续上次收听' : (fallbackChart?.name ?? '热门排行榜'));
  const meta = hasRecent ? `最近播放 · ${recentTracks.length} 首` : (fallbackChart?.name ?? '热门趋势');

  return (
    <div className={styles.card}>
      <div className={styles.stackSurface}>
        <button type="button" className={styles.stackOpen} onClick={open} aria-label={`打开：${hasRecent ? '最近播放' : meta}`}>
          <div className={styles.stackArt}>
            {third && <Cover seed={third.coverSeed} src={third.cover} className={cn(styles.stackLayer, styles.stackThird)} />}
            {second && <Cover seed={second.coverSeed} src={second.cover} className={cn(styles.stackLayer, styles.stackSecond)} />}
            <span className={cn(styles.stackLayer, styles.stackFirst)}>
              <Cover seed={first?.coverSeed ?? 'recent'} src={first?.cover ?? fallbackChart?.cover} className={styles.stackCover} />
            </span>
          </div>
          <span className={styles.coverScrim} aria-hidden />
          <span className={cn(styles.coverBadge, styles['tone-radar'])}>
            <strong>{hasRecent ? '最近常听' : '热歌精选'}</strong>
          </span>
        </button>
        <motion.button
          type="button"
          className={styles.floatingPlay}
          onClick={play}
          disabled={!first}
          aria-label={hasRecent ? '播放最近常听' : '播放榜单'}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Play size={20} strokeWidth={0} fill="currentColor" />
        </motion.button>
      </div>
      <button type="button" className={styles.caption} onClick={open} title={caption}>{caption}</button>
      <span className={styles.meta}>{meta}</span>
    </div>
  );
}

/** Calm ChartCard-style track list card (2 or 3 cols) used when the platform has no extra shelf cards. */
function QuickTracksCard({ span, title, tracks, onMore }: {
  span: 2 | 3;
  title: string;
  tracks: Track[];
  onMore: () => void;
}) {
  const player = usePlayer();
  const rows = tracks.slice(0, 3);
  const first = rows[0];

  return (
    <div className={cn(styles.card, span === 3 ? styles.span3 : styles.span2)}>
      <div className={styles.tracksBox}>
        <ol className={styles.trackRows}>
          {rows.map((track, idx) => {
            const current = player.track.id === track.id;
            return (
              <li key={track.id}>
                <button
                  type="button"
                  className={cn(styles.trackRow, current && styles.trackRowCurrent)}
                  onClick={() => player.play(track, tracks)}
                >
                  <span className={styles.trackRank}>
                    {current && player.playing ? <Equalizer /> : String(idx + 1).padStart(2, '0')}
                  </span>
                  <Cover seed={track.coverSeed} src={track.cover} size={34} radius={6} />
                  <span className={styles.trackNames}>
                    <strong>{track.title}</strong>
                    <span> — {track.artist}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <button type="button" className={styles.caption} onClick={onMore} title={first ? `${first.title} - ${first.artist}` : title}>
        {first ? `${first.title} 等 ${tracks.length} 首精选` : title}
      </button>
      <span className={styles.meta}>{title}</span>
    </div>
  );
}

/**
 * 6-column top shelf aligned 1:1 with the 推荐歌单 grid below it:
 * - Columns 1–2: Radio card (vinyl record + greeting, calm native --accent-tint surface)
 * - Column 3+: Daily 30 / 每日推荐 & personal playlist cards (square 1-col cards with bold, high-contrast badges)
 * - Remaining slot(s): QuickTracksCard and/or RecentStackCard so all 6 columns are always filled cleanly.
 */
export function BentoHero({
  source,
  dailyMode,
  cards,
  tracks,
  playlists,
  charts,
  playPlaylist,
}: {
  source: CatalogSource;
  dailyMode: boolean;
  cards?: HomeRecommendationCard[];
  tracks: Track[];
  playlists: CatalogPlaylist[];
  charts: CatalogChart[];
  playPlaylist: (playlist: CatalogPlaylist) => void;
}) {
  const { navigate } = useNavigation();
  const player = usePlayer();
  const greeting = useMemo(() => radioGreeting(new Date().getHours()), []);
  const todayNum = useMemo(() => String(new Date().getDate()).padStart(2, '0'), []);

  const radioCard = cards?.find((c): c is Extract<HomeRecommendationCard, { kind: 'radio' }> => c.kind === 'radio');
  const fallbackPool = useMemo(() => {
    if (tracks.length) return tracks;
    return charts.flatMap(c => c.entries.map(e => toTrack(e.track)));
  }, [tracks, charts]);

  const radio = useMemo(() => {
    if (radioCard?.tracks.length) return radioPlayback(radioCard.tracks, player);
    if (!fallbackPool.length) return null;
    const activeInPool = fallbackPool.find(t => t.id === player.track.id);
    const current = activeInPool ?? fallbackPool[0];
    const playing = Boolean(player.radioSource === source && player.playing);
    return {
      track: current,
      playing,
      toggle: () => {
        if (player.radioSource === source) player.togglePlay();
        else player.playRadio(fallbackPool);
      },
    };
  }, [radioCard, fallbackPool, player, source]);

  // Square 1-col cards from upstream (excluding radio and unplayable companion cards), capped to 4 slots (since Radio takes 2 of 6).
  const squareCards = useMemo(() => {
    const raw = (cards ?? []).filter((c): c is Exclude<HomeRecommendationCard, { kind: 'radio' | 'companion' }> => c.kind === 'daily' || c.kind === 'playlist');
    if (raw.length > 0) return raw.slice(0, 4);
    if (dailyMode) {
      return [{
        kind: 'daily' as const,
        title: dailySongsTitle(source),
        cover: tracks[0]?.cover ?? playlists[0]?.cover,
        subtitle: tracks.length ? `今日推荐 · ${tracks.length} 首` : '每日更新',
      }];
    }
    return [];
  }, [cards, dailyMode, source, tracks, playlists]);

  // Used columns: Radio (2) + squareCards.length. Fill remaining columns to reach exact 6!
  const usedCols = 2 + squareCards.length;
  const remainingCols = Math.max(0, 6 - usedCols);
  // If 2 or 3 cols remain and we have tracks, show QuickTracksCard (span 2 or 3) + RecentStackCard if space allows.
  const tracksSpan: 0 | 2 | 3 = fallbackPool.length >= 3
    ? (remainingCols >= 4 ? 3 : remainingCols === 3 ? 2 : remainingCols === 2 ? 2 : 0)
    : 0;
  const showRecentSlot = remainingCols - tracksSpan >= 1;

  const radioTitle = radioCard ? (source === 'qq' ? '猜你喜欢' : radioCard.title) : '随心电台';
  const radioCover = radio?.track.cover ?? radioCard?.cover ?? playlists[0]?.cover;
  const radioSeed = radio?.track.id ?? `${source}:radio`;
  const radioTint = useCoverTint(radioCover, radioSeed);
  const radioCaption = radio ? `${radio.track.title} - ${radio.track.artist}` : radioTitle;

  return (
    <section className={styles.shelf} aria-label="今日为你推荐">
      {/* Columns 1–2: Spinning Vinyl Album Player Card */}
      <div className={cn(styles.card, styles.span2)}>
        <button
          type="button"
          className={styles.radioHero}
          style={{ '--radio-tint': radioTint } as CSSProperties}
          aria-pressed={radio?.playing}
          disabled={!radio}
          aria-label={radio ? `${radio.playing ? '暂停' : '播放'}${radioTitle}，${radioCaption}` : radioTitle}
          onClick={() => radio?.toggle()}
        >
          <span className={styles.radioInfo}>
            <span className={styles.radioKicker}>
              <Radio size={13} strokeWidth={1.7} />
              <span>{greeting} · {radioTitle}</span>
            </span>
            <strong className={styles.radioSong}>{radio ? radio.track.title : radioTitle}</strong>
            <small className={styles.radioArtist}>
              {radio ? radio.track.artist : '个性化不间断推荐'}
            </small>
          </span>

          <span className={styles.turntable} aria-hidden>
            <span className={cn(styles.vinylDisc, radio?.playing && styles.vinylSpinning)}>
              <Cover seed={radioSeed} src={radioCover} radius={999} className={styles.vinylArt} />
            </span>
            <span className={styles.vinylFab}>
              {radio?.playing
                ? <Pause size={16} fill="currentColor" strokeWidth={0} />
                : <Play size={16} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1.5 }} />}
            </span>
          </span>
        </button>
        <span className={styles.caption} title={radioCaption}>{radioCaption}</span>
        <span className={styles.meta}>{radioCard?.title ?? '电台漫游'}</span>
      </div>

      {/* Square 1-col Cards: Daily 30 / 每日推荐 / 百万收藏 / 新歌推荐 / 雷达歌单 */}
      {squareCards.map(card => {
        const playlist = card.kind === 'playlist' ? { id: card.id, source, name: card.title, cover: card.cover } : undefined;
        const isDaily = card.kind === 'daily' || (source === 'qq' && card.title === '每日30首');
        const open = () => {
          if (isDaily) navigate({ name: 'daily-songs' });
          else if (playlist) navigate({ name: 'playlist', id: playlist.id, source, title: card.title });
        };
        const play = () => {
          if (isDaily && tracks.length) player.play(tracks[0], tracks);
          else if (playlist) playPlaylist(playlist);
          else if (tracks.length) player.play(tracks[0], tracks);
        };
        const badge = resolveBadge(card.title, card.subtitle);
        const caption = source === 'qq' ? (card.subtitle || card.title) : card.title;
        const meta = source === 'qq' && card.subtitle ? card.title : card.subtitle;
        const key = playlist?.id ?? 'daily';

        return (
          <div className={styles.card} key={key}>
            <PlaylistCover
              name={card.title}
              seed={`${source}:${key}`}
              cover={card.cover ?? (isDaily ? tracks[0]?.cover : undefined)}
              onOpen={open}
              onPlay={play}
              playDisabled={card.kind === 'daily' && !tracks.length}
            >
              {badge && (
                <>
                  <span className={styles.coverScrim} aria-hidden />
                  {isDaily && <span className={styles.dayCorner} aria-hidden>{todayNum}</span>}
                  <span aria-hidden className={cn(styles.coverBadge, styles[`tone-${badge.tone}`])}>
                    {badge.code && <em>{badge.code}</em>}
                    <strong>{badge.label}</strong>
                  </span>
                </>
              )}
            </PlaylistCover>
            <button className={styles.caption} type="button" onClick={open} title={caption}>{caption}</button>
            {meta && <span className={styles.meta}>{meta}</span>}
          </div>
        );
      })}

      {/* Adaptive Track List Card (when platform has fewer square cards, e.g. Kugou or Guest) */}
      {tracksSpan !== 0 && (
        <QuickTracksCard
          span={tracksSpan}
          title={dailyMode ? '今日推荐速听' : '新歌速听'}
          tracks={fallbackPool}
          onMore={() => (dailyMode ? navigate({ name: 'daily-songs' }) : fallbackPool[0] && player.play(fallbackPool[0], fallbackPool))}
        />
      )}

      {/* Column 6 filler: Tactile 3-cover Recent Plays Stack */}
      {showRecentSlot && <RecentStackCard fallbackChart={charts[0]} />}
    </section>
  );
}
