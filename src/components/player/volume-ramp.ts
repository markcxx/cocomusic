/**
 * Ramp the element's volume over `ms` (ease-in-out), cancelling a previous ramp.
 * Returns the cancel function; `done` runs when the ramp completes.
 */
export function rampVolume(audio: HTMLAudioElement, from: number, to: number, ms: number, previous: (() => void) | null, done?: () => void) {
  previous?.();
  let frame = 0;
  const started = performance.now();
  audio.volume = Math.max(0, Math.min(1, from));
  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / ms);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * eased));
    if (t < 1) frame = requestAnimationFrame(tick);
    else done?.();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
