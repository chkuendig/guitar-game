# Guitar Game — kickoff spec

A browser game that teaches a young child the six open guitar strings.

## Core loop

1. The game asks the child to pluck one specific string. Show it big and clear:
   the string highlighted on a drawn guitar neck/headstock, plus its own color
   and figurine (an animal or character). Keep text optional, because the child
   may not read yet.
2. The browser listens through the microphone (Web Audio + `getUserMedia`) and
   detects the pitch, like an online guitar tuner (inspiration:
   https://guitartuna.com/online-guitar-tuner).
3. When the right string rings, play its tone back (synthesized, a pleasant
   plucked sound such as Karplus-Strong) and pop up that string's figurine with
   a small celebration. A wrong string gets a gentle, non-punishing hint
   ("that was the blue one, try the red one").
4. Next round.

## Scope

- **Open strings only, one hand.** No fretting, no chords. Standard tuning:
  E2 82.41 Hz, A2 110.00, D3 146.83, G3 196.00, B3 246.94, E4 329.63.
- A real kid's guitar will be slightly out of tune. Match to the nearest open
  string with a generous tolerance, and offer a simple optional "tune mode"
  meter.
- Web only. No backend. Must work on a tablet or phone browser (iPad Safari,
  Android Chrome) as well as desktop.

## Technical notes

- `getUserMedia` needs a secure context (localhost or HTTPS). Microphone and
  audio playback must start from a user gesture ("Start" button), especially
  on iOS.
- Don't let the game's own playback trigger detection: mute or ignore input
  while the tone plays and briefly afterwards.
- Pitch detection must be robust to the low E string's strong harmonics, which
  cause octave errors. Use YIN, MPM or similar, not a naive FFT peak, and
  require a stable pitch over a few frames before accepting it.
