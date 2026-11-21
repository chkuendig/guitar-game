/**
 * Monophonic pitch detection after McLeod's Pitch Method (MPM), based on the
 * normalized square difference function (NSDF). Pure function: Float32Array in,
 * pitch out, no DOM, no AudioContext.
 *
 * Time-domain autocorrelation is used (instead of an FFT peak) because a
 * child's guitar has strong harmonics and often a weak fundamental on the low
 * E; the NSDF period peak still lands on the true period, avoiding octave
 * errors.
 */

export interface PitchResult {
  frequency: number;
  /** Interpolated NSDF peak value in [-1, 1]; higher = more periodic. */
  clarity: number;
}

export interface DetectOptions {
  minFrequency: number;
  maxFrequency: number;
  /** Below this NSDF peak value, report "no pitch" (silence, noise). */
  clarityThreshold: number;
}

export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  minFrequency: 65,
  maxFrequency: 420,
  clarityThreshold: 0.6,
};

// First NSDF peak above PEAK_CUTOFF * global max wins (MPM standard).
const PEAK_CUTOFF = 0.9;

/**
 * Detect the fundamental frequency of one analysis frame.
 * Returns null for silence / noise / anything below the clarity threshold.
 */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  options: Partial<DetectOptions> = {},
): PitchResult | null {
  const { minFrequency, maxFrequency, clarityThreshold } = {
    ...DEFAULT_DETECT_OPTIONS,
    ...options,
  };

  const maxLag = Math.floor(sampleRate / minFrequency);
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  if (frame.length < 2 * maxLag) {
    throw new Error(
      `frame too short: need >= ${2 * maxLag} samples for ${minFrequency} Hz at ${sampleRate} Hz`,
    );
  }

  // Remove DC offset so a mic bias does not fake periodicity.
  let mean = 0;
  for (let i = 0; i < frame.length; i++) mean += frame[i];
  mean /= frame.length;

  const x = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) x[i] = frame[i] - mean;

  const nsdf = new Float32Array(maxLag + 1);
  let highest = 0;
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0; // sum x[j] * x[j + tau]
    let norm = 0; // sum x[j]^2 + x[j + tau]^2
    for (let j = 0; j + tau < x.length; j++) {
      acf += x[j] * x[j + tau];
      norm += x[j] * x[j] + x[j + tau] * x[j + tau];
    }
    const value = norm > 0 ? (2 * acf) / norm : 0;
    nsdf[tau] = value;
    if (tau >= minLag && value > highest) highest = value;
  }

  if (highest < clarityThreshold) return null;

  const threshold = PEAK_CUTOFF * highest;

  // Scan positive NSDF regions; the first local maximum above the threshold
  // is the period. Taking the *first* (not the highest) peak avoids locking
  // onto multiples of the true period.
  let tau = minLag;
  while (tau <= maxLag) {
    if (nsdf[tau] > 0) {
      let localMaxAt = -1;
      while (tau <= maxLag && nsdf[tau] > 0) {
        const right = tau + 1 <= maxLag ? nsdf[tau + 1] : 0;
        if (
          nsdf[tau] >= nsdf[tau - 1] &&
          nsdf[tau] >= right &&
          (localMaxAt < 0 || nsdf[tau] > nsdf[localMaxAt])
        ) {
          localMaxAt = tau;
        }
        tau++;
      }
      if (localMaxAt >= 0 && nsdf[localMaxAt] >= threshold) {
        return peakAt(nsdf, localMaxAt, sampleRate);
      }
    } else {
      tau++;
    }
  }

  return null;
}

function peakAt(nsdf: Float32Array, tau: number, sampleRate: number): PitchResult {
  const left = nsdf[tau - 1];
  const mid = nsdf[tau];
  const right = nsdf[tau + 1];
  const denom = left - 2 * mid + right;
  const shift = denom !== 0 ? (0.5 * (left - right)) / denom : 0;
  const interpolatedTau = tau + shift;
  const clarity = mid - 0.25 * (left - right) * shift;
  return { frequency: sampleRate / interpolatedTau, clarity };
}
