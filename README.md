# Guitar Game

A browser game that teaches a young child the six open guitar strings
(E2 A2 D3 G3 B3 E4). The game asks for one string — shown as its own color and
figurine — listens through the microphone, and when the right note rings long
enough it plays the tone back (Karplus-Strong synth) with a little celebration.
No fail states, no timers. Open strings only, one hand.

Text is minimal and lives in `src/i18n.ts`: German (default) and English
(`?lang=en`).

## Run

```sh
npm install
npm run dev   # vite on 0.0.0.0:5173 (also exposed as the Paseo `dev` script)
```

Open `http://localhost:5173` and press **Start** (the button unlocks the
microphone and audio, as required on iOS). Optional URL parameters:

- `?sim=1` — simulation mode: no microphone needed. Keys **1–6** (low E to
  high E) or the on-screen string picker produce synthetic plucks that run
  through the exact same detection pipeline as the mic.
- `?lang=en` — English text (default is German).

## Test / build

```sh
npm test          # vitest unit tests (detector, matcher, hold, engine)
npm run build     # tsc --noEmit + vite build into dist/
```

## How detection works

1. **Frames**: the mic (or simulator) is read as 4096-sample time-domain
   windows (~90 ms), analyzed about every 45 ms.
2. **Pitch**: each frame runs through a pure
   [McLeod Pitch Method](https://www.cycfi.com/2018/03/fast-and-accurate-pitch-tracking/)
   (MPM) implementation (`src/pitch/detect.ts`) — normalized square difference
   in the time domain, not an FFT peak. This survives the strong harmonics of a
   child's guitar, including a low E whose fundamental is weaker than its
   second harmonic (the classic octave-error trap). Frames below a clarity
   threshold (silence, noise) report "no pitch".
3. **String match**: the frequency maps to the nearest open string with its
   cents deviation; more than 60 cents away counts as no match
   (`src/pitch/matcher.ts`).
4. **Hold**: a string only registers after its pitch stays on the same string
   for ~600 ms (`HOLD_MS` in `src/config.ts`) while staying above a level gate
   that follows the pluck's own onset, so the natural decay still completes the
   hold but a muted or dying note does not. Pitch dropouts under 100 ms are
   tolerated; moving to another string resets the hold (`src/game/hold.ts`).
   The progress ring around the figurine shows the hold filling up.
5. **Game**: prompt → listening → success (tone + celebration) or gentle hint
   (wrong string, held for the same time) → next round (`src/game/engine.ts`).
   The engine ignores mic input while its own pluck tone plays, plus a short
   tail, so playback can never trigger a detection.

## Playing on a phone or tablet

`getUserMedia` needs a secure context:

- **GitHub Pages (intended for the iPad/phone)** — see below; Pages serves
  HTTPS, so the microphone works there.
- `localhost` works everywhere for development.
- The Paseo dev proxy URL (HTTPS) also works if it is reachable from the device.

## Deploying

The build is subpath-safe (relative asset base in `vite.config.ts`). To deploy
to `https://<user>.github.io/guitar-game/`:

1. Create the GitHub repo `guitar-game` and push `main`.
2. In the repo: Settings → Pages → Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). `.github/workflows/pages.yml`
   runs `npm ci`, `npm test`, `npm run build` and deploys `dist/`.

## Known limitations

- Untested so far with a real microphone and a real (child's) guitar; tolerance
  and gate constants in `src/config.ts` are the tuning knobs.
- iOS Safari requires the Start button before any audio; keep it that way.
