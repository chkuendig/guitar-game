import type { OpenString } from '../strings';

/**
 * Karplus-Strong plucked-string synth. The tone is rendered offline into an
 * AudioBuffer (cached per string) and played through a BufferSource — cheap,
 * and it works on every browser including iOS Safari.
 */
export class PluckSynth {
  private readonly ctx: AudioContext;
  private readonly cache = new Map<number, AudioBuffer>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Play the string's tone. Returns the tone duration in ms. */
  play(string: OpenString, gain = 0.8): number {
    const buffer = this.getBuffer(string);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    source.connect(amp).connect(this.ctx.destination);
    source.start();
    return buffer.duration * 1000;
  }

  private getBuffer(string: OpenString): AudioBuffer {
    const cached = this.cache.get(string.index);
    if (cached) return cached;

    const sr = this.ctx.sampleRate;
    const duration = 1.8;
    const buffer = this.ctx.createBuffer(1, Math.round(sr * duration), sr);
    const out = buffer.getChannelData(0);
    karplusStrongInto(out, string.frequency, sr);
    this.cache.set(string.index, buffer);
    return buffer;
  }
}

/**
 * Classic Karplus-Strong: a noise-filled delay line of one period, damped by
 * the averaging filter each cycle. Pure function over a sample buffer.
 */
export function karplusStrongInto(out: Float32Array, frequency: number, sampleRate: number): void {
  const n = Math.max(2, Math.round(sampleRate / frequency));
  const delay = new Float32Array(n);
  // Excite with slightly smoothed noise for a softer pluck attack.
  let noise = 0;
  for (let i = 0; i < n; i++) {
    noise = 0.6 * noise + 0.4 * (Math.random() * 2 - 1);
    delay[i] = noise;
  }
  for (let i = 0; i < out.length; i++) {
    const j = i % n;
    const v = 0.5 * (delay[j] + delay[(j + 1) % n]);
    delay[j] = v;
    out[i] = v;
  }
  // Normalize to a pleasant, safe level.
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.5 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
}
