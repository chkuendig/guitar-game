import { OPEN_STRINGS } from '../strings';
import { OUT_OF_TUNE_CENTS, PLAYBACK_TAIL_MS, TOLERANCE_CENTS, TRUMPET_MIN_HZ } from '../config';
import { matchOpenString } from '../pitch/matcher';
import { HoldTracker } from './hold';
import { TrumpetTracker } from './trumpet';

/** Target index of the trumpet (🎺, hidden ?trumpet option): one past the six strings. */
export const TRUMPET = OPEN_STRINGS.length;

/**
 * Game state machine: prompt (listening) -> success/hint -> next round.
 * Pure logic: no DOM, no timers, no Web Audio. The app feeds analysis frames
 * with timestamps and drives round transitions from emitted events.
 */

export type GameState = 'idle' | 'listening' | 'celebrate' | 'hint';

export type GameEvent =
  | { type: 'round'; target: number }
  | { type: 'listening'; target: number }
  /** Live analysis data for the visualizer (detected string / level). */
  | { type: 'pitch'; stringIndex: number | null; cents: number | null; level: number }
  /** Hold progress 0..1 for the target's progress ring (0 while a wrong string is held). */
  | { type: 'hold'; progress: number }
  /**
   * `cents`: median deviation of the held string from its nominal pitch.
   * `outOfTune`: |cents| > OUT_OF_TUNE_CENTS — it still counts, but the UI
   * should say the string itself is really out of tune.
   */
  | { type: 'success'; target: number; toneMs: number; cents: number; outOfTune: boolean }
  | { type: 'hint'; heard: number; target: number; cents: number; outOfTune: boolean }
  /** A held string that is a harmonic of the target: ignored (telemetry only). */
  | { type: 'harmonic'; heard: number; target: number; cents: number };

export interface EngineOptions {
  rng?: () => number;
  toneMs?: number;
  /** Hidden option: add the trumpet as a 7th target. Off by default. */
  trumpet?: boolean;
}

export class GameEngine {
  state: GameState = 'idle';
  target = 0;

  private readonly emit: (event: GameEvent) => void;
  private readonly rng: () => number;
  private readonly toneMs: number;
  private readonly hold = new HoldTracker();
  private readonly trumpet: TrumpetTracker | null;
  private readonly targetCount: number;
  private ignoreUntilMs = 0;
  private lastTarget = -1;
  /** Cents of the frames feeding the current hold (for the out-of-tune call-out). */
  private holdCents: number[] = [];
  private holdCentsString: number | null = null;

  constructor(emit: (event: GameEvent) => void, options: EngineOptions = {}) {
    this.emit = emit;
    this.rng = options.rng ?? Math.random;
    this.toneMs = options.toneMs ?? 1800;
    this.trumpet = options.trumpet ? new TrumpetTracker() : null;
    this.targetCount = OPEN_STRINGS.length + (options.trumpet ? 1 : 0);
  }

  /** Start the first round. */
  start(): void {
    this.beginRound();
  }

  /** New round with a fresh prompt (avoids repeating the same string). */
  beginRound(): void {
    this.pickTarget();
    this.hold.resetHold();
    this.trumpet?.reset();
    this.resetHoldCents();
    this.state = 'listening';
    this.emit({ type: 'round', target: this.target });
  }

  /** After a hint: same string again, keep listening. */
  continueRound(): void {
    this.hold.resetHold();
    this.trumpet?.reset();
    this.resetHoldCents();
    this.state = 'listening';
    this.emit({ type: 'listening', target: this.target });
  }

  /**
   * Feed one analysis frame. `frequency` is null when no pitch was detected.
   * Frames inside the playback-ignore window are dropped entirely.
   */
  /**
   * `wideFrequency` (trumpet option only): pitch from the wide-range detector
   * (WIDE_MIN_HZ..WIDE_MAX_HZ). A confident pitch above TRUMPET_MIN_HZ cannot
   * be an open guitar string, so that frame is kept away from the string hold.
   */
  processFrame(
    frequency: number | null,
    level: number,
    timeMs: number,
    wideFrequency: number | null = null,
  ): void {
    if (this.state !== 'listening' || timeMs < this.ignoreUntilMs) return;

    const brass = this.trumpet !== null && wideFrequency !== null && wideFrequency > TRUMPET_MIN_HZ;
    const match = frequency === null || brass ? null : matchOpenString(frequency, TOLERANCE_CENTS);
    this.emit({
      type: 'pitch',
      stringIndex: match?.stringIndex ?? null,
      cents: match?.cents ?? null,
      level,
    });

    const result = this.hold.push({
      timeMs,
      stringIndex: match?.stringIndex ?? null,
      level,
      cents: match?.cents,
    });

    if (match) {
      const holding = result.confirmed ? result.stringIndex : this.hold.holdingString;
      if (holding !== this.holdCentsString) {
        this.holdCents = [];
        this.holdCentsString = holding;
      }
      if (holding === match.stringIndex) this.holdCents.push(match.cents);
    }

    // Trumpet option: a sustained sound that is not a clean guitar string.
    // Frames the string hold is currently building on are not eligible.
    let blast = false;
    if (this.trumpet) {
      const guitarFrame =
        match !== null && this.hold.holdingString === match.stringIndex && this.hold.progress > 0;
      blast = !result.confirmed && this.trumpet.push(level, timeMs, !guitarFrame);
      if (result.confirmed) this.trumpet.reset();
    }

    // The ring only fills for the target: the string we asked for (or the
    // trumpet's blast). A wrong string still needs the full hold before its
    // hint, but shows no progress.
    const progress =
      this.target === TRUMPET
        ? (this.trumpet?.progress(timeMs) ?? 0)
        : this.hold.holdingString === this.target
          ? this.hold.progress
          : 0;
    this.emit({ type: 'hold', progress });

    if (blast) {
      this.hold.resetHold();
      this.resetHoldCents();
      if (this.target === TRUMPET) {
        this.state = 'celebrate';
        this.emit({ type: 'success', target: TRUMPET, toneMs: this.toneMs, cents: 0, outOfTune: false });
      } else {
        this.state = 'hint';
        this.emit({ type: 'hint', heard: TRUMPET, target: this.target, cents: 0, outOfTune: false });
      }
      return;
    }

    if (!result.confirmed) return;

    const cents = median(this.holdCents);
    const outOfTune = Math.abs(cents) > OUT_OF_TUNE_CENTS;
    this.resetHoldCents();
    if (result.stringIndex === this.target) {
      this.state = 'celebrate';
      this.emit({ type: 'success', target: this.target, toneMs: this.toneMs, cents, outOfTune });
    } else if (isHarmonicOf(result.stringIndex, this.target)) {
      // Phone mics often lose a low string's fundamental and hear its 3rd/4th
      // harmonic, which coincides with a higher open string (low E -> B, high E;
      // A -> high E). Don't scold the child for that: keep listening silently.
      this.emit({ type: 'harmonic', heard: result.stringIndex, target: this.target, cents });
    } else {
      this.state = 'hint';
      this.emit({ type: 'hint', heard: result.stringIndex, target: this.target, cents, outOfTune });
    }
  }

  private resetHoldCents(): void {
    this.holdCents = [];
    this.holdCentsString = null;
  }

  /** Called when the game starts playing its own pluck tone. */
  notifyPlayback(timeMs: number, durationMs: number): void {
    this.ignoreUntilMs = timeMs + durationMs + PLAYBACK_TAIL_MS;
  }

  private pickTarget(): void {
    for (let attempt = 0; attempt < 20; attempt++) {
      const next = Math.floor(this.rng() * this.targetCount);
      if (next >= 0 && next < this.targetCount && next !== this.lastTarget) {
        this.lastTarget = next;
        this.target = next;
        return;
      }
    }
    this.lastTarget = (this.lastTarget + 1) % this.targetCount;
    this.target = this.lastTarget;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** True if open string `heard` sits on the 2nd-4th harmonic of open string `target`. */
export function isHarmonicOf(heard: number, target: number): boolean {
  if (heard >= OPEN_STRINGS.length || target >= OPEN_STRINGS.length) return false;
  const ratio = OPEN_STRINGS[heard].frequency / OPEN_STRINGS[target].frequency;
  const n = Math.round(ratio);
  return n >= 2 && n <= 4 && Math.abs(1200 * Math.log2(ratio / n)) < 30;
}
