import { describe, expect, it } from 'vitest';
import { GameEngine, isHarmonicOf, TRUMPET } from '../game/engine';
import type { GameEvent } from '../game/engine';
import { detectPitch } from '../pitch/detect';
import { rms, synthesizeBlow, synthesizePluck, frameAt } from '../pitch/synth';
import { OPEN_STRINGS } from '../strings';
import { FRAME_SIZE, WIDE_MAX_HZ, WIDE_MIN_HZ } from '../config';

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
  detuneCents = 0,
): void {
  const frequency = OPEN_STRINGS[stringIndex].frequency * Math.pow(2, detuneCents / 1200);
  const signal = synthesizePluck(frequency, SR, durationMs / 1000 + 0.1);
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
    const { engine, events } = rig(4); // next round asks for string 5 (rig's 2nd draw)
    feedPluck(engine, 4, 0, 1200);
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

  it('accepts a badly tuned string (−150 cents) and calls out that it is out of tune', () => {
    const { engine, events } = rig(1);
    feedPluck(engine, 1, 0, 1200, -150);
    const success = events.find((e) => e.type === 'success');
    expect(success).toMatchObject({ target: 1, outOfTune: true });
    if (success?.type === 'success') expect(success.cents).toBeLessThan(-120);
  });

  it('accepts a slightly detuned string (+40 cents) without a call-out', () => {
    const { engine, events } = rig(3);
    feedPluck(engine, 3, 0, 1200, 40);
    expect(events.find((e) => e.type === 'success')).toMatchObject({ target: 3, outOfTune: false });
  });

  it('does not fill the ring while a wrong string is held', () => {
    const { engine, events } = rig(0);
    feedPluck(engine, 3, 0, 1200); // G3: not a harmonic of E2
    const progress = events.filter((e) => e.type === 'hold').map((e) => (e.type === 'hold' ? e.progress : 0));
    expect(progress.length).toBeGreaterThan(0);
    expect(Math.max(...progress)).toBe(0);
    expect(events.find((e) => e.type === 'hint')).toMatchObject({ heard: 3, target: 0 });
  });

  it('does not hint when the held string is a harmonic of the target (A2 -> high E)', () => {
    const { engine, events } = rig(1);
    feedPluck(engine, 5, 0, 1200);
    expect(events.find((e) => e.type === 'hint')).toBeUndefined();
    expect(events.find((e) => e.type === 'harmonic')).toMatchObject({ heard: 5, target: 1 });
    expect(engine.state).toBe('listening');
  });

  it('isHarmonicOf knows the open-string harmonic coincidences', () => {
    expect(isHarmonicOf(4, 0)).toBe(true); // B3 ≈ 3 × E2
    expect(isHarmonicOf(5, 0)).toBe(true); // E4 = 4 × E2
    expect(isHarmonicOf(5, 1)).toBe(true); // E4 ≈ 3 × A2
    expect(isHarmonicOf(3, 0)).toBe(false);
    expect(isHarmonicOf(0, 5)).toBe(false);
  });

  describe('hidden ?trumpet option', () => {
    /** Signal through the pipeline including the wide-range pitch (trumpet option). */
    function feedSignal(engine: GameEngine, signal: Float32Array, startMs: number, durationMs: number): void {
      for (let t = startMs; t < startMs + durationMs; t += STEP) {
        const pos = Math.round(((t - startMs) / 1000) * SR);
        const frame = frameAt(signal, pos - FRAME_SIZE, FRAME_SIZE);
        const pitch = detectPitch(frame, SR);
        const wide = detectPitch(frame, SR, { minFrequency: WIDE_MIN_HZ, maxFrequency: WIDE_MAX_HZ });
        engine.processFrame(pitch?.frequency ?? null, rms(frame), t, wide?.frequency ?? null);
      }
    }

    function trumpetRig(target: number): { engine: GameEngine; events: GameEvent[] } {
      const events: GameEvent[] = [];
      const engine = new GameEngine((e) => events.push(e), { trumpet: true, rng: () => (target + 0.5) / 7 });
      engine.start();
      events.length = 0;
      return { engine, events };
    }

    it('is off by default: never asks for the trumpet, a blast is not a target', () => {
      const events: GameEvent[] = [];
      let i = 0;
      const engine = new GameEngine((e) => events.push(e), { rng: () => (i++ % 7) / 7 + 0.99 / 7 });
      for (let r = 0; r < 30; r++) engine.beginRound();
      const targets = events.flatMap((e) => (e.type === 'round' ? [e.target] : []));
      expect(targets).not.toContain(TRUMPET);
      events.length = 0;
      feedSignal(engine, synthesizeBlow(530, SR, 1.2), 0, 1200);
      expect(events.find((e) => (e.type === 'hint' && e.heard === TRUMPET) || e.type === 'success')).toBeUndefined();
    });

    it('celebrates the trumpet when it is the target and a blast is held', () => {
      const { engine, events } = trumpetRig(TRUMPET);
      expect(engine.target).toBe(TRUMPET);
      feedSignal(engine, synthesizeBlow(530, SR, 1.2), 0, 1200);
      expect(events.find((e) => e.type === 'success')).toMatchObject({ target: TRUMPET });
    });

    it('fills the ring while the trumpet target is blown', () => {
      const { engine, events } = trumpetRig(TRUMPET);
      feedSignal(engine, synthesizeBlow(530, SR, 0.5), 0, 500); // too short to confirm
      const progress = events.flatMap((e) => (e.type === 'hold' ? [e.progress] : []));
      expect(Math.max(...progress)).toBeGreaterThan(0.4);
      expect(events.find((e) => e.type === 'success')).toBeUndefined();
    });

    it('a blast during a string round gives the gentle hint', () => {
      const { engine, events } = trumpetRig(2);
      feedSignal(engine, synthesizeBlow(530, SR, 1.2), 0, 1200);
      expect(events.find((e) => e.type === 'hint')).toMatchObject({ heard: TRUMPET, target: 2 });
    });

    it('a plucked string during a trumpet round is a string, not the trumpet', () => {
      for (const string of [0, 5]) {
        const { engine, events } = trumpetRig(TRUMPET);
        feedPluck(engine, string, 0, 1500);
        expect(events.find((e) => e.type === 'success'), `string ${string}`).toBeUndefined();
        expect(events.find((e) => e.type === 'hint'), `string ${string}`).toMatchObject({ heard: string, target: TRUMPET });
      }
    });
  });
});
