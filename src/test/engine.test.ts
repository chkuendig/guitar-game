import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
import type { GameEvent } from '../game/engine';
import { detectPitch } from '../pitch/detect';
import { rms, synthesizePluck, frameAt } from '../pitch/synth';
import { OPEN_STRINGS } from '../strings';
import { FRAME_SIZE } from '../config';

const SR = 44100;
const STEP = 45;

/**
 * Stream a synthesized decaying pluck through the real pipeline
 * (window -> detectPitch -> engine.processFrame), like the app loop does.
 */
function feedPluck(
  engine: GameEngine,
  stringIndex: number,
  startMs: number,
  durationMs: number,
): void {
  const signal = synthesizePluck(OPEN_STRINGS[stringIndex].frequency, SR, durationMs / 1000 + 0.1);
  for (let t = startMs; t < startMs + durationMs; t += STEP) {
    const pos = Math.round(((t - startMs) / 1000) * SR);
    const frame = frameAt(signal, pos - FRAME_SIZE, FRAME_SIZE);
    const pitch = detectPitch(frame, SR);
    engine.processFrame(pitch?.frequency ?? null, rms(frame), t);
  }
}

function feedSilence(engine: GameEngine, startMs: number, durationMs: number): void {
  for (let t = startMs; t < startMs + durationMs; t += STEP) {
    engine.processFrame(null, 0, t);
  }
}

function rig(target: number): { engine: GameEngine; events: GameEvent[] } {
  const events: GameEvent[] = [];
  // rng that always yields the same string index (0 -> E2, 1 -> A2, ...);
  // the second draw is unused in single-round tests.
  let first = true;
  const rng = () => {
    if (first) {
      first = false;
      return target / 6;
    }
    return ((target + 1) % 6) / 6;
  };
  const engine = new GameEngine((e) => events.push(e), { rng });
  engine.start();
  events.length = 0; // drop the initial round event
  return { engine, events };
}

describe('GameEngine', () => {
  it('asks for a string and celebrates when the right one rings', () => {
    const { engine, events } = rig(0);
    feedPluck(engine, 0, 0, 1200);
    const success = events.find((e) => e.type === 'success');
    expect(success).toBeDefined();
    expect((success as Extract<GameEvent, { type: 'success' }>).target).toBe(0);
    expect(engine.state).toBe('celebrate');
  });

  it('gives only a gentle hint after a fully held wrong string', () => {
    const { engine, events } = rig(0);
    feedPluck(engine, 1, 0, 1200);
    const hint = events.find((e) => e.type === 'hint');
    expect(hint).toBeDefined();
    expect(hint).toMatchObject({ heard: 1, target: 0 });
    expect(events.find((e) => e.type === 'success')).toBeUndefined();
  });

  it('ignores a 150 ms blip on the right string', () => {
    const { engine, events } = rig(0);
    feedPluck(engine, 0, 0, 150);
    feedSilence(engine, 200, 600);
    expect(events.find((e) => e.type === 'success' || e.type === 'hint')).toBeUndefined();
    expect(engine.state).toBe('listening');
  });

  it('resets the hold when the pitch wanders between two strings', () => {
    const { engine, events } = rig(2); // target D3
    // Alternate 300 ms chunks of G3 and B3 for 1.5 s: no 600 ms hold on one.
    for (let chunk = 0; chunk < 5; chunk++) {
      feedPluck(engine, chunk % 2 === 0 ? 3 : 4, chunk * 310, 300);
    }
    expect(events.find((e) => e.type === 'success' || e.type === 'hint')).toBeUndefined();
  });

  it('ignores microphone input during its own playback and tail', () => {
    const { engine, events } = rig(5);
    feedPluck(engine, 5, 0, 1200);
    expect(events.find((e) => e.type === 'success')).toBeDefined();
    events.length = 0;
    engine.notifyPlayback(1300, 1800);
    // Kid (or speaker feedback) "plays" the next target during the ignore window.
    engine.beginRound();
    events.length = 0;
    feedPluck(engine, engine.target, 1400, 1200);
    expect(events.find((e) => e.type === 'success' || e.type === 'hint')).toBeUndefined();
    // After the window (1300 + 1800 + 300 = 3400) input counts again.
    feedPluck(engine, engine.target, 3500, 1200);
    expect(events.find((e) => e.type === 'success')).toBeDefined();
  });

  it('never asks for the same string twice in a row', () => {
    const events: GameEvent[] = [];
    let draw = 0.0; // constant rng: always string 0 -> picker must escape via fallback
    const engine = new GameEngine((e) => events.push(e), { rng: () => draw });
    engine.start();
    const first = engine.target;
    engine.beginRound();
    const second = engine.target;
    expect(first).toBe(0);
    expect(second).not.toBe(first);
  });
});
