/**
 * Hidden option (?trumpet): a tiny, original three-note fanfare for the
 * trumpet target, built from Web Audio oscillators (sawtooth through a soft
 * low-pass = brassy, not harsh). Returns its duration in ms, like PluckSynth.play.
 */
export function playFanfare(ctx: AudioContext, gain = 0.25): number {
  // Rising major arpeggio on B♭ (a trumpet's home key): B♭4, D5, F5 held.
  const notes: [freq: number, start: number, length: number][] = [
    [466.16, 0, 0.16],
    [587.33, 0.18, 0.16],
    [698.46, 0.36, 0.7],
  ];
  const t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = gain;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.connect(out).connect(ctx.destination);
  let end = 0;
  for (const [freq, start, length] of notes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    const s = t0 + start;
    env.gain.setValueAtTime(0, s);
    env.gain.linearRampToValueAtTime(1, s + 0.03);
    env.gain.setValueAtTime(1, s + length - 0.06);
    env.gain.linearRampToValueAtTime(0, s + length);
    osc.connect(env).connect(filter);
    osc.start(s);
    osc.stop(s + length + 0.02);
    end = Math.max(end, start + length);
  }
  return Math.round((end + 0.05) * 1000);
}
