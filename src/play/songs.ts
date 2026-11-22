import { OPEN_STRINGS } from '../strings';

/**
 * Songs for Play mode. Each note is a pitch (MIDI number) plus its lyric
 * syllable; the string and fret to show are derived from the pitch
 * (`positionFor`), so the "number to hold" can never disagree with the melody.
 *
 * All songs sit in first position with frets 0–3 (easy for small hands),
 * mostly on the three highest strings (G, B, high E); the pumpkin song also
 * uses the open D string. Rests are folded into the note before them (the
 * replay just lets that note ring), so every note is something to pluck.
 * A melisma (one syllable over two notes) shows "–" on the second note.
 */

export interface SongNote {
  midi: number;
  syllable: string;
  /** Length in beats (1 = quarter note), for the replay's rhythm. */
  beats: number;
  /** Open-string index (0 = low E … 5 = high E), from positionFor(). */
  string: number;
  /** Fret to hold: 0 = open string. */
  fret: number;
}

export interface Song {
  id: string;
  title: string;
  figurine: string;
  /** Replay tempo, quarter notes per minute. */
  bpm: number;
  /** Beats per bar (time signature numerator, quarter-note beats). */
  beatsPerBar: number;
  notes: SongNote[];
}

/** MIDI numbers of the open strings, low E (E2) to high E (E4). */
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;

const NOTE_MIDI: Record<string, number> = {
  D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67,
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

/**
 * Build a song from "NOTE:syllable:beats" tokens, e.g. "G3:Al-:1 D4:Änt-:2".
 * Beats default to 1 (a quarter note); "0.5" is an eighth.
 */
function song(
  id: string,
  title: string,
  figurine: string,
  bpm: number,
  tokens: string,
  beatsPerBar = 4,
): Song {
  const notes = tokens
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [name, syllable, beats = '1'] = token.split(':');
      const midi = NOTE_MIDI[name];
      if (midi === undefined) throw new Error(`unknown note ${name}`);
      return { midi, syllable: syllable.replace(/_/g, ' '), beats: Number(beats), ...positionFor(midi) };
    });
  return { id, title, figurine, bpm, beatsPerBar, notes };
}

export const SONGS: Song[] = [
  // "Alle meine Entchen", Swiss German words, transposed to G so it starts on
  // the open G string. 4/4: G A B C | D(h) D(h) | E E E E | D(w) | E E E E |
  // D(w) | C C C C | B(h) B(h) | A A A A | G(w).
  song(
    'aentli',
    'Alli mini Äntli',
    '🦆',
    112,
    `G3:Al- A3:li B3:mi- C4:ni D4:Änt-:2 D4:li:2
     E4:schwüm- E4:med E4:uf E4:em D4:See:4
     E4:schwüm- E4:med E4:uf E4:em D4:See:4
     C4:Chöpf- C4:li C4:i C4:de B3:Was-:2 B3:ser:2
     A3:Schwänz- A3:li A3:i A3:d' G3:Höh:4`,
  ),
  // "Oh du goldigs Sünneli" (trad.), from the Chindermusigwält score (in C,
  // 4/4), transposed down a fourth to G. Lines A B A; "Sün-ne", "Tag" and
  // "u-se" carry two slurred notes; the rest after "schii-ne" is folded in.
  song(
    'sunneli',
    'Oh du goldigs Sünneli',
    '☀️',
    96,
    `G3:Oh:1.5 B3:du:0.5 D4:gol- G4:digs E4:Sün- G4:ne-:0.5 E4:–:0.5 D4:li:2
     C4:tue:1.5 D4:doch:0.5 B3:wi- G3:der A3:schii-:2 G3:ne:2
     D4:Bit- D4:te C4:bliib C4:de B3:ganz D4:Tag:0.5 B3:–:0.5 A3:da:2
     D4:das D4:mer C4:chönd C4:ve- B3:ru- D4:se:0.5 B3:–:0.5 A3:ga:2
     G3:Oh:1.5 B3:du:0.5 D4:gol- G4:digs E4:Sün- G4:ne-:0.5 E4:–:0.5 D4:li:2
     C4:tue:1.5 D4:doch:0.5 B3:wi- G3:der A3:schii-:2 G3:ne:2`,
  ),
  // "D'r Hans im Schnokeloch" (Alsatian trad.), 2/4 with an eighth pickup;
  // ABC (abcnotation) and the liederkiste score, transposed from G down a
  // fifth to C. Sung form: first line twice. The final "will" is shortened
  // to complete the pickup bar.
  song(
    'hans',
    "D'r Hans im Schnokeloch",
    '🐌',
    100,
    `G3:D'r:0.5 C4:Hans G4:im E4:Schno-:0.75 D4:ke-:0.25 C4:loch:0.5 C4:hett:0.5
     D4:al-:0.5 D4:les:0.5 G3:was:0.5 G3:er:0.5 C4:will:1.5
     G3:D'r:0.5 C4:Hans G4:im E4:Schno-:0.75 D4:ke-:0.25 C4:loch:0.5 C4:hett:0.5
     D4:al-:0.5 D4:les:0.5 G3:was:0.5 G3:er:0.5 C4:will:1.5
     E4:un:0.5 D4:was:0.5 E4:er:0.5 F4:hett:0.5 D4:des:0.5
     E4:will:0.5 F4:er:0.5 G4:nit:0.5 E4:un:0.5
     D4:was:0.5 E4:er:0.5 F4:will:0.5 D4:des:0.5
     E4:hett:0.5 F4:er:0.5 G4:nit:0.5 G3:D'r:0.5
     C4:Hans G4:im E4:Schno-:0.75 D4:ke-:0.25 C4:loch:0.5 C4:hett:0.5
     D4:al-:0.5 D4:les:0.5 G3:was:0.5 G3:er:0.5 C4:will:1.5`,
    2,
  ),
  // "Did You Ever See a Pumpkin" to the "Did You Ever See a Lassie" tune
  // (ABC from The Everyday Song Book, 1927), 3/4, in G an octave down so it
  // fits first position (D3–E4, with the open D string). The rests after
  // "all" are folded in; "eyes" and "nose" each take two tune notes.
  song(
    'pumpkin',
    'Did You Ever See a Pumpkin',
    '🎃',
    120,
    `G3:Did:0.5 B3:you:0.5 D4:ev-:1.5 E4:er:0.5 D4:see:0.5 C4:a:0.5
     B3:pump- G3:kin G3:a A3:pump- D3:kin D3:a B3:pump- G3:kin
     G3:Did:0.5 B3:you:0.5 D4:ev-:1.5 E4:er:0.5 D4:see:0.5 C4:a:0.5
     B3:pump- G3:kin G3:with A3:no D3:face D3:at G3:all:2
     G3:With A3:no D3:eyes:2 B3:no G3:nose:2 A3:no D3:mouth D3:and B3:no G3:teeth
     G3:Did:0.5 B3:you:0.5 D4:ev-:1.5 E4:er:0.5 D4:see:0.5 C4:a:0.5
     B3:pump- G3:kin G3:with A3:no D3:face D3:at G3:all:2`,
    3,
  ),
  // "Five Little Ducks" in C, from the owner's KidsPlayMusic tab sheet (first
  // position on the G, B and high E strings). The tab has no rhythm; it
  // follows the sheet's note spacing and the usual 4/4 tune:
  //   Five lit-tle ducks went | out one day,    ♩ ♪♪ ♩ ♩ | ♩ ♩ 𝅗𝅥
  //   O-ver the hills and | far a-way.           ♩ ♪♪ ♩ ♩ | ♩ ♩ 𝅗𝅥
  //   Mo-ther duck said "Quack, | quack, quack, quack". But   ♪♪ ♩ ♩ ♩ | ♩ ♩ ♩ ♩
  //   on-ly four lit-tle | ducks came back.      ♩ ♩ ♩ ♪♪ | ♩ ♩ 𝅗𝅥
  song(
    'ducks',
    '5 Little Ducks',
    '🐥',
    104,
    `E4:Five G3:lit-:0.5 G3:tle:0.5 G3:ducks G3:went E4:out D4:one D4:day:2
     D4:O- G3:ver:0.5 G3:the:0.5 G3:hills G3:and D4:far C4:a- C4:way:2
     E4:Mo-:0.5 E4:ther:0.5 G3:duck G3:said E4:Quack E4:quack D4:quack D4:quack D4:But
     G4:on- G4:ly G4:four F4:lit-:0.5 F4:tle:0.5 E4:ducks D4:came C4:back:2`,
  ),
  // "Happy Birthday to You" (public domain), 3/4, one octave below its usual
  // C so it fits first position: G3–G4 on the G, B and high E strings.
  // Pickup "Hap-py" is a dotted eighth + sixteenth; "Na- me" is the
  // birthday child's name (two syllables).
  //   G G | A G C | B — G G | A G D | C — G G | G' E C | B A F F | E C D | C —
  song(
    'birthday',
    'Happy Birthday',
    '🎂',
    96,
    `G3:Hap-:0.75 G3:py:0.25 A3:birth- G3:day C4:to B3:you:2
     G3:Hap-:0.75 G3:py:0.25 A3:birth- G3:day D4:to C4:you:2
     G3:Hap-:0.75 G3:py:0.25 G4:birth- E4:day C4:dear B3:Na- A3:me
     F4:Hap-:0.75 F4:py:0.25 E4:birth- C4:day D4:to C4:you:2`,
    3,
  ),
];

/** Figurine of the string a note is played on (reuses the Pluck-mode emojis). */
export function stringFigurine(note: SongNote): string {
  return OPEN_STRINGS[note.string].figurine;
}
