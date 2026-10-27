/**
 * Turns raw FFT bins into `count` smoothed bands (0…1), log-spaced from bass to
 * treble so each band carries a similar share of what the ear hears.
 * Bands rise quickly and fall slowly, which reads as "bouncing" rather than flicker.
 */
export class Spectrum {
  readonly values: Float32Array;
  private ranges: Array<[number, number]> = [];
  private key = '';

  constructor(readonly count: number) {
    this.values = new Float32Array(count);
  }

  private layout(binCount: number, sampleRate: number) {
    const key = `${binCount}:${sampleRate}`;
    if (key === this.key) return;
    this.key = key;
    const nyquist = sampleRate / 2;
    const low = 38;
    const high = Math.min(15_500, nyquist);
    const binOf = (hz: number) => Math.min(binCount - 1, Math.max(1, Math.round((hz / nyquist) * binCount)));
    this.ranges = Array.from({ length: this.count }, (_, index) => {
      const from = low * (high / low) ** (index / this.count);
      const to = low * (high / low) ** ((index + 1) / this.count);
      const start = binOf(from);
      return [start, Math.max(start + 1, binOf(to))];
    });
  }

  /** Real analyser data. `active` false lets every band settle back to rest. */
  sample(analyser: AnalyserNode | null, bins: Uint8Array<ArrayBuffer> | null, active: boolean) {
    if (!analyser || !bins || !active) return this.settle(null);
    analyser.getByteFrequencyData(bins);
    this.layout(bins.length, analyser.context.sampleRate);
    const target = new Float32Array(this.count);
    for (let index = 0; index < this.count; index += 1) {
      const [start, end] = this.ranges[index];
      let peak = 0;
      for (let bin = start; bin < end; bin += 1) peak = Math.max(peak, bins[bin]);
      // Treble carries less energy: tilt it up so the right side is not always flat.
      const tilt = 0.82 + (index / this.count) * 0.42;
      target[index] = Math.min(1, ((peak / 255) * tilt) ** 1.35);
    }
    return this.settle(target);
  }

  /**
   * Stand-in motion when the stream cannot be read (plain browser, or a
   * preview card): a calm, music-like pattern so the template is still legible.
   */
  synthetic(time: number, active: boolean) {
    if (!active) return this.settle(null);
    const target = new Float32Array(this.count);
    const beat = Math.max(0, Math.sin(time * 4.1)) ** 6;
    for (let index = 0; index < this.count; index += 1) {
      const x = index / this.count;
      const body = 0.52 * (1 - x) ** 1.4 + 0.12;
      const shimmer = 0.5 + 0.5 * Math.sin(time * (2.3 + x * 5) + index * 1.7) * Math.cos(time * 1.3 + index * 0.6);
      target[index] = Math.min(1, body * (0.55 + shimmer * 0.6) + beat * 0.35 * (1 - x));
    }
    return this.settle(target);
  }

  /** Bass energy (0…1) of the smoothed bands, for subtle cover pulses. */
  bass() {
    const take = Math.max(1, Math.round(this.count / 8));
    let sum = 0;
    for (let index = 0; index < take; index += 1) sum += this.values[index];
    return sum / take;
  }

  /** True while any band still has visible height. */
  moving() {
    return this.values.some(value => value > 0.004);
  }

  /**
   * Ease towards the target: rise fast, fall at a lively pace while music
   * plays, and sink slowly (~2 s) back to rest when it goes quiet — pause,
   * zero volume, a song change — so nothing ever vanishes at once.
   */
  private settle(target: Float32Array | null) {
    for (let index = 0; index < this.count; index += 1) {
      const goal = target ? target[index] : 0;
      const current = this.values[index];
      const rate = goal > current ? 0.55 : target && goal > 0.02 ? 0.16 : 0.035;
      this.values[index] = current + (goal - current) * rate;
    }
    return this.values;
  }
}
