// Cross-cutting audio/detection constants.
export const FRAME_SIZE = 4096; // ~85-95 ms per analysis frame; >= 2 periods of the low E (82.41 Hz)

export const DETECT_MIN_HZ = 65; // below the low E minus generous slack
export const DETECT_MAX_HZ = 420; // above the high E plus slack

// Accept a detected pitch only if the NSDF peak is at least this high;
// silence and background noise stay below it.
export const CLARITY_THRESHOLD = 0.6;

// How far (in cents) a plucked string may sit from nominal pitch and still count.
export const TOLERANCE_CENTS = 60;

// How long the pitch must stay stable on one string before it registers.
// Tunable: children let the note ring, transients must not count.
export const HOLD_MS = 600;

// Dropouts shorter than this (lost pitch frames) do not reset the hold.
export const DROPOUT_GRACE_MS = 100;

// A frame only feeds the hold while its RMS level stays above
// max(GATE_FLOOR_RMS, onsetPeak * GATE_RELATIVE) — a gate tied to the pluck's
// own onset level, so the natural decay still completes the hold while a
// muted or dying note drops out.
export const GATE_RELATIVE = 0.1;
export const GATE_FLOOR_RMS = 0.004;

// Ignore mic input while our own tone plays, plus this tail.
export const PLAYBACK_TAIL_MS = 300;
