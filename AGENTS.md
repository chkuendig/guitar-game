# AGENTS.md

Conventions for working in this repo. `CLAUDE.md` is a symlink to this file.

## Product

Web-only guitar game for a young child: teach the six open strings
(E2 82.41, A2 110.00, D3 146.83, G3 196.00, B3 246.94, E4 329.63 Hz).
Open strings only, no fretting, no chords, no fail states, no timers.
`SPEC.md` is the binding product brief. All user-facing text lives in
`src/i18n.ts` (German default, English via `?lang=en`).

## Deployment target

**GitHub Pages** at `https://<user>.github.io/guitar-game/` — the build must
stay subpath-safe: relative asset base (`base: './'` in `vite.config.ts`), no
absolute `/...` asset paths anywhere. Do not introduce backend dependencies.
`.github/workflows/pages.yml` deploys on push to `main`.

## Module layout

Keep modules separate and DOM-free below the UI layer:

- `src/config.ts` — all tunable constants (frame size, tolerance, `HOLD_MS`,
  gate levels, playback tail). Tune gameplay here, not in the modules.
- `src/pitch/detect.ts` — MPM pitch detection. Pure function on
  `Float32Array` + sample rate. Must stay DOM/Web-Audio-free.
- `src/pitch/matcher.ts` — frequency → nearest open string, cents, tolerance.
- `src/pitch/synth.ts` — pure signal synthesis + RMS; shared by tests and
  simulation mode.
- `src/game/hold.ts` — time-driven hold/debounce logic (pure, testable).
- `src/game/engine.ts` — game state machine (pure: no DOM, no timers, no
  audio; the UI drives it with timestamped frames and events).
- `src/audio/mic.ts` — getUserMedia capture only.
- `src/audio/pluck.ts` — Karplus-Strong pluck synth.
- `src/sim.ts` — simulation mode source (synthetic plucks, same pipeline).
- `src/play/` — Play mode: `songs.ts` (melodies as pitch + syllable; string
  and fret are derived by `positionFor`) and `song-engine.ts` (pure note-by-note
  engine; repeated notes need a fresh pluck).
- `src/ui/` — DOM/canvas rendering and the rAF loop. Only this layer touches
  the DOM.
- `src/i18n.ts`, `src/strings.ts` — text and string data (colors, figurines).

## Commands

- `npm run dev` — vite dev server on 0.0.0.0:5173. The Paseo `dev`
  workspace script runs it on fixed port **5191** instead: the owner tests on
  a phone via https://guitar.kuendig.host (Cloudflare tunnel → paseo:5191;
  Paseo's own service proxy rejects the HMR websocket). Keep that port in
  `paseo.json`, and don't start a second dev server.
- `?play` turns off live reload for that page (for play-testing on a device).
- `npm test` — vitest unit tests.
- `npm run build` — `tsc --noEmit` + vite build.

Tests synthesize their signals in `src/pitch/synth.ts` — no fixtures, no
network. New detection/matching behavior gets a unit test there.

## Testing without a guitar

`?sim=1`: keys 1–6 or the on-screen picker produce decaying synthetic plucks
through the same pipeline as the mic; in Play mode key **N** (or the 🎵 N
button) plucks the note the song is waiting for. Works headless.

## Git

Commits on `main`, small logical steps, author
`Christian Kündig <christian@kuendig.info>`, trailer
`Assisted-by: <agent>:<model>`. Remote: `github.com/chkuendig/guitar-game`
(public). Every push to `main` deploys to GitHub Pages at
https://guitar.kuendig.io via `.github/workflows/pages.yml` (tests + build
run on GitHub-hosted runners), so push only with the owner's go-ahead.

## Host rules (shared machine)

Before `npm install`, `vitest` or `vite build`, check that neither CI runner
is busy: `docker top github-runner -eo pid,comm` and
`docker top github-runner-model -eo pid,comm`. If either shows `Runner.Worker`,
wait and recheck; keep editing files meanwhile. Never use `-j` above 3.
