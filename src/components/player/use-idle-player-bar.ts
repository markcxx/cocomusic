'use client';

import { useEffect, useState } from 'react';

const IDLE_MS = 5000;

/** Mouse hover alone does not keep the controls awake; actual input does. */
export function useIdlePlayerBar(drawer: HTMLElement | null, enabled: boolean) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    let timer: ReturnType<typeof setTimeout>;
    let pressed = false;
    const schedule = () => {
      clearTimeout(timer);
      if (!enabled) return;
      timer = setTimeout(() => {
        // Menus and dialogs may be portalled outside the lyrics page. Keep
        // their anchors visible, and never hide a focused keyboard control.
        const overlay = document.querySelector('[role="menu"], [role="dialog"]:not([data-lyrics-drawer])');
        const keyboardFocus = drawer.querySelector('[data-lyrics-player-bar] :focus-visible');
        if (pressed || overlay || keyboardFocus) { schedule(); return; }
        setHidden(true);
      }, IDLE_MS);
    };
    const wake = () => { setHidden(false); schedule(); };
    const onDown = () => { pressed = true; wake(); };
    const onUp = () => { pressed = false; wake(); };
    // Reopening the page or returning from comments starts a fresh idle period.
    const initial = setTimeout(wake, 0);
    drawer.addEventListener('pointerenter', wake);
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', wake);
    window.addEventListener('wheel', wake, { passive: true });
    window.addEventListener('focus', wake);
    window.addEventListener('blur', onUp);
    document.addEventListener('focusin', wake);
    return () => {
      clearTimeout(initial);
      clearTimeout(timer);
      drawer.removeEventListener('pointerenter', wake);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('wheel', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('blur', onUp);
      document.removeEventListener('focusin', wake);
    };
  }, [drawer, enabled]);

  return enabled && hidden;
}
