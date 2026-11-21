import { describe, expect, it } from 'vitest';
import { TrumpetTracker } from '../game/trumpet';
import { TRUMPET_HOLD_MS } from '../config';

const STEP = 45;

/** Feed a level envelope; returns the time of confirmation or null. */
function run(tracker: TrumpetTracker, level: (t: number) => number, durationMs: number): number | null {
  for (let t = 0; t <= durationMs; t += STEP) {
    if (tracker.push(level(t), t)) return t;
  }
  return null;
}

describe('TrumpetTracker (hidden ?trumpet option)', () => {
  it('confirms a sustained blow after the hold time, loud or quiet', () => {
    // Device telemetry: blasts between ~0.01 and ~0.17 RMS.
    for (const amp of [0.01, 0.15]) {
      const at = run(new TrumpetTracker(), (t) => amp * (1 + 0.15 * Math.sin(t / 40)), 1200);
      expect(at, `amp ${amp}`).not.toBeNull();
      expect(at!).toBeGreaterThanOrEqual(TRUMPET_HOLD_MS);
    }
  });

  it('never confirms a decaying pluck, even a loud one', () => {
    for (const tau of [0.3, 0.6, 0.85]) {
      const at = run(new TrumpetTracker(), (t) => 0.2 * Math.exp(-t / 1000 / tau), 2000);
      expect(at, `tau ${tau}`).toBeNull();
    }
  });

  it('ignores a short blip and silence', () => {
    expect(run(new TrumpetTracker(), (t) => (t < 300 ? 0.1 : 0), 1500)).toBeNull();
    expect(run(new TrumpetTracker(), () => 0.002, 1500)).toBeNull();
  });

  it('frames marked as a guitar string do not count towards a blast', () => {
    const tracker = new TrumpetTracker();
    let confirmed = false;
    for (let t = 0; t <= 1500; t += STEP) if (tracker.push(0.05, t, false)) confirmed = true;
    expect(confirmed).toBe(false);
    expect(tracker.progress(1500)).toBe(0);
  });
});
