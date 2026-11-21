import { describe, expect, it } from 'vitest';
import { matchOpenString, nearestOpenString, centsBetween } from '../pitch/matcher';
import { OPEN_STRINGS } from '../strings';
import { TOLERANCE_CENTS } from '../config';

describe('matcher', () => {
  it('matches each nominal open-string frequency exactly', () => {
    for (const s of OPEN_STRINGS) {
      const match = matchOpenString(s.frequency);
      expect(match?.stringIndex).toBe(s.index);
      expect(Math.abs(match!.cents)).toBeLessThan(0.01);
    }
  });

  it('accepts ±30 cents detuning on the correct string', () => {
    for (const cents of [-30, 30]) {
      const freq = 110.0 * Math.pow(2, cents / 1200);
      const match = matchOpenString(freq);
      expect(match?.stringIndex).toBe(1); // A2
      expect(Math.round(match!.cents)).toBe(cents);
    }
  });

  it('tolerates a badly tuned string (±150 cents) on the right string', () => {
    for (const cents of [-150, 150]) {
      const match = matchOpenString(110.0 * Math.pow(2, cents / 1200));
      expect(match?.stringIndex).toBe(1); // A2
    }
  });

  it('rejects a pitch between two strings', () => {
    // Geometric midpoint between E2 (82.41) and A2 (110): 250 cents from both,
    // beyond the 200-cent tolerance.
    const between = Math.sqrt(82.41 * 110.0);
    expect(matchOpenString(between)).toBeNull();
    // But the nearest string is still reported for tune mode.
    const nearest = nearestOpenString(between);
    expect([0, 1]).toContain(nearest.stringIndex);
    expect(Math.abs(nearest.cents)).toBeGreaterThan(TOLERANCE_CENTS);
  });

  it('centsBetween is signed and logarithmic', () => {
    expect(centsBetween(110, 110)).toBe(0);
    expect(centsBetween(220, 110)).toBeCloseTo(1200, 5);
    expect(centsBetween(55, 110)).toBeCloseTo(-1200, 5);
  });
});
