// Cross-cutting audio/detection constants.
export const FRAME_SIZE = 4096; // ~85-95 ms per analysis frame; >= 2 periods of the low E (82.41 Hz)

export const DETECT_MIN_HZ = 65; // below the low E minus generous slack
export const DETECT_MAX_HZ = 420; // above the high E plus slack

// Accept a detected pitch only if the NSDF peak is at least this high;
// silence and background noise stay below it.
export const CLARITY_THRESHOLD = 0.6;

// How far (in cents) a plucked string may sit from nominal pitch and still count.
// Generous on purpose: kids' guitars are often badly out of tune. Neighbouring
// open strings are 400-500 cents apart, so up to 200 cents still maps to the
// nearest string unambiguously.
export const TOLERANCE_CENTS = 200;

// Beyond this (but within TOLERANCE_CENTS) the string still counts, and the
// game calls out that the string is really out of tune and suggests tune mode.
export const OUT_OF_TUNE_CENTS = 75;

// How long the pitch must stay stable on one string before it registers.
// Tunable: children let the note ring, transients must not count.
export const HOLD_MS = 400; // was 600: owner found the ring too hard to fill

// Within one hold the pitch must stay this steady (cents from the hold's
// running reference). Tuning may be far off (TOLERANCE_CENTS), but a real
// ringing string holds its pitch; noise and harmonics jump around.
export const STABILITY_CENTS = 40;

// Dropouts shorter than this (lost pitch frames) do not reset the hold.
export const DROPOUT_GRACE_MS = 150; // phone mics drop a frame or two on a real guitar

// A frame only feeds the hold while its RMS level stays above
// max(GATE_FLOOR_RMS, onsetPeak * GATE_RELATIVE) — a gate tied to the pluck's
// own onset level, so the natural decay still completes the hold while a
// muted or dying note drops out.
export const GATE_RELATIVE = 0.1;
// Was 0.004: on the owner's iPhone the high E decays to ~0.0025 RMS within
// ~300 ms while still giving a clean pitch, so the hold kept resetting.
// Room noise measured ~0.002; STABILITY_CENTS keeps noise from holding.
export const GATE_FLOOR_RMS = 0.0015;

// Ignore mic input while our own tone plays, plus this tail.
export const PLAYBACK_TAIL_MS = 300;

// --- Trumpet: hidden option, enabled with ?trumpet ---------------------------
// Calibrated from the owner's device telemetry (2026-11-21): a blast read
// 0.01–0.17 RMS with an unstable pitch in the guitar band (an octave-folded
// note around 530–680 Hz), sustained for about a second per blow. Owner
// found it unreliable on the real trumpet, so it is off by default.

// A blast must stay sustained this long. Longer than HOLD_MS so a plucked
// string, which is recognised by pitch, always wins first.
export const TRUMPET_HOLD_MS = 700;
// Ignore anything quieter than this as a blast.
export const TRUMPET_FLOOR_RMS = 0.005;
// The level must stay above this fraction of the blast's running peak; a
// plucked string decays below it within ~0.5 s, a blown note does not.
export const TRUMPET_SUSTAIN_RATIO = 0.45;
// A confident wide-range pitch above this cannot be an open guitar string
// (highest is E4 = 330 Hz, +200 cents ≈ 415 Hz): treat the frame as brass.
export const TRUMPET_MIN_HZ = 450;
// Wide-range detection band used for that check.
export const WIDE_MIN_HZ = 150;
export const WIDE_MAX_HZ = 2000;

// --- Play mode (songs) -------------------------------------------------------
// A note counts after ringing this long — shorter than Pluck mode's HOLD_MS so
// a song keeps flowing.
export const PLAY_HOLD_MS = 250;
// How far (cents) a played note may be from the written pitch. Was 60: on
// the owner's guitar nothing registered (2026-11-22), most likely because the
// open G string every song starts on sat further off than that. Neighbouring
// song notes are 100–200 cents apart, so 90 still rejects the next note on a
// guitar that is roughly in tune.
export const PLAY_TOLERANCE_CENTS = 90;

// Tune mode: within this many cents a string counts as in tune (✓).
export const TUNE_OK_CENTS = 7;
// ...and it must stay there this long before the "tuned" chime plays.
export const TUNE_CONFIRM_MS = 500;
// Repeated notes (E E E E) need a fresh pluck: after each counted note the
// level must rise to this multiple of its lowest point since then.
export const PLAY_ONSET_RATIO = 1.8;
