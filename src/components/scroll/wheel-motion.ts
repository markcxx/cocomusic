type ScrollPosition = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>;
type Frames = { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void };

/** Owns wheel inertia only. Navigation and native gestures can stop it immediately. */
export function createWheelMotion(element: ScrollPosition, frames: Frames) {
  let target = element.scrollTop;
  let frame = 0;
  const step = () => {
    const delta = target - element.scrollTop;
    if (Math.abs(delta) < 0.5) { element.scrollTop = target; frame = 0; return; }
    const before = element.scrollTop;
    element.scrollTop += delta * 0.18;
    // Some engines round scrollTop to device pixels. Do not leave an endless
    // frame fighting later navigation when the remaining step rounds to zero.
    if (element.scrollTop === before) { element.scrollTop = target; frame = 0; return; }
    frame = frames.request(step);
  };
  return {
    by(pixels: number) {
      if (!frame) target = element.scrollTop;
      target = Math.max(0, Math.min(Math.max(0, element.scrollHeight - element.clientHeight), target + pixels));
      if (!frame) frame = frames.request(step);
    },
    stop() { frames.cancel(frame); frame = 0; target = element.scrollTop; },
    sync() { if (!frame) target = element.scrollTop; },
  };
}

/** offsetTop may belong to a positioned ancestor, not the scrolling viewport. */
export function sectionScrollTop(root: Pick<HTMLElement, 'scrollTop' | 'clientTop' | 'getBoundingClientRect'>, target: Pick<HTMLElement, 'getBoundingClientRect'>, gap = 16) {
  return Math.max(0, root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top - root.clientTop - gap);
}
