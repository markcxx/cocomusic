/**
 * Beat finder for the floating notes' bounce: watches the bass band and fires when its
 * energy jumps clearly above its own recent average (a kick drum, a strong
 * downbeat). Exposes a decaying pulse, so a hop rises fast and settles back
 * smoothly instead of flickering with every FFT frame.
 */

const BASS_HZ: [number, number] = [35, 160];
/** Shortest gap between two beats (s): one drum hit never fires twice. */
const REFRACTORY = 0.24;

export class BeatTracker {
  /** 0…1, set on a beat and decaying after it. */
  pulse = 0;
  /** Beats fired so far. */
  count = 0;
  /** True when the latest beat was a strong one (taller hop). */
  strong = false;
  /** Smoothed hop height 0…1 (fast rise, follows the pulse down). */
  hop = 0;
  private level = 0;
  private average = 0;
  private since = Infinity;

  /** `bins` from getByteFrequencyData, or null when paused / unreadable. */
  update(bins: Uint8Array | null, sampleRate: number, dt: number) {
    let raw = 0;
    if (bins) {
      const hz = sampleRate / 2 / bins.length;
      const start = Math.max(1, Math.floor(BASS_HZ[0] / hz));
      const end = Math.min(bins.length, Math.max(start + 1, Math.ceil(BASS_HZ[1] / hz)));
      let sum = 0;
      for (let i = start; i < end; i += 1) sum += bins[i];
      raw = (sum / (end - start)) / 255;
    }
    this.level += (raw - this.level) * (1 - Math.exp(-dt * (raw > this.level ? 30 : 8)));
    this.average += (this.level - this.average) * (1 - Math.exp(-dt / 1.2));
    this.since += dt;
    const excess = this.level - this.average * 1.15 - 0.035;
    if (bins && excess > 0 && this.since > REFRACTORY) {
      this.since = 0;
      const strength = Math.min(1, excess * 5);
      this.strong = strength > 0.6;
      this.pulse = Math.max(this.pulse, 0.55 + strength * 0.45);
      this.count += 1;
    }
    this.pulse *= Math.exp(-dt * 6);
    // The hop chases the pulse: ~60 ms up, then down with the pulse.
    this.hop += (this.pulse - this.hop) * (1 - Math.exp(-dt * (this.pulse > this.hop ? 32 : 14)));
    if (!bins) this.strong = false;
  }
}

