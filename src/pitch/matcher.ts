import { OPEN_STRINGS } from '../strings';
import { TOLERANCE_CENTS } from '../config';

export interface StringMatch {
  stringIndex: number;
  /** Signed cents deviation from the string's nominal frequency. */
  cents: number;
}

export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference);
}

/** Closest open string by cents, regardless of distance. */
export function nearestOpenString(frequency: number): StringMatch {
  let best = OPEN_STRINGS[0];
  let bestCents = Infinity;
  for (const s of OPEN_STRINGS) {
    const cents = Math.abs(centsBetween(frequency, s.frequency));
    if (cents < bestCents) {
      best = s;
      bestCents = cents;
    }
  }
  return { stringIndex: best.index, cents: centsBetween(frequency, best.frequency) };
}

/** Closest open string, or null if it is farther away than the tolerance. */
export function matchOpenString(
  frequency: number,
  toleranceCents: number = TOLERANCE_CENTS,
): StringMatch | null {
  const match = nearestOpenString(frequency);
  return Math.abs(match.cents) <= toleranceCents ? match : null;
}
