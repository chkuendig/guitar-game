import { describe, expect, it } from 'vitest';
import { SongEngine } from '../play/song-engine';
import type { SongEvent } from '../play/song-engine';
import { SONGS, midiToFrequency, positionFor } from '../play/songs';
import type { Song } from '../play/songs';
import { detectPitch } from '../pitch/detect';
import { frameAt, rms, synthesizePluck } from '../pitch/synth';
import { FRAME_SIZE } from '../config';

const SR = 44100;
const STEP = 45;

/**
 * Render plucks into one signal. A pluck replaces whatever was sounding
 * (like re-plucking: the old note is cut), so repeated notes get a fresh attack.
 */
function render(plucks: { midi: number; atMs: number }[], totalMs: number): Float32Array {
  const out = new Float32Array(Math.round((totalMs / 1000) * SR));
  plucks.forEach((p, i) => {
    const start = Math.round((p.atMs / 1000) * SR);
    const end = i + 1 < plucks.length ? Math.round((plucks[i + 1].atMs / 1000) * SR) : out.length;
    const tone = synthesizePluck(midiToFrequency(p.midi), SR, (end - start) / SR + 0.01);
    for (let j = start; j < end && j < out.length; j++) out[j] = tone[j - start];
  });
  return out;
}

/** Stream a signal through the app's pipeline into the engine. */
function feed(engine: SongEngine, signal: Float32Array, totalMs: number): void {
  for (let t = 0; t < totalMs; t += STEP) {
    const pos = Math.round((t / 1000) * SR);
    const frame = frameAt(signal, pos - FRAME_SIZE, FRAME_SIZE);
    const pitch = detectPitch(frame, SR);
    engine.processFrame(pitch?.frequency ?? null, rms(frame), t);
  }
}

function rig(song: Song): { engine: SongEngine; events: SongEvent[] } {
  const events: SongEvent[] = [];
  const engine = new SongEngine((e) => events.push(e));
  engine.start(song);
  return { engine, events };
}

const tiny = (midis: number[]): Song => ({
  id: 'test',
  title: 'test',
  figurine: '🎵',
  bpm: 100,
  beatsPerBar: 4,
  notes: midis.map((midi, i) => ({ midi, syllable: String(i), beats: 1, ...positionFor(midi) })),
});

describe('songs', () => {
  it('places every note in first position (frets 0–3, D string and up)', () => {
    for (const song of SONGS) {
      for (const note of song.notes) {
        const min = song.id === 'pumpkin' ? 2 : 3; // only the pumpkin needs the D string
        expect(note.string, `${song.id} ${note.syllable}`).toBeGreaterThanOrEqual(min);
        expect(note.fret, `${song.id} ${note.syllable}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('shows the expected string and fret for each pitch', () => {
    // G3 open G, A3 G-2, B3 open B, C4 B-1, D4 B-3, E4 open high E, F4 E-1
    expect(positionFor(55)).toEqual({ string: 3, fret: 0 });
    expect(positionFor(57)).toEqual({ string: 3, fret: 2 });
    expect(positionFor(59)).toEqual({ string: 4, fret: 0 });
    expect(positionFor(60)).toEqual({ string: 4, fret: 1 });
    expect(positionFor(62)).toEqual({ string: 4, fret: 3 });
    expect(positionFor(64)).toEqual({ string: 5, fret: 0 });
    expect(positionFor(65)).toEqual({ string: 5, fret: 1 });
  });

  it('Alli mini Äntli is the "Alle meine Entchen" melody in G', () => {
    const aentli = SONGS.find((s) => s.id === 'aentli')!;
    const names = aentli.notes.map((n) => n.midi);
    // G A B C D D | E E E E D | E E E E D | C C C C B B | A A A A G
    expect(names).toEqual([
      55, 57, 59, 60, 62, 62, 64, 64, 64, 64, 62, 64, 64, 64, 64, 62, 60, 60, 60, 60, 59, 59, 57, 57, 57, 57, 55,
    ]);
  });
});

describe('song data', () => {
  it('5 Little Ducks matches the KidsPlayMusic tab (strings and frets)', () => {
    const ducks = SONGS.find((s) => s.id === 'ducks')!;
    // [string, fret] per note — 5 = high E, 4 = B, 3 = G
    const tab = ducks.notes.map((n) => `${n.string}:${n.fret}`).join(' ');
    expect(tab).toBe(
      [
        '5:0 3:0 3:0 3:0 3:0 5:0 4:3 4:3', // Five little ducks went out one day
        '4:3 3:0 3:0 3:0 3:0 4:3 4:1 4:1', // Over the hills and far away
        '5:0 5:0 3:0 3:0 5:0 5:0 4:3 4:3 4:3', // Mother duck said quack quack quack quack. But
        '5:3 5:3 5:3 5:1 5:1 5:0 4:3 4:1', // only four little ducks came back
      ].join(' '),
    );
  });

  it('every song fills whole bars of its time signature', () => {
    for (const song of SONGS) {
      const beats = song.notes.reduce((sum, n) => sum + n.beats, 0);
      expect(beats % song.beatsPerBar, song.id).toBe(0);
    }
    const total = (id: string) => SONGS.find((s) => s.id === id)!.notes.reduce((t, n) => t + n.beats, 0);
    expect(total('sunneli')).toBe(48);
    expect(total('hans')).toBe(32);
    expect(total('pumpkin')).toBe(48);
    expect(SONGS.find((s) => s.id === 'birthday')!.notes.reduce((t, n) => t + n.beats, 0)).toBe(24);
    expect(SONGS.find((s) => s.id === 'aentli')!.notes.reduce((t, n) => t + n.beats, 0)).toBe(40);
    expect(SONGS.find((s) => s.id === 'ducks')!.notes.reduce((t, n) => t + n.beats, 0)).toBe(32);
  });
});

describe('more songs follow their sources', () => {
  const midis = (id: string) => SONGS.find((s) => s.id === id)!.notes.map((n) => n.midi);

  it('Sünneli: lines A B A of the score, a fourth down (C → G)', () => {
    const a = [55, 59, 62, 67, 64, 67, 64, 62, 60, 62, 59, 55, 57, 55];
    const b = [62, 62, 60, 60, 59, 62, 59, 57, 62, 62, 60, 60, 59, 62, 59, 57];
    expect(midis('sunneli')).toEqual([...a, ...b, ...a]);
  });

  it('Hansdampf im Schnäggeloch: the ABC tune a fifth down (G → C), first line twice', () => {
    // "Hans-dampf" splits the tune's first quarter (C) into two eighths.
    const line = [60, 60, 67, 64, 62, 60, 60, 62, 62, 55, 55, 60];
    const middle = [64, 62, 64, 65, 62, 64, 65, 67, 64, 62, 64, 65, 62, 64, 65, 67];
    expect(midis('hans')).toEqual([55, ...line, 55, ...line, ...middle, 55, ...line]);
    expect(SONGS.find((s) => s.id === 'hans')!.notes).toHaveLength(55); // one per syllable
  });

  it('Pumpkin: the Lassie tune an octave down, with the open D string', () => {
    const intro = [55, 59, 62, 64, 62, 60];
    const ending = [59, 55, 55, 57, 50, 50, 55];
    expect(midis('pumpkin')).toEqual([
      ...intro, 59, 55, 55, 57, 50, 50, 59, 55,
      ...intro, ...ending,
      55, 57, 50, 59, 55, 57, 50, 50, 59, 55,
      ...intro, ...ending,
    ]);
    expect(positionFor(50)).toEqual({ string: 2, fret: 0 });
  });
});

describe('SongEngine', () => {
  it('walks through a whole song played note by note, then reports done', () => {
    const song = SONGS.find((s) => s.id === 'aentli')!;
    const { engine, events } = rig(song);
    const gap = 700;
    const plucks = song.notes.map((n, i) => ({ midi: n.midi, atMs: i * gap }));
    const total = song.notes.length * gap + 400;
    feed(engine, render(plucks, total), total);
    const indices = events.flatMap((e) => (e.type === 'note' ? [e.index] : []));
    expect(indices).toEqual(song.notes.map((_, i) => i));
    expect(events[events.length - 1]).toEqual({ type: 'done' });
  });

  it('does not advance on a wrong note', () => {
    const { engine, events } = rig(tiny([55, 57])); // G3 then A3
    feed(engine, render([{ midi: 59, atMs: 0 }], 1500), 1500); // plays B3
    expect(engine.index).toBe(0);
    expect(events.filter((e) => e.type === 'note')).toHaveLength(1); // only the start
  });

  it('a single ringing note counts once, even when the next note is the same', () => {
    const { engine } = rig(tiny([64, 64, 64]));
    feed(engine, render([{ midi: 64, atMs: 0 }], 2000), 2000);
    expect(engine.index).toBe(1);
  });

  it('repeated notes count again after a fresh pluck', () => {
    const { engine, events } = rig(tiny([64, 64, 64, 62]));
    const plucks = [0, 700, 1400, 2100].map((atMs, i) => ({ midi: [64, 64, 64, 62][i], atMs }));
    feed(engine, render(plucks, 2900), 2900);
    expect(engine.index).toBe(4);
    expect(events[events.length - 1]).toEqual({ type: 'done' });
  });

  it('tolerates a slightly out-of-tune note (+40 cents)', () => {
    const { engine } = rig(tiny([62, 64]));
    const signal = synthesizePluck(midiToFrequency(62) * Math.pow(2, 40 / 1200), SR, 1.2);
    feed(engine, signal, 1200);
    expect(engine.index).toBe(1);
  });
});
