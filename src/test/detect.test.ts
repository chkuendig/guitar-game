import { describe, expect, it } from 'vitest';
import { detectPitch } from '../pitch/detect';
import { additiveTone, frameAt, synthesizePluck } from '../pitch/synth';
import { OPEN_STRINGS } from '../strings';
import { FRAME_SIZE } from '../config';

const SR = 44100;

/** Analysis window ending at `atMs` into the signal. */
function windowAt(signal: Float32Array, atMs: number): Float32Array {
  const pos = Math.round((atMs / 1000) * SR);
  return frameAt(signal, pos - FRAME_SIZE, FRAME_SIZE);
}

function centsOff(detected: number, reference: number): number {
  return 1200 * Math.log2(detected / reference);
}

describe('detectPitch', () => {
  it('detects each of the six open strings', () => {
    for (const s of OPEN_STRINGS) {
      const signal = synthesizePluck(s.frequency, SR, 1.2);
      let detections = 0;
      for (let tMs = 300; tMs <= 700; tMs += 100) {
        const result = detectPitch(windowAt(signal, tMs), SR);
        expect(result, `${s.name} at ${tMs}ms`).not.toBeNull();
        expect(Math.abs(centsOff(result!.frequency, s.frequency)), `${s.name} at ${tMs}ms`).toBeLessThan(10);
        detections++;
      }
      expect(detections).toBe(5);
    }
  });

  it('does not octave-error on a low E whose fundamental is weaker than its 2nd harmonic', () => {
    const frequency = 82.41;
    const signal = additiveTone(frequency, SR, {
      harmonics: [0.25, 1.0, 0.6, 0.4, 0.2],
      duration: 1.2,
      decay: 0.9,
    });
    const result = detectPitch(windowAt(signal, 500), SR);
    expect(result).not.toBeNull();
    expect(Math.abs(centsOff(result!.frequency, frequency))).toBeLessThan(10);
  });

  it('tracks ±30 cents detuning', () => {
    for (const cents of [-30, 30]) {
      const detuned = 82.41 * Math.pow(2, cents / 1200);
      const signal = synthesizePluck(detuned, SR, 1.2);
      const result = detectPitch(windowAt(signal, 500), SR);
      expect(result, `${cents} cents`).not.toBeNull();
      expect(Math.abs(centsOff(result!.frequency, detuned)), `${cents} cents`).toBeLessThan(5);
    }
  });

  it('survives added noise', () => {
    const signal = additiveTone(196.0, SR, {
      harmonics: [1, 0.55, 0.35, 0.2],
      duration: 1.2,
      decay: 0.9,
      noise: 0.1,
    });
    const result = detectPitch(windowAt(signal, 500), SR);
    expect(result).not.toBeNull();
    expect(Math.abs(centsOff(result!.frequency, 196.0))).toBeLessThan(10);
  });

  it('returns no pitch for silence', () => {
    expect(detectPitch(new Float32Array(FRAME_SIZE), SR)).toBeNull();
  });

  it('returns no pitch for pure noise', () => {
    const noise = additiveTone(100, SR, { harmonics: [0], duration: 1, decay: 1, noise: 0.3 });
    expect(detectPitch(windowAt(noise, 500), SR)).toBeNull();
  });
});
