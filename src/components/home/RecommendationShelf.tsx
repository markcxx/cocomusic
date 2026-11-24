'use client';

import { Pause, Play } from 'lucide-react';
import { Cover } from '@/components/common/Cover';
import { useNavigation } from '@/components/layout/navigation';
import { PlaylistCover } from '@/components/music/PlaylistCard';
import { usePlayer } from '@/components/player/player-store';
import { radioPlayback } from './radio-playback';
import type { CatalogPlaylist, CatalogSource, HomeRecommendationCard } from '@/server/music/types';
import type { Track } from '@/types/music';
import styles from './RecommendationShelf.module.css';

const ribbons: Record<string, string> = { '每日30首': 'Daily 30', '百万收藏': 'Favorites', '新歌推荐': 'New Songs' };

function radioGreeting(hour: number) {
  if (hour < 5 || hour >= 22) return '夜深了';
  if (hour < 8) return '早上好';
  if (hour < 12) return '听听歌';
  if (hour < 14) return '午休时间';
  return hour < 18 ? '下午茶' : '放松吧';
}

export function RecommendationShelf({ source, cards, dailyTracks, playPlaylist }: {
  source: CatalogSource;
  cards: HomeRecommendationCard[];
  dailyTracks: Track[];
  playPlaylist: (playlist: CatalogPlaylist) => void;
}) {
  const { navigate } = useNavigation();
  const player = usePlayer();
  return (
    <section className={styles.shelf} aria-label="今日为你推荐">
      {cards.map(card => {
        if (card.kind === 'radio') {
          const radio = radioPlayback(card.tracks, player);
          if (!radio) return null;
          const { track, playing, toggle } = radio;
          const Icon = playing ? Pause : Play;
          const caption = `${track.title} - ${track.artist}`;
          return (
            <div className={styles.radioCard} key="radio">
              <button type="button" className={styles.hero} aria-pressed={playing}
                aria-label={`${playing ? '暂停' : '播放'}${card.title}，${caption}`} onClick={toggle}>
                <span className={styles.heroText}>
                  <strong>{radioGreeting(new Date().getHours())}</strong>
                  <span>{source === 'qq' ? '猜你喜欢' : card.title}</span>
                  <span className={styles.radioPlay}><Icon size={14} fill="currentColor" /></span>
                </span>
                <span className={styles.record}><Cover seed={track.id} src={track.cover ?? card.cover} className={styles.album} /></span>
              </button>
              <span className={styles.caption} title={caption}>{caption}</span>
              <span className={styles.meta}>{card.title}</span>
            </div>
          );
        }
        if (card.kind === 'companion') {
          return (
            <div className={styles.card} key="companion">
              <Cover seed={card.title} src={card.cover} className={styles.art} />
              <span className={styles.caption} title={card.title}>{card.title}</span>
              <span className={styles.meta}>需在 QQ 音乐客户端收听</span>
            </div>
          );
        }
        const playlist = card.kind === 'playlist' ? { id: card.id, source, name: card.title, cover: card.cover } : undefined;
        const daily = card.kind === 'daily' || (source === 'qq' && card.title === '每日30首');
        const open = () => {
          if (daily) navigate({ name: 'daily-songs' });
          else if (playlist) navigate({ name: 'playlist', id: playlist.id, source, title: card.title });
        };
        const play = () => {
          if (playlist) playPlaylist(playlist);
          else if (dailyTracks.length) player.play(dailyTracks[0], dailyTracks);
        };
        const caption = source === 'qq' ? card.subtitle || card.title : card.title;
        const meta = source === 'qq' && card.subtitle ? card.title : card.subtitle;
        const key = playlist?.id ?? 'daily';
        return (
          <div className={styles.card} key={key}>
            <PlaylistCover name={card.title} seed={`${source}:${key}`} cover={card.cover} onOpen={open} onPlay={play}
              playDisabled={card.kind === 'daily' && !dailyTracks.length}>
              {source === 'qq' && ribbons[card.title] && <span aria-hidden className={styles.ribbon} data-name={card.title}>{ribbons[card.title]}</span>}
            </PlaylistCover>
            <button className={styles.caption} type="button" onClick={open} title={caption}>{caption}</button>
            {meta && <span className={styles.meta}>{meta}</span>}
          </div>
        );
      })}
    </section>
  );
}
