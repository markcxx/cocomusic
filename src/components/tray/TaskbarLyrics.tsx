'use client';

import { Heart, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useSchemeAndAccent } from '@/components/settings/ApplyAppearance';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/cn';
import styles from './TaskbarLyrics.module.css';

/** Uses the same player state as the tray, without a second player or account. */
export function TaskbarLyrics() {
  const [state, setState] = useState<CocoTrayState | null>(null);
  const prefs = useSettings();
  useSchemeAndAccent({ scheme: state?.taskbarDark ? 'dark' : 'light' });
  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const [failedCover, setFailedCover] = useState('');
  const line = state?.lyric || state?.title || 'CoCo Music';
  const progress = state?.lyric ? state.progress : 0;
  useEffect(() => window.coco?.tray.onState(next => { if ('hasTrack' in next) setState(next); }), []);
  useEffect(() => { document.documentElement.dataset.reduceMotion = String(prefs.reduceMotion); }, [prefs.reduceMotion]);
  useLayoutEffect(() => {
    const update = () => {
      const width = text.current?.scrollWidth ?? 0;
      const box = viewport.current?.clientWidth ?? 0;
      setShift(Math.min(Math.max(0, width - box), Math.max(0, width * progress - box * 0.66)));
    };
    update();
    const observer = new ResizeObserver(update);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [line, progress, prefs.taskbarFontSize]);
  const send = (action: string) => window.coco?.tray.action(action);
  const secondary = state?.lyric
    ? prefs.taskbarTranslation && state.lyricTranslation ? state.lyricTranslation : [state.title, state.artist].filter(Boolean).join(' · ')
    : state?.artist || '让音乐陪着你';
  const cover = state?.cover && state.cover !== failedCover ? state.cover : '/images/logo.svg';
  const colors: CSSProperties = {
    '--lyric-size': `${prefs.taskbarFontSize}px`,
    '--taskbar-text': prefs.taskbarCustomColors ? prefs.taskbarTextColor : state?.taskbarDark ? '#bdc2cb' : '#626771',
    '--taskbar-highlight': prefs.taskbarCustomColors ? prefs.taskbarHighlightColor : state?.taskbarDark ? '#75baff' : '#0078d4',
  } as CSSProperties;
  return <div className={styles.capsule} style={colors}>
    <button type="button" className={styles.artwork} title="打开 CoCo Music" aria-label="打开 CoCo Music" onClick={() => send('show')}>
      <img src={cover} alt="" draggable={false} onError={() => setFailedCover(state?.cover ?? '')} />
    </button>
    <div className={styles.content} onDoubleClick={() => send('show')}>
      <div className={styles.controls}>
        <button type="button" aria-label="上一首" title="上一首" disabled={!state?.hasTrack} onClick={() => send('previous')}><SkipBack size={14} strokeWidth={1.65} /></button>
        <button type="button" className={styles.play} aria-label={state?.playing ? '暂停' : '播放'} title={state?.playing ? '暂停' : '播放'} disabled={!state?.hasTrack} onClick={() => send('toggle')}>
          {state?.playing ? <Pause size={14} strokeWidth={1.65} /> : <Play size={14} strokeWidth={1.65} />}
        </button>
        <button type="button" aria-label="下一首" title="下一首" disabled={!state?.hasTrack} onClick={() => send('next')}><SkipForward size={14} strokeWidth={1.65} /></button>
        <button type="button" className={cn(styles.favorite, state?.liked && styles.liked)} aria-label={state?.liked ? '取消喜欢' : '喜欢'} title={state?.liked ? '取消喜欢' : '喜欢'} disabled={state?.liked == null} onClick={() => send('like')}><Heart size={14} strokeWidth={1.65} fill={state?.liked ? 'currentColor' : 'none'} /></button>
      </div>
      <div className={styles.copy}>
        <motion.div key={line} className={styles.words} title={line} initial={prefs.reduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <div ref={viewport} className={styles.viewport}>
            <span ref={text} className={styles.line} style={{ transform: `translateX(${-shift}px)`, '--taskbar-progress': `${progress * 100}%` } as CSSProperties}>{line}</span>
          </div>
          <div className={styles.secondary}>{secondary}</div>
        </motion.div>
      </div>
    </div>
  </div>;
}
