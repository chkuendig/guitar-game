import { OPEN_STRINGS } from '../strings';

/**
 * Songs for Play mode. Each note is a pitch (MIDI number) plus its lyric
 * syllable; the string and fret to show are derived from the pitch
 * (`positionFor`), so the "number to hold" can never disagree with the melody.
 *
 * Both songs are traditional (public domain) and sit in first position on the
 * three highest strings (G, B, high E) with frets 0–3: easy for small hands.
 */

export interface SongNote {
  midi: number;
  syllable: string;
  /** Open-string index (0 = low E … 5 = high E), from positionFor(). */
  string: number;
  /** Fret to hold: 0 = open string. */
  fret: number;
}

export interface Song {
  id: string;
  title: string;
  figurine: string;
  notes: SongNote[];
}

/** MIDI numbers of the open strings, low E (E2) to high E (E4). */
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;

const NOTE_MIDI: Record<string, number> = {
  G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65,
};

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Where to play a pitch: the string giving the lowest fret (0–4), so open
 * strings and first position win. Throws for pitches outside that range.
 */
export function positionFor(midi: number): { string: number; fret: number } {
  let best: { string: number; fret: number } | null = null;
  OPEN_STRING_MIDI.forEach((open, string) => {
    const fret = midi - open;
    if (fret >= 0 && fret <= 4 && (best === null || fret < best.fret)) best = { string, fret };
  });
  if (!best) throw new Error(`no first-position fingering for MIDI ${midi}`);
  return best;
}

/** Build a song from "NOTE:syllable" tokens, e.g. "G3:Al A3:li". */
function song(id: string, title: string, figurine: string, tokens: string): Song {
  const notes = tokens
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [name, syllable] = token.split(':');
      const midi = NOTE_MIDI[name];
      if (midi === undefined) throw new Error(`unknown note ${name}`);
      return { midi, syllable: syllable.replace(/_/g, ' '), ...positionFor(midi) };
    });
  return { id, title, figurine, notes };
}

export const SONGS: Song[] = [
  // "Alle meine Entchen", Swiss German words, transposed to G so it starts on
  // the open G string: G A B C D D | E E E E D | E E E E D | C C C C B B | A A A A G.
  song(
    'aentli',
    'Alli mini Äntli',
    '🦆',
    `G3:Al- A3:li B3:mi- C4:ni D4:Änt- D4:li
     E4:schwüm- E4:med E4:uf E4:em D4:See
     E4:schwüm- E4:med E4:uf E4:em D4:See
     C4:Chöpf- C4:li C4:i C4:de B3:Was- B3:ser
     A3:Schwänz- A3:li A3:i A3:d' G3:Höh`,
  ),
  // "Five Little Ducks", in C, lines 1–3 after the Skoove beginner score. The
  // score's image stops after the third "Quack"; the 4th "Quack" and the last
  // line mirror lines 1 and 2, as the tune repeats its phrases.
  song(
    'ducks',
    '5 Little Ducks',
    '🐥',
    `G3:Five E4:lit- E4:tle E4:ducks F4:went E4:swim- D4:ming D4:one D4:day
     G3:O- D4:ver D4:the D4:hills E4:and D4:far C4:a- C4:way
     G3:Moth- G3:er E4:Duck E4:said F4:Quack E4:Quack D4:Quack D4:Quack
     G3:But D4:on- D4:ly D4:four E4:lit- E4:tle D4:ducks C4:came C4:back`,
  ),
];

/** Figurine of the string a note is played on (reuses the Pluck-mode emojis). */
export function stringFigurine(note: SongNote): string {
  return OPEN_STRINGS[note.string].figurine;
}
