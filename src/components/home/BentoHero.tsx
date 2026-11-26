'use client';

import { motion } from 'framer-motion';
import { Pause, Play, Radio } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { SkeletonBlock } from '@/components/common/AsyncState';
import { Cover } from '@/components/common/Cover';
import { useNavigation } from '@/components/layout/navigation';
import { Equalizer } from '@/components/music/Equalizer';
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

type PillTone = 'daily' | 'favorites' | 'new' | 'radar' | 'recent';
type TileShape = 'poster' | 'stadium' | 'wave' | 'crate';

type BentoTileItem = {
  key: string;
  shape: TileShape;
  pill: string;
  tone: PillTone;
  dayStamp?: string;
  title: string;
  subtitle: string;
  cover?: string;
  seed: string;
  stackCovers?: Array<{ cover?: string; seed: string }>;
  playDisabled?: boolean;
  onOpen: () => void;
  onPlay: () => void;
};

function cardPill(title: string, subtitle?: string): { pill: string; tone: PillTone; isDaily?: boolean } {
  if (title === '每日30首') return { pill: 'Daily 30', tone: 'daily', isDaily: true };
  if (title.includes('每日推荐')) return { pill: 'Daily Mix', tone: 'daily', isDaily: true };
  if (title === '百万收藏') return { pill: 'Favorites', tone: 'favorites' };
  if (title === '新歌推荐') return { pill: 'New Songs', tone: 'new' };
  if (subtitle === '雷达歌单') return { pill: 'Radar', tone: 'radar' };
  if (subtitle === '专属场景歌单') return { pill: 'For You', tone: 'radar' };
  return { pill: subtitle || '精选', tone: 'radar' };
}

export function BentoSkeleton() {
  return (
    <div className={styles.bento} aria-hidden>
      <SkeletonBlock className={cn(styles.skeleton, styles.deckSlot)} />
      {Array.from({ length: 4 }, (_, index) => (
        <SkeletonBlock key={index} className={cn(styles.skeleton, styles.tileSlot)} />
      ))}
    </div>
  );
}

/**
 * Non-rectangular, frame-breaking editorial Bento collage (seated calmly on the sheet,
 * zero floating box shadows):
 * - Left (6 cols × 2 rows): Out-of-Bounds Vinyl & Sleeve breaking the left frame +
 *   Top-Right Concave Inverted-Corner Notch cradling the station pill + 3 tracks.
 * - Right 4 distinct silhouettes:
 *   1) `poster`: Full-bleed die-cut cover poster with concave corner play bite (Daily 30)
 *   2) `stadium`: Semicircular vinyl-contour capsule (`999px` left arc) + peeking disc
 *   3) `wave`: Full-height diagonal S-curve blended artwork + concave corner play bite
 *   4) `crate`: Low-slung record tray with 3 album sleeves breaking upward out of the top edge
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
  const recent = useRecentPlays();
  const greeting = useMemo(() => radioGreeting(new Date().getHours()), []);
  const todayNum = useMemo(() => String(new Date().getDate()).padStart(2, '0'), []);

  const radioCard = cards?.find((c): c is Extract<HomeRecommendationCard, { kind: 'radio' }> => c.kind === 'radio');
  const radioTracks = useMemo(() => (radioCard?.tracks ?? []).map(toTrack), [radioCard]);
  const chartTracks = useMemo(() => charts.flatMap(c => c.entries.map(e => toTrack(e.track))), [charts]);

  const deckPool = useMemo(() => {
    if (radioTracks.length) return radioTracks;
    if (tracks.length) return tracks;
    return chartTracks;
  }, [radioTracks, tracks, chartTracks]);

  const radio = useMemo(() => {
    if (radioCard?.tracks.length) return radioPlayback(radioCard.tracks, player);
    if (!deckPool.length) return null;
    const active = deckPool.find(t => t.id === player.track.id);
    const current = active ?? deckPool[0];
    const playing = Boolean((player.radioSource === source || Boolean(active)) && player.playing);
    return {
      track: current,
      playing,
      toggle: () => {
        if (player.radioSource === source || active) player.togglePlay();
        else player.playRadio(deckPool);
      },
    };
  }, [radioCard, deckPool, player, source]);

  const deckRows = useMemo(() => {
    if (!deckPool.length) return [];
    const activeIdx = deckPool.findIndex(item => item.id === player.track.id);
    if (activeIdx <= 0) return deckPool.slice(0, 3);
    const start = Math.min(activeIdx, Math.max(0, deckPool.length - 3));
    return deckPool.slice(start, start + 3);
  }, [deckPool, player.track.id]);

  const radioTitle = radioCard ? (source === 'qq' ? '猜你喜欢' : radioCard.title) : '随心漫游';
  const radioCover = radio?.track.cover ?? radioCard?.cover ?? playlists[0]?.cover;
  const radioSeed = radio?.track.id ?? `${source}:radio`;
  const radioTint = useCoverTint(radioCover, radioSeed);

  const tiles = useMemo<BentoTileItem[]>(() => {
    const raw: Omit<BentoTileItem, 'shape'>[] = [];
    const upstreamCards = (cards ?? []).filter(
      (c): c is Exclude<HomeRecommendationCard, { kind: 'radio' | 'companion' }> => c.kind === 'daily' || c.kind === 'playlist',
    );

    for (const card of upstreamCards.slice(0, 3)) {
      const playlist = card.kind === 'playlist' ? { id: card.id, source, name: card.title, cover: card.cover } : undefined;
      const isDaily = card.kind === 'daily' || (source === 'qq' && card.title === '每日30首');
      const meta = cardPill(card.title, card.subtitle);
      const sub = source === 'qq'
        ? (card.subtitle || '每日专属精选')
        : (card.subtitle || (tracks.length ? `共 ${tracks.length} 首` : '为你推荐'));

      raw.push({
        key: playlist?.id ?? `card:${card.title}`,
        pill: meta.pill,
        tone: meta.tone,
        dayStamp: meta.isDaily ? todayNum : undefined,
        title: card.title,
        subtitle: sub,
        cover: card.cover ?? (isDaily ? tracks[0]?.cover : undefined),
        seed: `${source}:${playlist?.id ?? card.title}`,
        playDisabled: card.kind === 'daily' && !tracks.length,
        onOpen: () => {
          if (isDaily) navigate({ name: 'daily-songs' });
          else if (playlist) navigate({ name: 'playlist', id: playlist.id, source, title: card.title });
        },
        onPlay: () => {
          if (isDaily && tracks.length) player.play(tracks[0], tracks);
          else if (playlist) playPlaylist(playlist);
        },
      });
    }

    if (!raw.length && dailyMode) {
      raw.push({
        key: 'daily-direct',
        pill: 'Daily Mix',
        tone: 'daily',
        dayStamp: todayNum,
        title: dailySongsTitle(source),
        subtitle: tracks[0] ? `${tracks[0].title} - ${tracks[0].artist}` : `今日推荐 · ${tracks.length} 首`,
        cover: tracks[0]?.cover ?? playlists[0]?.cover,
        seed: `${source}:daily`,
        playDisabled: !tracks.length,
        onOpen: () => navigate({ name: 'daily-songs' }),
        onPlay: () => { if (tracks[0]) player.play(tracks[0], tracks); },
      });
    }

    const recentTracks = (recent ?? []).map(r => r.track);
    let chartIdx = 0;
    while (raw.length < 3 && chartIdx < charts.length) {
      const chart = charts[chartIdx++];
      const cTracks = chart.entries.map(e => toTrack(e.track));
      if (!cTracks.length) continue;
      raw.push({
        key: `chart:${chart.id}`,
        pill: 'Top Chart',
        tone: chartIdx === 1 ? 'favorites' : 'new',
        title: chart.name,
        subtitle: `1. ${cTracks[0].title} - ${cTracks[0].artist}`,
        cover: cTracks[0].cover ?? chart.cover,
        seed: `${source}:chart:${chart.id}`,
        onOpen: () => navigate({ name: 'playlist', id: chart.id, source, title: chart.name }),
        onPlay: () => player.play(cTracks[0], cTracks),
      });
    }

    let plIdx = 0;
    while (raw.length < 3 && plIdx < playlists.length) {
      const pl = playlists[plIdx++];
      if (raw.some(item => item.key === pl.id)) continue;
      raw.push({
        key: pl.id,
        pill: pl.tag || 'Pick',
        tone: raw.length % 2 === 0 ? 'favorites' : 'new',
        title: pl.name,
        subtitle: pl.trackCount ? `${pl.trackCount} 首精选` : (pl.creator || '精选歌单'),
        cover: pl.cover,
        seed: `${source}:${pl.id}`,
        onOpen: () => navigate({ name: 'playlist', id: pl.id, source, title: pl.name }),
        onPlay: () => playPlaylist(pl),
      });
    }

    // 4th slot is always the Out-of-Bounds Record Crate (Recent Plays if available, else Top Chart / Playlists).
    if (recentTracks.length > 0) {
      raw.push({
        key: 'recent-plays',
        pill: 'Recent',
        tone: 'recent',
        title: '最近常听',
        subtitle: `${recentTracks[0].title} · ${recentTracks.length} 首`,
        cover: recentTracks[0].cover,
        seed: recentTracks[0].coverSeed,
        stackCovers: recentTracks.slice(0, 3).map(t => ({ cover: t.cover, seed: t.coverSeed })),
        onOpen: () => navigate({ name: 'recent' }),
        onPlay: () => player.play(recentTracks[0], recentTracks),
      });
    } else {
      const fallbackCovers = playlists.slice(0, 3).map(p => ({ cover: p.cover, seed: `${source}:${p.id}` }));
      raw.push({
        key: 'discover-crate',
        pill: 'Crate',
        tone: 'recent',
        title: '歌单淘碟',
        subtitle: playlists[0]?.name || '探索精选曲目',
        cover: playlists[0]?.cover,
        seed: `${source}:crate`,
        stackCovers: fallbackCovers,
        onOpen: () => navigate({ name: 'discover' }),
        onPlay: () => { if (playlists[0]) playPlaylist(playlists[0]); },
      });
    }

    const shapes: readonly TileShape[] = ['poster', 'stadium', 'wave', 'crate'];
    return raw.slice(0, 4).map((item, idx) => ({ ...item, shape: shapes[idx] ?? 'wave' }));
  }, [cards, dailyMode, source, tracks, playlists, charts, recent, todayNum, navigate, player, playPlaylist]);

  return (
    <section className={styles.bento} aria-label="今日为你推荐">
      {/* Left 6 cols × 2 rows: Out-of-Bounds Turntable + Top-Right Concave Cutout Deck */}
      <article
        className={cn(styles.deckWrap, styles.deckSlot)}
        style={{ '--deck-tint': radioTint } as CSSProperties}
      >
        {/* Concave cutout surface: starts indented on the left so the turntable breaks out-of-bounds */}
        <div className={styles.deckSurface} aria-hidden />

        {/* Detached pill nestled right inside the top-right concave notch */}
        <button
          type="button"
          className={cn(styles.notchAction, radio?.playing && styles.notchActionPlaying)}
          disabled={!radio}
          onClick={() => radio?.toggle()}
        >
          <Radio size={12} strokeWidth={1.9} />
          <span>{radio?.playing ? '漫游中' : '播放电台'}</span>
        </button>

        {/* Out-of-Bounds Vinyl & Sleeve breaking past the left boundary */}
        <button
          type="button"
          className={styles.turntableStage}
          aria-pressed={radio?.playing}
          disabled={!radio}
          aria-label={radio ? `${radio.playing ? '暂停' : '播放'}${radioTitle}` : radioTitle}
          onClick={() => radio?.toggle()}
        >
          <span className={styles.albumJacket}>
            <Cover seed={radioSeed} src={radioCover} className={styles.jacketCover} />
            <span className={styles.jacketSpine} aria-hidden />
          </span>

          <span className={cn(styles.platterWrap, radio?.playing && styles.platterActive)}>
            <span className={cn(styles.vinylDisc, radio?.playing && styles.vinylSpinning)}>
              <span className={styles.vinylSheen} aria-hidden />
              <Cover seed={radioSeed} src={radioCover} radius={999} className={styles.vinylLabel} />
              <span className={styles.spindleDot} aria-hidden />
            </span>
            <span className={styles.vinylFab}>
              {radio?.playing
                ? <Pause size={14} fill="currentColor" strokeWidth={0} />
                : <Play size={14} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1.5 }} />}
            </span>
          </span>

          <svg
            viewBox="0 0 48 120"
            className={cn(styles.tonearm, radio?.playing && styles.tonearmPlaying)}
            aria-hidden
          >
            <circle cx="34" cy="16" r="8.5" className={styles.tonearmBase} />
            <circle cx="34" cy="16" r="3.8" className={styles.tonearmPivot} />
            <path d="M34 16 L31 74 L17 98" className={styles.tonearmRod} />
            <rect x="12" y="94" width="8" height="13" rx="2" transform="rotate(28 16 100)" className={styles.tonearmHead} />
          </svg>
        </button>

        <div className={styles.deckBody}>
          <header className={styles.deckHeading}>
            <span className={styles.deckGreeting}>{greeting}</span>
            <h3>{radioTitle}</h3>
          </header>

          <ol className={styles.deckTracks}>
            {deckRows.map((item, idx) => {
              const current = player.track.id === item.id;
              return (
                <li key={`${item.id}:${idx}`}>
                  <button
                    type="button"
                    className={cn(styles.deckRow, current && styles.deckRowCurrent)}
                    onClick={() => {
                      if (radioCard?.tracks.length) player.playRadio([item, ...deckPool.filter(t => t.id !== item.id)]);
                      else player.play(item, deckPool);
                    }}
                  >
                    <span className={styles.deckRank}>
                      {current && player.playing ? <Equalizer /> : idx + 1}
                    </span>
                    <span className={styles.deckSong}>
                      <strong>{item.title}</strong>
                      <span> — {item.artist}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </article>

      {/* Right 4 Distinct Non-Rectangular / Frame-Breaking Forms */}
      {tiles.map(tile => {
        const noPlay = tile.playDisabled ? true : undefined;
        if (tile.shape === 'poster') {
          return (
            <article key={tile.key} className={cn(styles.tileSlot, styles.posterWrap)} data-no-play={noPlay}>
              <button type="button" className={styles.posterSurface} onClick={tile.onOpen} aria-label={`打开：${tile.title}`}>
                <Cover seed={tile.seed} src={tile.cover} className={styles.posterArt} />
                <span className={styles.posterVeil} aria-hidden />
                <span className={styles.posterContent}>
                  <span className={styles.posterBadgeRow}>
                    <span className={cn(styles.pill, styles[`pill-${tile.tone}`])}>{tile.pill}</span>
                    {tile.dayStamp && <em className={styles.posterDay}>{tile.dayStamp}日</em>}
                  </span>
                  <strong className={styles.posterTitle}>{tile.title}</strong>
                  <small className={styles.posterSub}>{tile.subtitle}</small>
                </span>
              </button>
              {!tile.playDisabled && (
                <motion.button
                  type="button"
                  className={styles.cutoutPlay}
                  onClick={tile.onPlay}
                  aria-label={`播放：${tile.title}`}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                >
                  <Play size={15} strokeWidth={0} fill="currentColor" style={{ marginLeft: 1.5 }} />
                </motion.button>
              )}
            </article>
          );
        }

        if (tile.shape === 'stadium') {
          return (
            <article key={tile.key} className={cn(styles.tileSlot, styles.stadiumWrap)} data-no-play={noPlay}>
              <div className={styles.stadiumSurface}>
                <button type="button" className={styles.stadiumDiscHead} onClick={tile.onOpen} aria-label={`打开：${tile.title}`}>
                  <span className={styles.stadiumPeekRim} aria-hidden />
                  <span className={styles.stadiumRecord}>
                    <Cover seed={tile.seed} src={tile.cover} radius={999} className={styles.stadiumCover} />
                  </span>
                </button>
                <button type="button" className={styles.tileCopy} onClick={tile.onOpen}>
                  <span className={cn(styles.pill, styles[`pill-${tile.tone}`])}>{tile.pill}</span>
                  <strong className={styles.tileTitle} title={tile.title}>{tile.title}</strong>
                  <span className={styles.tileSub} title={tile.subtitle}>{tile.subtitle}</span>
                </button>
              </div>
              {!tile.playDisabled && (
                <motion.button
                  type="button"
                  className={styles.cutoutPlay}
                  onClick={tile.onPlay}
                  aria-label={`播放：${tile.title}`}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                >
                  <Play size={15} strokeWidth={0} fill="currentColor" style={{ marginLeft: 1.5 }} />
                </motion.button>
              )}
            </article>
          );
        }

        if (tile.shape === 'wave') {
          return (
            <article key={tile.key} className={cn(styles.tileSlot, styles.waveWrap)} data-no-play={noPlay}>
              <button type="button" className={styles.waveSurface} onClick={tile.onOpen} aria-label={`打开：${tile.title}`}>
                <span className={styles.waveArtSlice} aria-hidden>
                  <Cover seed={tile.seed} src={tile.cover} className={styles.waveCover} />
                </span>
                <span className={styles.waveCopy}>
                  <span className={cn(styles.pill, styles[`pill-${tile.tone}`])}>{tile.pill}</span>
                  <strong className={styles.tileTitle} title={tile.title}>{tile.title}</strong>
                  <span className={styles.tileSub} title={tile.subtitle}>{tile.subtitle}</span>
                </span>
              </button>
              {!tile.playDisabled && (
                <motion.button
                  type="button"
                  className={styles.cutoutPlay}
                  onClick={tile.onPlay}
                  aria-label={`播放：${tile.title}`}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                >
                  <Play size={15} strokeWidth={0} fill="currentColor" style={{ marginLeft: 1.5 }} />
                </motion.button>
              )}
            </article>
          );
        }

        // 'crate': Out-of-bounds record crate where 3 angled covers break upward past the top edge
        const covers = tile.stackCovers ?? [{ cover: tile.cover, seed: tile.seed }];
        return (
          <article key={tile.key} className={cn(styles.tileSlot, styles.crateWrap)} data-no-play={noPlay}>
            <div className={styles.crateTray} aria-hidden />
            <button type="button" className={styles.crateHit} onClick={tile.onOpen} aria-label={`打开：${tile.title}`}>
              <span className={styles.crateFan} aria-hidden>
                {covers[2] && (
                  <span className={cn(styles.crateSleeve, styles.crateThird)}>
                    <Cover seed={covers[2].seed} src={covers[2].cover} className={styles.crateImg} />
                  </span>
                )}
                {covers[1] && (
                  <span className={cn(styles.crateSleeve, styles.crateSecond)}>
                    <Cover seed={covers[1].seed} src={covers[1].cover} className={styles.crateImg} />
                  </span>
                )}
                {covers[0] && (
                  <span className={cn(styles.crateSleeve, styles.crateFirst)}>
                    <Cover seed={covers[0].seed} src={covers[0].cover} className={styles.crateImg} />
                  </span>
                )}
              </span>
              <span className={styles.crateCopy}>
                <span className={cn(styles.pill, styles[`pill-${tile.tone}`])}>{tile.pill}</span>
                <strong className={styles.tileTitle} title={tile.title}>{tile.title}</strong>
                <span className={styles.tileSub} title={tile.subtitle}>{tile.subtitle}</span>
              </span>
            </button>
            {!tile.playDisabled && (
              <motion.button
                type="button"
                className={styles.cutoutPlay}
                onClick={tile.onPlay}
                aria-label={`播放：${tile.title}`}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
              >
                <Play size={15} strokeWidth={0} fill="currentColor" style={{ marginLeft: 1.5 }} />
              </motion.button>
            )}
          </article>
        );
      })}
    </section>
  );
}
