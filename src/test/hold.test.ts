import { describe, expect, it } from 'vitest';
import { HoldTracker } from '../game/hold';
import { HOLD_MS } from '../config';

const STEP = 45; // ms between analysis frames, like the app loop

interface LevelCurve {
  from: number;
  to?: number;
}

function frame(timeMs: number, stringIndex: number | null, level: number) {
  return { timeMs, stringIndex, level };
}

/** Feed a sustained string for `durationMs` decaying from `from` to `to` (RMS). */
function feedSustained(
  tracker: HoldTracker,
  stringIndex: number,
  durationMs: number,
  curve: LevelCurve,
  startMs = 0,
): boolean {
  let confirmed = false;
  for (let t = startMs; t < startMs + durationMs; t += STEP) {
    const frac = durationMs > 0 ? (t - startMs) / durationMs : 0;
    const level = curve.to === undefined ? curve.from : curve.from + (curve.to - curve.from) * frac;
    if (tracker.push(frame(t, stringIndex, level)).confirmed) confirmed = true;
  }
  return confirmed;
}

describe('HoldTracker', () => {
  it('registers a sustained correct pluck', () => {
    const tracker = new HoldTracker();
    // Healthy pluck: RMS decays from 0.18 to 0.10 over a second.
    const confirmed = feedSustained(tracker, 0, 1000, { from: 0.18, to: 0.1 });
    expect(confirmed).toBe(true);
  });

  it('does not register a 150 ms blip', () => {
    const tracker = new HoldTracker();
    // Blip: loud for 150 ms, then the note is gone (level under the floor).
    expect(feedSustained(tracker, 0, 150, { from: 0.18 })).toBe(false);
    for (let t = 200; t < 1000; t += STEP) {
      expect(tracker.push(frame(t, 0, 0.0001)).confirmed).toBe(false);
    }
    expect(tracker.progress).toBe(0);
  });

  it('survives a short pitch dropout (< grace) but not a long one', () => {
    const tracker = new HoldTracker();
    // 300 ms of valid pitch ...
    feedSustained(tracker, 2, 300, { from: 0.15 }, 0);
    expect(tracker.progress).toBeGreaterThan(0.4);
    // ... 90 ms of lost pitch while the string still rings ...
    for (let t = 315; t < 405; t += STEP) {
      tracker.push(frame(t, null, 0.12));
    }
    // ... then pitch returns: the hold continues and completes.
    let confirmed = false;
    for (let t = 405; t < 900; t += STEP) {
      if (tracker.push(frame(t, 2, 0.1)).confirmed) confirmed = true;
    }
    expect(confirmed).toBe(true);
  });

  it('resets the hold when the pitch wanders to another string', () => {
    const tracker = new HoldTracker();
    let confirmed = false;
    // Alternate every 300 ms between string 0 and 1 for 1.5 s: never 600 ms on one.
    for (let t = 0, i = 0; t < 1500; t += STEP, i++) {
      const stringIndex = Math.floor(t / 300) % 2;
      if (tracker.push(frame(t, stringIndex, 0.15)).confirmed) confirmed = true;
    }
    expect(confirmed).toBe(false);
    expect(tracker.progress).toBeLessThan(1);
  });

  it('confirms a wrong string only after the same full hold', () => {
    const tracker = new HoldTracker({ holdMs: 600 });
    let confirmedAt: number | null = null;
    for (let t = 0; t < 1000; t += STEP) {
      const r = tracker.push(frame(t, 1, 0.15));
      if (r.confirmed) {
        confirmedAt = t;
        expect(r.stringIndex).toBe(1);
      }
    }
    // Not before the hold time (first frame starts the hold, so ~600 ms later).
    expect(confirmedAt).not.toBeNull();
    expect(confirmedAt!).toBeGreaterThanOrEqual(HOLD_MS - STEP);
  });

  it('never holds a muted pluck below the level floor', () => {
    const tracker = new HoldTracker();
    for (let t = 0; t < 1000; t += STEP) {
      expect(tracker.push(frame(t, 0, 0.001)).confirmed).toBe(false); // below GATE_FLOOR_RMS
    }
    expect(tracker.progress).toBe(0);
  });

  it('resets when a note decays below its onset-relative gate', () => {
    const tracker = new HoldTracker();
    // Very fast decay (a damped/muted pluck): it falls below the level floor
    // after ~350 ms, before the 400 ms hold completes.
    let confirmed = false;
    for (let t = 0; t < 600; t += STEP) {
      const level = 0.3 * Math.exp((-t / 1000) * 15);
      if (tracker.push(frame(t, 0, level)).confirmed) confirmed = true;
    }
    expect(confirmed).toBe(false);
    expect(tracker.progress).toBe(0);
  });

  it('does not confirm a pitch that jitters within the string window (noise, not a note)', () => {
    const tracker = new HoldTracker({ holdMs: 400 });
    // Same string index every frame, but cents jumping like the device log
    // showed (-75, +177, ...): never a steady note.
    const jitter = [-75, 177, -40, 120, -160, 60, -90, 150, -20, 110, -130, 80];
    let confirmed = false;
    jitter.forEach((cents, i) => {
      if (tracker.push({ timeMs: i * 45, stringIndex: 5, level: 0.05, cents }).confirmed) confirmed = true;
    });
    expect(confirmed).toBe(false);
  });

  it('confirms a steady but badly tuned pitch (−150 cents ± small drift)', () => {
    const tracker = new HoldTracker({ holdMs: 400 });
    let confirmed = false;
    for (let i = 0; i < 14; i++) {
      const cents = -150 + (i % 3) * 8 - i; // small wobble + slow flat drift
      if (tracker.push({ timeMs: i * 45, stringIndex: 1, level: 0.05, cents }).confirmed) confirmed = true;
    }
    expect(confirmed).toBe(true);
  });

  it('confirms a quiet, fast-decaying high E like the owner\'s iPhone recorded', () => {
    // Device telemetry: high E onset ~0.02 RMS, down to ~0.002 within ~500 ms,
    // pitch steady within a few cents. The old 0.004 floor reset this hold.
    const tracker = new HoldTracker();
    let confirmed = false;
    for (let t = 0; t <= 500; t += STEP) {
      const level = 0.02 * Math.exp((-t / 1000) * 4.6);
      const cents = 5 - t / 100; // drifts slightly flat
      if (tracker.push({ timeMs: t, stringIndex: 5, level, cents }).confirmed) confirmed = true;
    }
    expect(confirmed).toBe(true);
  });
});
