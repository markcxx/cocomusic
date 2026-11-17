'use client';

import { animate, useMotionValue, type AnimationPlaybackControls } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Cover } from '@/components/common/Cover';
import { useSettings } from '@/lib/settings';
import { useLatest } from '@/lib/use-latest';
import type { Track } from '@/types/music';
import { usePlayer } from '../player-store';
import { useCoverTint } from '../visualizer/cover-tint';
import { cardProgress, FLOW, flowPose, lerp, shortAngle } from './geometry';
import styles from './CoverFlow.module.css';

/** Cards mounted on each side of the centre; the rest are off screen. */
const WINDOW = 9;
const OPEN_SECONDS = 1.15;
const CLOSE_SECONDS = 0.95;
/** Stage artwork spins once per 24 s (Stage.module.css › artSpin). */
const SPIN_SECONDS = 24;
const GLIDE = { type: 'spring', stiffness: 230, damping: 30, mass: 0.9 } as const;

/** Where the stage artwork sits, relative to the flow's centre card. */
type Origin = { dx: number; dy: number; scale: number; rotate: number; radius: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** One record: the front face plus both spines (only the one facing the viewer shows). */
const Card = memo(function Card({ item, index, centred, settled, playingHere, register }: {
  item: Track;
  index: number;
  centred: boolean;
  settled: boolean;
  playingHere: boolean;
  register: (index: number, element: HTMLDivElement | null) => void;
}) {
  const tint = useCoverTint(item.cover, item.coverSeed);
  const ref = useCallback((element: HTMLDivElement | null) => register(index, element), [index, register]);
  const spine = (
    <>
      <span className={styles.spineThumb}>
        <Cover seed={item.coverSeed} src={item.cover} radius={2} className={styles.cover} />
      </span>
      <strong>{item.title}</strong>
      <span>{item.artist}</span>
    </>
  );
  return (
    <div ref={ref} className={styles.card} data-index={index} style={{ opacity: 0, '--tint': tint } as CSSProperties} aria-label={`${item.title} - ${item.artist}`} role="option" aria-selected={centred}>
      <div className={styles.face}>
        <Cover seed={item.coverSeed} src={item.cover} radius={0} className={styles.cover} />
        {centred && settled && (
          <span className={playingHere ? styles.pause : styles.play} aria-hidden>
            {playingHere ? <Pause fill="currentColor" strokeWidth={0} /> : <Play fill="currentColor" strokeWidth={0} />}
          </span>
        )}
      </div>
      <div className={styles.back} aria-hidden />
      <div className={`${styles.spine} ${styles.spineLeft}`} aria-hidden>{spine}</div>
      <div className={`${styles.spine} ${styles.spineRight}`} aria-hidden>{spine}</div>
      <div className={`${styles.edge} ${styles.edgeTop}`} aria-hidden />
      <div className={`${styles.edge} ${styles.edgeBottom}`} aria-hidden />
    </div>
  );
});

/**
 * 封面流: the play queue as a shelf of records, over the lyrics page.
 *
 * Opening, the stage artwork flies into the centre of the flow and the other
 * records fan out from behind it, nearest first. Closing plays the same
 * choreography backwards: the far records slide in first, then the centre one
 * returns to the artwork's place (and turn, for a spinning cover), so the
 * stage picks up seamlessly.
 *
 * Wheel / trackpad / drag / ← → browse; click a side record to bring it to the
 * centre, click the centre one (or Enter) to play it; Esc or the background closes.
 */
export function CoverFlow({ drawer, viewport, closing, onRequestClose, onClosed }: {
  drawer: HTMLElement | null;
  viewport: HTMLElement | null;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
}) {
  const { queue, track, playing, play, togglePlay } = usePlayer();
  const { reduceMotion } = useSettings();
  const items = useMemo(() => (queue.some(item => item.id === track.id) ? queue : [track, ...queue]), [queue, track]);
  const currentIndex = Math.max(0, items.findIndex(item => item.id === track.id));
  const count = items.length;

  // The flow occupies the lyrics page area (between top bar and player bar).
  const [frame, setFrame] = useState<{ top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!viewport) return;
    const place = () => setFrame({ top: viewport.offsetTop, width: viewport.clientWidth, height: viewport.clientHeight });
    place();
    const observer = new ResizeObserver(place);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);
  const size = frame ? Math.round(Math.min(frame.height * 0.58, frame.width * 0.3, 440)) : 0;
  const centreY = frame ? Math.round(frame.height * 0.47) : 0;

  const offset = useMotionValue(currentIndex);
  const spread = useMotionValue(0);
  const [centre, setCentre] = useState(currentIndex);
  const [opened, setOpened] = useState(false);
  /** Fully open and not closing: browsing allowed. */
  const settled = opened && !closing;
  const target = useRef(currentIndex);
  const glideAnimation = useRef<AnimationPlaybackControls | null>(null);
  const spreadAnimation = useRef<AnimationPlaybackControls | null>(null);
  const origin = useRef<Origin | null>(null);
  const cards = useRef(new Map<number, HTMLDivElement>());
  const sceneRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const geometryRef = useLatest({ size, centreY });

  /** Measure the stage artwork (hidden while the flow is up, but still laid out). */
  const measureOrigin = useCallback((extraTurn = 0): Origin | null => {
    const scene = sceneRef.current;
    const holder = drawer?.querySelector<HTMLElement>('[data-flow-origin]');
    const shape = holder?.querySelector<HTMLElement>('[data-flow-shape]') ?? holder;
    const { size: width, centreY: y } = geometryRef.current;
    if (!scene || !holder || !shape || !width) return null;
    const box = shape.getBoundingClientRect();
    if (!box.width) return null;
    const sceneBox = scene.getBoundingClientRect();
    const style = getComputedStyle(shape);
    const spinning = style.animationName !== 'none' && style.animationPlayState === 'running';
    const rotate = (Number.parseFloat(style.rotate) || 0) + (spinning ? extraTurn : 0);
    return {
      dx: box.left + box.width / 2 - (sceneBox.left + sceneBox.width / 2),
      dy: box.top + box.height / 2 - (sceneBox.top + y),
      scale: box.width / width,
      rotate: shortAngle(rotate),
      radius: Number(holder.dataset.flowRadius ?? 0),
    };
  }, [drawer, geometryRef]);

  /** Place one card for the current offset and spread. */
  const placeCard = useCallback((index: number, element: HTMLDivElement) => {
    const width = geometryRef.current.size;
    if (!width) return;
    const d = index - offset.get();
    const a = Math.abs(d);
    const pose = flowPose(d);
    const p = cardProgress(spread.get(), d);
    const from = origin.current;
    const centreWeight = Math.max(0, 1 - a);
    const x = lerp(from ? from.dx : 0, pose.x * width, p);
    const y = lerp(from ? from.dy : 0, 0, p);
    const z = lerp(-a * FLOW.stackDepth * width, pose.z * width, p);
    const scale = lerp(from ? from.scale : 0.3, 1, p);
    const rotateZ = from ? from.rotate * centreWeight * (1 - p) : 0;
    element.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateY(${pose.rotateY * p}deg) rotateZ(${rotateZ}deg) scale(${scale})`;
    element.style.zIndex = String(pose.zIndex);
    const fade = Math.min(1, p * 2.5);
    // Keep card opacity at 1 once visible so preserve-3d never flattens; visibility hides collapsed cards.
    const cardOpacity = from ? lerp(1, fade, Math.min(1, a)) : fade;
    element.style.opacity = cardOpacity > 0.02 ? '1' : '0';
    element.style.visibility = cardOpacity > 0.02 ? 'visible' : 'hidden';
    const radius = from ? Math.min(from.radius / from.scale, width / 2) : 3;
    element.style.setProperty('--radius', `${lerp(radius, 3, p)}px`);
    element.style.setProperty('--spine', String(Math.min(1, p * 1.6)));
  }, [geometryRef, offset, spread]);

  const render = useCallback(() => {
    for (const [index, element] of cards.current) placeCard(index, element);
    const s = spread.get();
    if (backdropRef.current) backdropRef.current.style.opacity = String(Math.min(1, s * 1.6));
    if (captionRef.current) captionRef.current.style.opacity = String(clamp((s - 0.55) / 0.35, 0, 1));
  }, [placeCard, spread]);

  const register = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) { cards.current.set(index, element); placeCard(index, element); } else cards.current.delete(index);
  }, [placeCard]);

  useEffect(() => {
    const stopOffset = offset.on('change', value => {
      setCentre(clamp(Math.round(value), 0, Math.max(0, count - 1)));
      render();
    });
    const stopSpread = spread.on('change', render);
    return () => { stopOffset(); stopSpread(); };
  }, [offset, spread, render, count]);
  useLayoutEffect(render, [render, size, centreY]);

  const glide = useCallback((to: number) => {
    target.current = to;
    glideAnimation.current?.stop();
    if (reduceMotion) { offset.set(to); return; }
    glideAnimation.current = animate(offset, to, GLIDE);
  }, [offset, reduceMotion]);
  const go = useCallback((index: number) => glide(clamp(Math.round(index), 0, count - 1)), [glide, count]);

  // Open once the flow has a size: grow out of the artwork.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (!size || started.current) return;
    started.current = true;
    origin.current = measureOrigin();
    render();
    spreadAnimation.current = animate(spread, 1, { duration: reduceMotion ? 0 : OPEN_SECONDS, ease: 'linear', onComplete: () => setOpened(true) });
  }, [size, measureOrigin, render, reduceMotion, spread]);

  // Close: back to the playing song, then everything returns into the artwork.
  const latestRef = useLatest({ onClosed, currentIndex });
  useEffect(() => {
    if (!closing) return;
    spreadAnimation.current?.stop();
    const remaining = spread.get() * CLOSE_SECONDS;
    origin.current = measureOrigin((remaining / SPIN_SECONDS) * 360);
    glide(latestRef.current.currentIndex);
    if (reduceMotion || !remaining) { spread.set(0); latestRef.current.onClosed(); return; }
    spreadAnimation.current = animate(spread, 0, { duration: remaining, ease: 'linear', onComplete: () => latestRef.current.onClosed() });
  }, [closing, glide, latestRef, measureOrigin, reduceMotion, spread]);

  // The playing song changed by itself (song ended): follow it if the user was on it.
  const followed = useRef(currentIndex);
  useEffect(() => {
    if (Math.round(target.current) === followed.current && !closing) go(currentIndex);
    followed.current = currentIndex;
  }, [currentIndex, closing, go]);

  const liveRef = useLatest({ settled, closing, items, track, centre });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /** Centre record chosen: play it and put the shelf away; the playing one pauses/resumes. */
  const choose = useCallback((index: number) => {
    const item = liveRef.current.items[index];
    if (!item) return;
    if (item.id === liveRef.current.track.id) { togglePlay(); return; }
    play(item);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(onRequestClose, reduceMotion ? 0 : 360);
  }, [liveRef, play, togglePlay, onRequestClose, reduceMotion]);

  // Keyboard, ahead of the app's ← → seek and the lyrics page's Esc.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (liveRef.current.closing || event.metaKey || event.ctrlKey || event.altKey) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => go(Math.round(target.current) - 1),
        ArrowRight: () => go(Math.round(target.current) + 1),
        Home: () => go(0),
        End: () => go(count - 1),
        Enter: () => choose(liveRef.current.centre),
        Escape: onRequestClose,
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat || event.key.startsWith('Arrow')) action();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, choose, count, onRequestClose, liveRef]);

  // Wheel / trackpad. Native listener: it must preventDefault and keep the page snap out.
  const [scene, setScene] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scene) return;
    let snap: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      // Momentum from the swipe that opened the flow must not scroll it.
      if (!liveRef.current.settled) return;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const raw = horizontal ? event.deltaX : event.deltaY;
      if (!raw) return;
      // A mouse wheel notch moves one record; a trackpad moves continuously, then snaps.
      const notch = event.deltaMode === 1 || (!horizontal && Number.isInteger(raw) && Math.abs(raw) >= 50);
      clearTimeout(snap);
      if (notch) { go(Math.round(target.current) + Math.sign(raw)); return; }
      const width = geometryRef.current.size || 300;
      glide(clamp(target.current + raw / (width * FLOW.spacing * 1.25), -0.45, count - 0.55));
      snap = setTimeout(() => go(target.current), 140);
    };
    scene.addEventListener('wheel', onWheel, { passive: false });
    return () => { clearTimeout(snap); scene.removeEventListener('wheel', onWheel); };
  }, [scene, go, glide, count, geometryRef, liveRef]);

  // Drag to browse; a press without movement is a click (card or background).
  const drag = useRef<{ id: number; x: number; from: number; moved: boolean; samples: Array<{ t: number; x: number }> } | null>(null);
  const [dragging, setDragging] = useState(false);
  const perPixel = () => 1 / ((geometryRef.current.size || 300) * 0.34);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !liveRef.current.settled) return;
    drag.current = { id: event.pointerId, x: event.clientX, from: offset.get(), moved: false, samples: [{ t: performance.now(), x: event.clientX }] };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    if (!state.moved && Math.abs(dx) < 5) return;
    if (!state.moved) { state.moved = true; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); glideAnimation.current?.stop(); }
    const next = clamp(state.from - dx * perPixel(), -0.6, count - 0.4);
    target.current = next;
    offset.set(next);
    state.samples = [...state.samples.slice(-4), { t: performance.now(), x: event.clientX }];
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.id !== event.pointerId) return;
    if (state.moved) {
      setDragging(false);
      const first = state.samples[0];
      const last = state.samples[state.samples.length - 1];
      const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0; // px per ms
      go(offset.get() - velocity * 220 * perPixel());
      return;
    }
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (!card) { onRequestClose(); return; }
    const index = Number(card.dataset.index);
    if (index === liveRef.current.centre) choose(index); else go(index);
  };

  const from = Math.max(0, centre - WINDOW);
  const to = Math.min(count - 1, centre + WINDOW);
  const shown = items[centre];
  const style = frame ? ({
    top: frame.top,
    height: frame.height,
    '--w': `${size}px`,
    '--d': `${Math.round(size * FLOW.spine)}px`,
    '--cy': `${centreY}px`,
    '--perspective': `${Math.round(size * FLOW.perspective)}px`,
  } as CSSProperties) : { visibility: 'hidden' as const };

  return (
    <div className={styles.overlay} style={style} data-closing={closing || undefined}>
      <div ref={backdropRef} className={styles.backdrop} aria-hidden />
      <div
        ref={element => { sceneRef.current = element; setScene(element); }}
        className={styles.scene}
        data-dragging={dragging || undefined}
        role="listbox"
        aria-label="流动切歌"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setDragging(false); go(offset.get()); }}
      >
        {size > 0 && items.slice(from, to + 1).map((item, slot) => {
          const index = from + slot;
          return (
            <Card
              key={`${item.id}:${index}`}
              item={item}
              index={index}
              centred={index === centre}
              settled={settled}
              playingHere={item.id === track.id && playing}
              register={register}
            />
          );
        })}
      </div>
      <div ref={captionRef} className={styles.caption} style={{ opacity: 0 }} aria-live="polite">
        {shown && (
          <>
            <strong key={shown.id}>{shown.title}</strong>
            <span>{shown.artist}{shown.album ? ` · ${shown.album}` : ''}</span>
            <small>{centre + 1} / {count} · 滚动或拖动浏览 · 点击中间封面播放 · Esc 收起</small>
          </>
        )}
      </div>
    </div>
  );
}
