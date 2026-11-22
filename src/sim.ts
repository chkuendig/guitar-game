import { OPEN_STRINGS } from './strings';
import { synthesizeBlow, synthesizePluck, frameAt } from './pitch/synth';

/**
 * Simulation mode: keys 1–6 (or the on-screen picker) produce a synthetic,
 * decaying string pluck that is streamed through the exact same analysis
 * pipeline as the microphone — window ending "now", advancing in real time.
 * Lets the game be played and tested without a guitar or mic, headless
 * included.
 */
export class SimSource {
  private signal: Float32Array | null = null;
  private startMs = 0;
  private readonly frameSize: number;
  private readonly sampleRate: number;

  constructor(sampleRate: number, frameSize: number) {
    this.sampleRate = sampleRate;
    this.frameSize = frameSize;
  }

  pluck(stringIndex: number, nowMs: number): void {
    this.signal = synthesizePluck(OPEN_STRINGS[stringIndex].frequency, this.sampleRate, 1.8);
    this.startMs = nowMs;
  }

  /** A plucked note at any pitch (Play mode: key N plays the current note). */
  pluckFrequency(frequency: number, nowMs: number): void {
    this.signal = synthesizePluck(frequency, this.sampleRate, 1.8);
    this.startMs = nowMs;
  }

  /** A sustained trumpet blow (~1.2 s) — hidden ?trumpet option, key 7. */
  blow(nowMs: number): void {
    this.signal = synthesizeBlow(530, this.sampleRate, 1.2);
    this.startMs = nowMs;
  }

  /** Analysis window covering the most recent frameSize samples at nowMs. */
  currentFrame(nowMs: number): Float32Array {
    if (!this.signal) return new Float32Array(this.frameSize);
    const pos = ((nowMs - this.startMs) / 1000) * this.sampleRate;
    if (pos >= this.signal.length) {
      this.signal = null;
      return new Float32Array(this.frameSize);
    }
    return frameAt(this.signal, Math.round(pos) - this.frameSize, this.frameSize);
  }
}
