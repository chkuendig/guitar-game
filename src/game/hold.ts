import {
  DROPOUT_GRACE_MS,
  GATE_FLOOR_RMS,
  GATE_RELATIVE,
  HOLD_MS,
  STABILITY_CENTS,
} from '../config';

/**
 * Pure, time-driven hold logic: a string only registers after its pitch has
 * stayed on the same string (within tolerance, above the level gate) for a
 * sustained hold (~600 ms).
 *
 * The level gate adapts to the pluck's onset: a frame counts while its RMS is
 * above max(GATE_FLOOR_RMS, onsetPeak * GATE_RELATIVE). A normally plucked
 * string decays through the whole hold; a muted or dying note falls below the
 * gate and resets the hold. Short pitch dropouts (< DROPOUT_GRACE_MS) pause
 * the hold without resetting it; moving to a different string resets it, and
 * so does a pitch that jumps by more than STABILITY_CENTS within the hold.
 *
 * No DOM, no clocks — the caller supplies frame timestamps, so this is fully
 * unit-testable.
 */

export interface HoldOptions {
  holdMs: number;
  dropoutGraceMs: number;
  gateRelative: number;
  gateFloorRms: number;
  stabilityCents: number;
}

export const DEFAULT_HOLD_OPTIONS: HoldOptions = {
  holdMs: HOLD_MS,
  dropoutGraceMs: DROPOUT_GRACE_MS,
  gateRelative: GATE_RELATIVE,
  gateFloorRms: GATE_FLOOR_RMS,
  stabilityCents: STABILITY_CENTS,
};

export interface HoldFrame {
  timeMs: number;
  /** String matched within tolerance this frame, or null (no pitch / no match). */
  stringIndex: number | null;
  /** RMS level of this frame. */
  level: number;
  /** Cents from the matched string's nominal pitch (enables the stability check). */
  cents?: number;
}

export type HoldResult = { confirmed: false } | { confirmed: true; stringIndex: number };

export class HoldTracker {
  private readonly options: HoldOptions;
  private holdString: number | null = null;
  private heldMs = 0;
  private lastValidTimeMs: number | null = null;
  private onsetPeak = 0;
  /** Running pitch reference of the current hold, in cents. */
  private refCents: number | null = null;

  constructor(options: Partial<HoldOptions> = {}) {
    this.options = { ...DEFAULT_HOLD_OPTIONS, ...options };
  }

  /** Fraction of the hold reached, 0..1, for the UI progress ring. */
  get progress(): number {
    return Math.min(1, this.heldMs / this.options.holdMs);
  }

  /** String currently being held (for UI), or null. */
  get holdingString(): number | null {
    return this.holdString;
  }

  push(frame: HoldFrame): HoldResult {
    const { holdMs, dropoutGraceMs, gateRelative, gateFloorRms, stabilityCents } = this.options;

    const gate = Math.max(gateFloorRms, this.onsetPeak * gateRelative);
    const levelOk = frame.level > gate;

    if (frame.stringIndex === null || !levelOk) {
      if (!levelOk) {
        // Below the gate: muted, or the note died away. Reset.
        this.resetHold();
      } else if (
        this.lastValidTimeMs === null ||
        frame.timeMs - this.lastValidTimeMs > dropoutGraceMs
      ) {
        // Pitch dropout while the string still rings: tolerated briefly.
        this.resetHold();
      }
      return { confirmed: false };
    }

    const unstable =
      frame.cents !== undefined &&
      this.refCents !== null &&
      Math.abs(frame.cents - this.refCents) > stabilityCents;
    if (frame.stringIndex !== this.holdString || unstable) {
      // Different string, pitch jumped, or fresh start: begin a new hold.
      this.resetHold();
      this.holdString = frame.stringIndex;
      this.onsetPeak = frame.level;
      this.lastValidTimeMs = frame.timeMs;
      this.refCents = frame.cents ?? null;
      return { confirmed: false };
    }
    if (frame.cents !== undefined) {
      // Follow slow drift (a decaying string goes slightly flat).
      this.refCents = this.refCents === null ? frame.cents : 0.7 * this.refCents + 0.3 * frame.cents;
    }

    // Same string: accumulate time since the previous valid frame, clamped so
    // a scheduling gap cannot hand us a free hold.
    const delta = Math.min(frame.timeMs - this.lastValidTimeMs!, 200);
    if (delta > 0) this.heldMs += delta;
    this.onsetPeak = Math.max(this.onsetPeak, frame.level);
    this.lastValidTimeMs = frame.timeMs;

    if (this.heldMs >= holdMs) {
      const confirmedString = this.holdString;
      this.resetHold();
      return { confirmed: true, stringIndex: confirmedString };
    }
    return { confirmed: false };
  }

  resetHold(): void {
    this.holdString = null;
    this.heldMs = 0;
    this.lastValidTimeMs = null;
    this.onsetPeak = 0;
    this.refCents = null;
  }
}
