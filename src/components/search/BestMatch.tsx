'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Cover } from '@/components/common/Cover';
import { riseItem, staggerList } from '@/components/common/motion';
import { useNavigation } from '@/components/layout/navigation';
import { catalogApi, useCatalog } from '@/lib/catalog-client';
import styles from './BestMatch.module.css';

function MatchCard({ cover, seed, round, kind, title, meta, onClick }: { cover?: string; seed: string; round?: boolean; kind: string; title: string; meta?: string; onClick: () => void }) {
  return (
    <motion.button type="button" className={styles.card} onClick={onClick} variants={riseItem} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
      <Cover seed={seed} src={cover} size={64} radius={round ? 999 : 10} />
      <span className={styles.text}>
        <small>{kind}</small>
        <strong>{title}</strong>
        {meta && <span>{meta}</span>}
      </span>
      <ChevronRight size={18} strokeWidth={1.5} className={styles.chevron} />
    </motion.button>
  );
}

/** "最佳匹配" strip above song results; collapses away when nothing matches. */
export function BestMatch({ keyword }: { keyword: string }) {
  const { navigate } = useNavigation();
  const { data } = useCatalog(signal => catalogApi.bestMatch(keyword, signal), `best:${keyword}`);
  const cards: ReactNode[] = [];
  if (data?.artist) {
    const artist = data.artist;
    cards.push(<MatchCard key="artist" kind="歌手" seed={`a:${artist.id}`} cover={artist.avatar} round title={artist.name} meta={[artist.alias, artist.songCount ? `${artist.songCount} 首歌曲` : ''].filter(Boolean).join(' · ')} onClick={() => navigate({ name: 'artist', id: artist.id, title: artist.name })} />);
  }
  if (data?.album) {
    const album = data.album;
    cards.push(<MatchCard key="album" kind="专辑" seed={`al:${album.id}`} cover={album.cover} title={album.name} meta={album.artist} onClick={() => navigate({ name: 'album', id: album.id, title: album.name })} />);
  }
  if (data?.playlist) {
    const playlist = data.playlist;
    cards.push(<MatchCard key="playlist" kind="歌单" seed={`p:${playlist.id}`} cover={playlist.cover} title={playlist.name} meta={playlist.trackCount ? `${playlist.trackCount} 首` : undefined} onClick={() => navigate({ name: 'playlist', id: playlist.id, title: playlist.name })} />);
  }

  return (
    <AnimatePresence initial={false}>
      {cards.length > 0 && (
        <motion.section className={styles.wrap} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
          <h2 className={styles.heading}>最佳匹配</h2>
          <motion.div className={styles.cards} variants={staggerList} initial="hidden" animate="show">{cards}</motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
