/**
 * All user-facing text lives here. German is the default; English is available
 * via ?lang=en or an English browser language.
 */
export type Lang = 'de' | 'en';

export interface Strings {
  title: string;
  start: string;
  listening: string;
  success: string;
  hintWas: string;
  hintTry: string;
  tune: string;
  back: string;
  tunePrompt: string;
  inTune: string;
  tooLow: string;
  tooHigh: string;
  simHint: string;
  micDenied: string;
  /** Call-out for a string far from its pitch; {color} and {dir} are filled in. */
  outOfTune: string;
  outOfTuneLow: string;
  outOfTuneHigh: string;
  /** Color names per string index, used in the gentle hint. */
  colorNames: string[];
  /** Name of the trumpet target in hints (hidden ?trumpet option). */
  trumpetName: string;
  /** "Tune · Pluck · Play" — the three modes, also the app's subtitle. */
  subtitle: string;
  modeTune: string;
  modePluck: string;
  modePlay: string;
  pickSong: string;
  /** Prompt under the figurine in Play mode; {fret} is filled in. */
  holdFret: string;
  openString: string;
  songDone: string;
  songs: string;
  simPlayHint: string;
}

export const STRINGS: Record<Lang, Strings> = {
  de: {
    title: 'Guitar TPP',
    start: "Los geht's!",
    listening: 'Lass die Saite klingen …',
    success: 'Super!',
    hintWas: 'Das war',
    hintTry: 'versuch',
    tune: 'Stimmen',
    back: 'Zurück',
    tunePrompt: 'Zupfe eine Saite',
    inTune: 'perfekt!',
    tooLow: 'etwas tiefer',
    tooHigh: 'etwas höher',
    simHint: 'Zum Üben: Tasten 1–6',
    micDenied: 'Mikrofon geht nicht 😢 – Übungs-Modus ist an.',
    outOfTune: 'Die Saite {color} ist stark verstimmt ({dir}) – stimm sie mit 🎸',
    outOfTuneLow: 'zu tief',
    outOfTuneHigh: 'zu hoch',
    colorNames: ['rot', 'orange', 'gelb', 'grün', 'blau', 'lila'],
    trumpetName: 'die Trompete',
    subtitle: 'Stimmen · Zupfen · Spielen',
    modeTune: 'Stimmen',
    modePluck: 'Zupfen',
    modePlay: 'Spielen',
    pickSong: 'Welches Lied?',
    holdFret: 'Finger auf Bund {fret}',
    openString: 'leere Saite',
    songDone: 'Bravo, das ganze Lied! 🎉',
    songs: 'Lieder',
    simPlayHint: 'Taste N = nächster Ton',
  },
  en: {
    title: 'Guitar TPP',
    start: "Let's play!",
    listening: 'Let the string ring …',
    success: 'Yay!',
    hintWas: 'That was',
    hintTry: 'try',
    tune: 'Tune',
    back: 'Back',
    tunePrompt: 'Pluck a string',
    inTune: 'perfect!',
    tooLow: 'a bit low',
    tooHigh: 'a bit high',
    simHint: 'Practice: keys 1–6',
    micDenied: 'Microphone unavailable 😢 — practice mode is on.',
    outOfTune: 'The {color} string is really out of tune ({dir}) — tune it with 🎸',
    outOfTuneLow: 'too low',
    outOfTuneHigh: 'too high',
    colorNames: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'],
    trumpetName: 'the trumpet',
    subtitle: 'Tune · Pluck · Play',
    modeTune: 'Tune',
    modePluck: 'Pluck',
    modePlay: 'Play',
    pickSong: 'Which song?',
    holdFret: 'Hold fret {fret}',
    openString: 'open string',
    songDone: 'You played the whole song! 🎉',
    songs: 'Songs',
    simPlayHint: 'Key N = next note',
  },
};

export function pickLang(params: URLSearchParams): Lang {
  const param = params.get('lang');
  if (param === 'en' || param === 'de') return param;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'de';
  return nav?.toLowerCase().startsWith('en') ? 'en' : 'de';
}
