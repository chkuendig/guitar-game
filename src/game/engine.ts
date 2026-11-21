import { OPEN_STRINGS } from '../strings';
import { PLAYBACK_TAIL_MS, TOLERANCE_CENTS } from '../config';
import { matchOpenString } from '../pitch/matcher';
import { HoldTracker } from './hold';

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
  /** Hold progress 0..1 for the target's progress ring. */
  | { type: 'hold'; progress: number }
  | { type: 'success'; target: number; toneMs: number }
  | { type: 'hint'; heard: number; target: number };

export interface EngineOptions {
  rng?: () => number;
  toneMs?: number;
}

export class GameEngine {
  state: GameState = 'idle';
  target = 0;

  private readonly emit: (event: GameEvent) => void;
  private readonly rng: () => number;
  private readonly toneMs: number;
  private readonly hold = new HoldTracker();
  private ignoreUntilMs = 0;
  private lastTarget = -1;

  constructor(emit: (event: GameEvent) => void, options: EngineOptions = {}) {
    this.emit = emit;
    this.rng = options.rng ?? Math.random;
    this.toneMs = options.toneMs ?? 1800;
  }

  /** Start the first round. */
  start(): void {
    this.beginRound();
  }

  /** New round with a fresh prompt (avoids repeating the same string). */
  beginRound(): void {
    this.pickTarget();
    this.hold.resetHold();
    this.state = 'listening';
    this.emit({ type: 'round', target: this.target });
  }

  /** After a hint: same string again, keep listening. */
  continueRound(): void {
    this.hold.resetHold();
    this.state = 'listening';
    this.emit({ type: 'listening', target: this.target });
  }

  /**
   * Feed one analysis frame. `frequency` is null when no pitch was detected.
   * Frames inside the playback-ignore window are dropped entirely.
   */
  processFrame(frequency: number | null, level: number, timeMs: number): void {
    if (this.state !== 'listening' || timeMs < this.ignoreUntilMs) return;

    const match = frequency === null ? null : matchOpenString(frequency, TOLERANCE_CENTS);
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
    });

    this.emit({ type: 'hold', progress: this.hold.progress });

    if (!result.confirmed) return;

    if (result.stringIndex === this.target) {
      this.state = 'celebrate';
      this.emit({ type: 'success', target: this.target, toneMs: this.toneMs });
    } else {
      this.state = 'hint';
      this.emit({ type: 'hint', heard: result.stringIndex, target: this.target });
    }
  }

  /** Called when the game starts playing its own pluck tone. */
  notifyPlayback(timeMs: number, durationMs: number): void {
    this.ignoreUntilMs = timeMs + durationMs + PLAYBACK_TAIL_MS;
  }

  private pickTarget(): void {
    for (let attempt = 0; attempt < 20; attempt++) {
      const next = Math.floor(this.rng() * OPEN_STRINGS.length);
      if (next >= 0 && next < OPEN_STRINGS.length && next !== this.lastTarget) {
        this.lastTarget = next;
        this.target = next;
        return;
      }
    }
    this.lastTarget = (this.lastTarget + 1) % OPEN_STRINGS.length;
    this.target = this.lastTarget;
  }
}
