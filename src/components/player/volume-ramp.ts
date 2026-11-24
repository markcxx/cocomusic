/** Finish immediately in the background, where animation frames may be suspended. */
export function rampVolume(audio: Pick<HTMLAudioElement, 'volume'>, from: number, to: number, ms: number, done: () => void) {
  const finish = () => { audio.volume = to; done(); };
  if (!ms || document.hidden) {
    finish();
    return null;
  }

  const started = performance.now();
  let frame: number;
  const cancel = () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  const onVisibility = () => {
    if (document.hidden) { cancel(); finish(); }
  };
  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / ms);
    if (t >= 1) { cancel(); finish(); return; }
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    audio.volume = from + (to - from) * eased;
    frame = requestAnimationFrame(tick);
  };
  audio.volume = from;
  frame = requestAnimationFrame(tick);
  document.addEventListener('visibilitychange', onVisibility);
  return cancel;
}
