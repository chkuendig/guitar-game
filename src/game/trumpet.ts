import {
  DROPOUT_GRACE_MS,
  TRUMPET_FLOOR_RMS,
  TRUMPET_HOLD_MS,
  TRUMPET_SUSTAIN_RATIO,
} from '../config';

/**
 * Hidden option (?trumpet): pure, time-driven detector for a trumpet blast —
 * recognised by its *envelope*, not its pitch (on the device the trumpet's
 * pitch read as anything from 90 to 340 Hz, and its loudness ranged
 * 0.01–0.17 RMS).
 *
 * A blow is sustained: the level stays near its running peak for as long as
 * the child blows. A plucked string decays from the attack (to under half its
 * peak within ~0.5 s), so it never survives TRUMPET_HOLD_MS here.
 *
 * Rules, per frame (a frame is only *eligible* if it is not a clean guitar
 * string — see the engine):
 * - level must stay above max(TRUMPET_FLOOR_RMS, peak * TRUMPET_SUSTAIN_RATIO),
 *   where peak is the loudest frame since the blast started;
 * - brief dips (≤ DROPOUT_GRACE_MS) are tolerated, longer ones reset;
 * - after TRUMPET_HOLD_MS of sustain the blast is confirmed.
 */
export interface TrumpetOptions {
  holdMs: number;
  floorRms: number;
  sustainRatio: number;
  graceMs: number;
}

export const DEFAULT_TRUMPET_OPTIONS: TrumpetOptions = {
  holdMs: TRUMPET_HOLD_MS,
  floorRms: TRUMPET_FLOOR_RMS,
  sustainRatio: TRUMPET_SUSTAIN_RATIO,
  graceMs: DROPOUT_GRACE_MS,
};

export class TrumpetTracker {
  private readonly options: TrumpetOptions;
  private startMs: number | null = null;
  private lastOkMs: number | null = null;
  private peak = 0;

  constructor(options: Partial<TrumpetOptions> = {}) {
    this.options = { ...DEFAULT_TRUMPET_OPTIONS, ...options };
  }

  /** Fraction of the blast hold reached, 0..1. */
  progress(nowMs: number): number {
    if (this.startMs === null || this.lastOkMs === null) return 0;
    return Math.min(1, (Math.min(nowMs, this.lastOkMs) - this.startMs) / this.options.holdMs);
  }

  /**
   * Feed one frame; returns true when a blast is confirmed (then resets).
   * `eligible` = false for frames that are clearly a guitar string: they count
   * like a dip (tolerated briefly, reset after the grace period).
   */
  push(level: number, timeMs: number, eligible = true): boolean {
    const { holdMs, floorRms, sustainRatio, graceMs } = this.options;

    if (this.startMs === null) {
      if (eligible && level > floorRms) {
        this.startMs = timeMs;
        this.lastOkMs = timeMs;
        this.peak = level;
      }
      return false;
    }

    if (eligible) this.peak = Math.max(this.peak, level);
    const gate = Math.max(floorRms, this.peak * sustainRatio);
    if (eligible && level >= gate) {
      this.lastOkMs = timeMs;
    } else if (timeMs - this.lastOkMs! > graceMs) {
      // Faded (a pluck decaying) or stopped: start over. A new loud frame may
      // begin the next blast right away.
      this.reset();
      if (eligible && level > floorRms) return this.push(level, timeMs, eligible);
      return false;
    }

    if (this.lastOkMs! - this.startMs >= holdMs) {
      this.reset();
      return true;
    }
    return false;
  }

  reset(): void {
    this.startMs = null;
    this.lastOkMs = null;
    this.peak = 0;
  }
}
