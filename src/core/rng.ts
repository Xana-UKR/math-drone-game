/**
 * Seeded, reproducible RNG (mulberry32). This is the only source of randomness allowed anywhere
 * in the game (CLAUDE.md) — the headless simulation (DESIGN.md §14) depends on a seed replaying
 * an identical run.
 */
export interface Rng {
  /** Next value in [0, 1). */
  next(): number;
  /** Next integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, maxExclusive: number): number => {
    if (maxExclusive <= min) throw new Error(`int: empty range [${min}, ${maxExclusive})`);
    return min + Math.floor(next() * (maxExclusive - min));
  };

  return { next, int };
}
