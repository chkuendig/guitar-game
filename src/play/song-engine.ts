import { GATE_FLOOR_RMS, PLAY_HOLD_MS, PLAY_ONSET_RATIO, PLAY_TOLERANCE_CENTS } from '../config';
import { HoldTracker } from '../game/hold';
import { midiToFrequency } from './songs';
import type { Song } from './songs';

/**
 * Play mode: walk through a song note by note. Pure logic like GameEngine —
 * the app feeds analysis frames with timestamps; no DOM, timers or audio.
 *
 * A note counts when its pitch (within PLAY_TOLERANCE_CENTS) has rung for
 * PLAY_HOLD_MS, using the same HoldTracker as Pluck mode (level gate, dropout
 * grace, pitch stability). Wrong notes are simply not counted — no scolding.
 *
 * After each counted note the engine waits for a *new* pluck before listening
 * again (level rising to PLAY_ONSET_RATIO × its lowest point since), so a
 * still-ringing string can't play "E E E E" by itself.
 */

export type SongEvent =
  /** The note to play now (also emitted for the first note). */
  | { type: 'note'; index: number }
  /** Hold progress 0..1 for the current note's ring. */
  | { type: 'hold'; progress: number }
  /** Live data for the visualizer: is the current note sounding? */
  | { type: 'heard'; onTarget: boolean; level: number }
  /** Whole song played. */
  | { type: 'done' };

/** Hold id for "the frame is on the current note". */
const ON_TARGET = 0;
/** Hold id for "some other pitch". */
const OTHER = 1;

export class SongEngine {
  song: Song | null = null;
  index = 0;
  done = false;

  private readonly emit: (event: SongEvent) => void;
  private readonly hold = new HoldTracker({ holdMs: PLAY_HOLD_MS });
  private armed = true;
  private minSinceNote = Infinity;
  private previousMidi: number | null = null;

  constructor(emit: (event: SongEvent) => void) {
    this.emit = emit;
  }

  start(song: Song): void {
    this.song = song;
    this.index = 0;
    this.done = false;
    this.armed = true;
    this.previousMidi = null;
    this.minSinceNote = Infinity;
    this.hold.resetHold();
    this.emit({ type: 'note', index: 0 });
  }

  stop(): void {
    this.song = null;
    this.done = false;
    this.hold.resetHold();
  }

  processFrame(frequency: number | null, level: number, timeMs: number): void {
    const song = this.song;
    if (!song || this.done) return;
    const target = song.notes[this.index];
    const cents = frequency === null ? null : 1200 * Math.log2(frequency / midiToFrequency(target.midi));
    const onTarget = cents !== null && Math.abs(cents) <= PLAY_TOLERANCE_CENTS;
    this.emit({ type: 'heard', onTarget, level });

    if (!this.armed) {
      this.minSinceNote = Math.min(this.minSinceNote, level);
      const replucked = level > GATE_FLOOR_RMS && level >= this.minSinceNote * PLAY_ONSET_RATIO;
      // A different note can't be the previous one still ringing.
      const newPitch = onTarget && target.midi !== this.previousMidi;
      if (!replucked && !newPitch) return;
      this.armed = true;
      this.hold.resetHold();
    }

    const result = this.hold.push({
      timeMs,
      stringIndex: frequency === null ? null : onTarget ? ON_TARGET : OTHER,
      level,
      cents: cents ?? undefined,
    });
    const holding = this.hold.holdingString === ON_TARGET;
    this.emit({ type: 'hold', progress: holding ? this.hold.progress : 0 });

    if (result.confirmed && result.stringIndex === ON_TARGET) this.advance(level);
  }

  private advance(level: number): void {
    const song = this.song!;
    this.previousMidi = song.notes[this.index].midi;
    this.index++;
    this.armed = false;
    this.minSinceNote = level;
    this.hold.resetHold();
    this.emit({ type: 'hold', progress: 0 });
    if (this.index >= song.notes.length) {
      this.done = true;
      this.emit({ type: 'done' });
    } else {
      this.emit({ type: 'note', index: this.index });
    }
  }
}
