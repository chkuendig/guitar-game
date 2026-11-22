/**
 * Short bell-like chimes for Tune mode (an original sound, Web Audio
 * oscillators only): `playTunedChime` when one string is in tune,
 * `playAllTunedChime` when all six are. Each returns its length in ms, so the
 * tuner can ignore the microphone while it plays.
 */
function bell(ctx: AudioContext, freq: number, start: number, length: number, gain: number): void {
  for (const [ratio, level] of [
    [1, 1],
    [2.76, 0.25], // a slightly inharmonic partial gives the "bell" colour
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain * level, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0005, start + length);
    osc.connect(env).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }
}

/** Two rising notes: "ding-ding". */
export function playTunedChime(ctx: AudioContext): number {
  const t = ctx.currentTime + 0.02;
  bell(ctx, 1046.5, t, 0.45, 0.18); // C6
  bell(ctx, 1568, t + 0.12, 0.6, 0.18); // G6
  return 750;
}

/** All strings in tune: a quick rising arpeggio. */
export function playAllTunedChime(ctx: AudioContext): number {
  const t = ctx.currentTime + 0.02;
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(ctx, f, t + i * 0.11, 0.7, 0.16));
  return 1200;
}
