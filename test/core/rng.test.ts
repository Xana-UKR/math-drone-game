import { describe, expect, it } from 'vitest';

import { createRng } from '../../src/core/rng';

/**
 * The seeded RNG is the foundation of DESIGN.md §14's headless simulation: a thousand runs of a
 * preset only mean something if the same seed replays the same run. These tests pin that, plus
 * the range contract of `int`, which is the easiest thing in the file to get off by one.
 */

function draw(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe('createRng', () => {
  it('replays the same sequence for the same seed', () => {
    expect(draw(1234, 50)).toEqual(draw(1234, 50));
  });

  it('produces a different sequence for a different seed', () => {
    expect(draw(1234, 50)).not.toEqual(draw(1235, 50));
  });

  it('does not repeat a single value forever', () => {
    expect(new Set(draw(7, 50)).size).toBeGreaterThan(40);
  });

  it('returns next() values in [0, 1)', () => {
    for (const value of draw(99, 500)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('returns int() values in [min, maxExclusive)', () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(5, 9);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(9);
    }
  });

  it('reaches both ends of an int() range', () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(rng.int(0, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});
