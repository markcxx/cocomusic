'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsClient } from '@/lib/client-only';
import styles from './Tooltip.module.css';

/**
 * App-wide tooltip, driven by attributes so any element can opt in:
 *
 *   data-tooltip="文字"             text to show
 *   data-tooltip-placement="bottom" top (default) | bottom | left | right; flips when it would overflow
 *   data-tooltip-shortcut="Space"   optional key hint on the right
 *   data-tooltip-overflow           only show when the element's text is truncated (ellipsis)
 *
 * Behaviour: ~450ms hover delay, then instant while moving between tooltip
 * targets (warm window), so scanning a toolbar feels quick. Keyboard focus
 * shows it too. Hidden on press, scroll, Escape, and while a menu/dialog opens.
 */

type Placement = 'top' | 'bottom' | 'left' | 'right';
type Tip = { target: HTMLElement; text: string; shortcut?: string; placement: Placement };
type Position = { x: number; y: number; placement: Placement; arrow: number };

const SHOW_DELAY = 450;
const WARM_MS = 600;
const GAP = 8;
const EDGE = 8;

function readTip(element: HTMLElement): Tip | null {
  const text = element.dataset.tooltip?.trim();
  if (!text) return null;
  if (element.hasAttribute('data-tooltip-overflow')) {
    // Only when the label is actually cut off (the element or a child with ellipsis).
    const clip = element.querySelector<HTMLElement>('[data-tooltip-clip]') ?? element;
    if (clip.scrollWidth <= clip.clientWidth + 1 && clip.scrollHeight <= clip.clientHeight + 1) return null;
  }
  const placement = element.dataset.tooltipPlacement as Placement | undefined;
  return { target: element, text, shortcut: element.dataset.tooltipShortcut, placement: placement ?? 'top' };
}

/** Place next to `rect`, flipping to the opposite side and clamping into the viewport. */
function place(rect: DOMRect, size: { width: number; height: number }, preferred: Placement): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fits: Record<Placement, boolean> = {
    top: rect.top - GAP - size.height >= EDGE,
    bottom: rect.bottom + GAP + size.height <= vh - EDGE,
    left: rect.left - GAP - size.width >= EDGE,
    right: rect.right + GAP + size.width <= vw - EDGE,
  };
  const opposite: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const placement = fits[preferred] || !fits[opposite[preferred]] ? preferred : opposite[preferred];
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  if (placement === 'top' || placement === 'bottom') {
    const center = rect.left + rect.width / 2;
    const x = clamp(center - size.width / 2, EDGE, vw - EDGE - size.width);
    const y = placement === 'top' ? rect.top - GAP - size.height : rect.bottom + GAP;
    return { x, y, placement, arrow: clamp(center - x, 10, size.width - 10) };
  }
  const middle = rect.top + rect.height / 2;
  const y = clamp(middle - size.height / 2, EDGE, vh - EDGE - size.height);
  const x = placement === 'left' ? rect.left - GAP - size.width : rect.right + GAP;
  return { x, y, placement, arrow: clamp(middle - y, 8, size.height - 8) };
}

const enterFrom: Record<Placement, { x?: number; y?: number }> = { top: { y: 4 }, bottom: { y: -4 }, left: { x: 4 }, right: { x: -4 } };

export function TooltipLayer() {
  const isClient = useIsClient();
  const [tip, setTip] = useState<Tip | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warmUntil = useRef(0);
  const current = useRef<HTMLElement | null>(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    if (current.current) warmUntil.current = Date.now() + WARM_MS;
    current.current = null;
    setTip(null);
  }, []);

  useEffect(() => {
    const show = (element: HTMLElement, immediate: boolean) => {
      clearTimeout(timer.current);
      current.current = element;
      const open = () => {
        // Re-read at show time: label/overflow may have changed during the delay.
        if (current.current !== element || !element.isConnected) return;
        const next = readTip(element);
        if (next) setTip(next);
      };
      if (immediate || Date.now() < warmUntil.current) open();
      else timer.current = setTimeout(open, SHOW_DELAY);
    };

    const targetOf = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null);

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = targetOf(event.target);
      if (target === current.current) return;
      if (!target) { if (current.current) hide(); return; }
      if (current.current) warmUntil.current = Date.now() + WARM_MS;
      setTip(null);
      show(target, false);
    };
    const onOut = (event: PointerEvent) => {
      if (!current.current) return;
      const to = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (!to || !current.current.contains(to)) {
        // Leaving to another target is handled by pointerover; leaving to nothing hides.
        if (!targetOf(to)) hide();
      }
    };
    // Keyboard users only: :focus-visible avoids showing after mouse clicks.
    const onFocus = (event: FocusEvent) => {
      const target = targetOf(event.target);
      if (target && target.matches(':focus-visible')) show(target, false);
    };
    const onBlur = (event: FocusEvent) => { if (targetOf(event.target) === current.current) hide(); };
    const onDown = () => { if (current.current) { clearTimeout(timer.current); setTip(null); current.current = null; } };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    const onScroll = () => { if (current.current) hide(); };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', hide);
    };
  }, [hide]);

  // Measure after the bubble renders with the new text, then place it.
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return;
    const rect = tip.target.getBoundingClientRect();
    setPosition(place(rect, { width: bubble.current.offsetWidth, height: bubble.current.offsetHeight }, tip.placement));
  }, [tip]);

  // Hide if the target disappears (route change, list re-render) or its label changes to empty.
  useEffect(() => {
    if (!tip) return;
    const observer = new MutationObserver(() => {
      if (!tip.target.isConnected || !tip.target.dataset.tooltip) hide();
      else if (tip.target.dataset.tooltip !== tip.text) setTip(readTip(tip.target));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observer.observe(tip.target, { attributes: true, attributeFilter: ['data-tooltip'] });
    return () => observer.disconnect();
  }, [tip, hide]);

  if (!isClient) return null;
  const placed = position && tip ? position : null;
  // Tooltips inside the dark lyrics page use the light variant for contrast.
  const inverted = Boolean(tip?.target.closest('[data-theme="dark"]'));

  return createPortal(
    <AnimatePresence>
      {tip && (
        <motion.div
          key={`${tip.text}|${placed?.placement ?? tip.placement}`}
          ref={bubble}
          role="tooltip"
          className={`${styles.tooltip} ${inverted ? styles.inverted : ''}`}
          data-placement={placed?.placement ?? tip.placement}
          style={{ left: placed?.x ?? -9999, top: placed?.y ?? -9999, '--arrow': `${placed?.arrow ?? 0}px` } as React.CSSProperties}
          initial={{ opacity: 0, scale: 0.94, ...enterFrom[placed?.placement ?? tip.placement] }}
          animate={{ opacity: placed ? 1 : 0, scale: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.08 } }}
          transition={{ type: 'spring', stiffness: 700, damping: 38, mass: 0.6 }}
        >
          <span className={styles.text}>{tip.text}</span>
          {tip.shortcut && <kbd className={styles.shortcut}>{tip.shortcut}</kbd>}
          <span className={styles.arrow} aria-hidden />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
