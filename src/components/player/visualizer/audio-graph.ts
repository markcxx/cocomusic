'use client';

/**
 * Web Audio tap for the visualizer: <audio> → analyser → speakers.
 *
 * Created lazily, the first time a visualizer is shown, and kept for the life
 * of the element (createMediaElementSource can only be called once). Once
 * routed, the element's own output device no longer applies, so the chosen
 * output device is mirrored onto the AudioContext.
 *
 * Online streams must be CORS-enabled (player-store sets crossOrigin, the
 * desktop main process adds the header); a tainted stream would play silent.
 */

type Graph = { context: AudioContext; analyser: AnalyserNode; bins: Uint8Array<ArrayBuffer> };

const graphs = new WeakMap<HTMLAudioElement, Graph>();
let outputDevice = '';

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

function applySink(context: SinkContext) {
  if (!context.setSinkId) return;
  context.setSinkId(outputDevice).catch(() => undefined);
}

export function hasGraph(audio: HTMLAudioElement) {
  return graphs.has(audio);
}

/** Real samples are only possible in the desktop app (it adds the CORS headers). */
export const canEverRoute = () => typeof window !== 'undefined' && Boolean(window.coco);

/**
 * Only route elements whose current source can be read without tainting.
 * Desktop app only: in a plain browser later online streams could not be
 * loaded in CORS mode, so the visualizer falls back to synthetic motion there.
 */
export function canRoute(audio: HTMLAudioElement) {
  if (!canEverRoute()) return false;
  const src = audio.currentSrc || audio.getAttribute('src') || '';
  if (!src) return false;
  if (audio.crossOrigin === 'anonymous') return true;
  try { return new URL(src, location.href).origin === location.origin; } catch { return false; }
}

/** The analyser for this element, creating the graph on first use (null when not possible yet). */
export function analyserFor(audio: HTMLAudioElement): Graph | null {
  const existing = graphs.get(audio);
  if (existing) return existing;
  if (typeof AudioContext === 'undefined' || !canRoute(audio)) return null;
  try {
    const context = new AudioContext({ latencyHint: 'playback' });
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -88;
    analyser.maxDecibels = -18;
    source.connect(analyser);
    analyser.connect(context.destination);
    applySink(context);
    const graph = { context, analyser, bins: new Uint8Array(analyser.frequencyBinCount) };
    graphs.set(audio, graph);
    // Autoplay policy may start the context suspended; it resumes with playback.
    const resume = () => { if (context.state === 'suspended') void context.resume().catch(() => undefined); };
    audio.addEventListener('play', resume);
    resume();
    return graph;
  } catch {
    return null;
  }
}

/** Keep the routed output on the device picked in 设置 › 播放 › 输出设备. */
export function setGraphOutputDevice(audio: HTMLAudioElement | null, id: string) {
  outputDevice = id;
  const graph = audio ? graphs.get(audio) : undefined;
  if (graph) applySink(graph.context);
}
