/**
 * Pure signal synthesis. Shared by the unit tests (known-answer signals for
 * the detector/matcher/hold) and by simulation mode (synthetic plucks fed
 * through the same pipeline as the microphone).
 */

/** RMS level of a frame, used by the hold gate. */
export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

export interface AdditiveOptions {
  /** Amplitude of harmonic 1 (fundamental), 2, 3, ... */
  harmonics: number[];
  /** Seconds. */
  duration: number;
  /** Exponential decay time constant in seconds. */
  decay: number;
  /** White noise amplitude. */
  noise?: number;
  /** Deterministic noise seed (tests must be reproducible). */
  seed?: number;
}

/** Additive harmonic tone with exponential decay — a test/sim "guitar string". */
export function additiveTone(
  frequency: number,
  sampleRate: number,
  options: AdditiveOptions,
): Float32Array {
  const { harmonics, duration, decay, noise = 0, seed = 12345 } = options;
  const length = Math.round(duration * sampleRate);
  const out = new Float32Array(length);
  let rng = seed >>> 0;
  const nextNoise = () => {
    // xorshift32
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng / 0xffffffff) * 2 - 1;
  };
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / decay);
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      sample += harmonics[h] * Math.sin(2 * Math.PI * (h + 1) * frequency * t);
    }
    out[i] = sample * envelope + noise * nextNoise();
  }
  return out;
}

/**
 * A kid-guitar-like plucked string: harmonics rolling off, fast attack decay.
 * Used by simulation mode and playback tests.
 */
export function synthesizePluck(frequency: number, sampleRate: number, duration = 1.8): Float32Array {
  // Fundamental and 2nd harmonic strong, upper harmonics progressively weaker;
  // slightly detune upper harmonics? No — keep it exactly periodic like a real
  // string, which also keeps MPM happy.
  const harmonics = [1, 0.55, 0.35, 0.22, 0.15, 0.1, 0.07, 0.05].map((a) => a);
  const tone = additiveTone(frequency, sampleRate, {
    harmonics,
    duration,
    decay: 0.9,
  });
  // Normalize to a healthy but not clipping level, like a close mic.
  let peak = 0;
  for (const s of tone) peak = Math.max(peak, Math.abs(s));
  if (peak > 0) {
    const gain = 0.35 / peak;
    for (let i = 0; i < tone.length; i++) tone[i] *= gain;
  }
  return tone;
}

/**
 * A sustained, brassy blow (trumpet, hidden ?trumpet option): bright
 * harmonics, soft 60 ms attack, steady level with a little vibrato and breath
 * noise, then a short release. Used by simulation mode (key 7) and tests.
 */
export function synthesizeBlow(
  frequency = 530,
  sampleRate = 44100,
  duration = 1.2,
  amplitude = 0.3,
): Float32Array {
  const harmonics = [1, 0.8, 0.7, 0.55, 0.4, 0.3, 0.2, 0.12];
  const length = Math.round(duration * sampleRate);
  const out = new Float32Array(length);
  let rng = 987654321;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.06);
    const release = Math.min(1, (duration - t) / 0.08);
    const f = frequency * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t));
    phase += (2 * Math.PI * f) / sampleRate;
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) sample += harmonics[h] * Math.sin((h + 1) * phase);
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    const breath = ((rng >>> 0) / 0xffffffff - 0.5) * 0.05;
    out[i] = (sample / 3.5 + breath) * amplitude * Math.max(0, Math.min(attack, release));
  }
  return out;
}

/** Slice a sliding analysis window out of a signal, zero-padded at the edges. */
export function frameAt(signal: Float32Array, start: number, frameSize: number): Float32Array {
  const frame = new Float32Array(frameSize);
  const from = Math.max(0, Math.min(start, signal.length));
  const to = Math.min(start + frameSize, signal.length);
  if (to > from) frame.set(signal.subarray(from, to), Math.max(0, -start));
  return frame;
}
