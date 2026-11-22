import type { OpenString } from '../strings';

/**
 * Karplus-Strong plucked-string synth. The tone is rendered offline into an
 * AudioBuffer (cached per string) and played through a BufferSource — cheap,
 * and it works on every browser including iOS Safari.
 */
export class PluckSynth {
  private readonly ctx: AudioContext;
  private readonly cache = new Map<number, AudioBuffer>();
  /** Sources scheduled or sounding, so a mode switch can silence them. */
  private readonly live = new Set<{ source: AudioBufferSourceNode; amp: GainNode }>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Play the string's tone. Returns the tone duration in ms. */
  play(string: OpenString, gain = 0.8): number {
    return this.playFrequency(string.frequency, 0, gain);
  }

  /**
   * Play any pitch (Play mode: fretted notes, the song replay), `delaySec`
   * from now; `lengthSec` damps it after that long. Returns the tone's full
   * (undamped) duration in ms.
   */
  playFrequency(frequency: number, delaySec = 0, gain = 0.8, lengthSec?: number): number {
    const buffer = this.getBuffer(frequency);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const amp = this.ctx.createGain();
    const start = this.ctx.currentTime + delaySec;
    amp.gain.setValueAtTime(gain, start);
    source.connect(amp).connect(this.ctx.destination);
    // start() must come before stop(): Safari throws InvalidStateError
    // otherwise (that killed the song replay on iOS, 2026-11-22).
    source.start(start);
    if (lengthSec !== undefined && lengthSec < buffer.duration) {
      // Damp the string at the end of the note, like a player does before
      // the next one, so the rhythm stays crisp.
      amp.gain.setValueAtTime(gain, start + lengthSec);
      amp.gain.exponentialRampToValueAtTime(0.001, start + lengthSec + 0.08);
      source.stop(start + lengthSec + 0.1);
    }
    const entry = { source, amp };
    this.live.add(entry);
    source.onended = () => this.live.delete(entry);
    return buffer.duration * 1000;
  }

  /** Silence everything scheduled or ringing (mode switch, leaving a song). */
  stopAll(): void {
    const now = this.ctx.currentTime;
    for (const { source, amp } of this.live) {
      try {
        amp.gain.cancelScheduledValues(now);
        amp.gain.setValueAtTime(amp.gain.value, now);
        amp.gain.linearRampToValueAtTime(0, now + 0.03);
        source.stop(now + 0.04);
      } catch {
        // already stopped
      }
    }
    this.live.clear();
  }

  /** Rendered tones are cached by frequency (rounded to 0.1 Hz). */
  private getBuffer(frequency: number): AudioBuffer {
    const key = Math.round(frequency * 10);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const sr = this.ctx.sampleRate;
    const duration = 1.8;
    const buffer = this.ctx.createBuffer(1, Math.round(sr * duration), sr);
    const out = buffer.getChannelData(0);
    karplusStrongInto(out, frequency, sr);
    this.cache.set(key, buffer);
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
