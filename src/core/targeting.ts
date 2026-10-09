import type { Rng } from './rng';
import type { Config, Tank } from './types';

/**
 * DESIGN.md §5's urgency tiers and weighted pick (increment 5), replacing increment 2's
 * placeholder "lowest id" target. A tank's urgency is its own `x` (0 at spawn, 1 at the wall) —
 * DESIGN.md §4's "urgency is literally the tank's x coordinate".
 */

/**
 * DESIGN.md §5 calls 0.5 and 0.8 placeholders and says the critical one "must be derived from §6,
 * not chosen by feel". §6.1 derives it as the point past which a tank is already unsavable —
 * `v_tank × t_answer` in core's unitless x, `t_answer / laneTraverseSeconds` below the wall, i.e.
 * `1 − t_answer / laneTraverseSeconds`.
 *
 * specs/05-urgency-targeting.md (decided with the author) uses a different line instead: that one
 * is the *unsavable* threshold, and a critical pool built from it would hold only tanks already
 * lost, going empty the moment increment 6 excludes those. Critical here means **"must be offered
 * now"**: a tank skipped for this problem only gets another chance after this answer resolves (one
 * more `t_answer`) and the drone's flight to it, so it needs `t_answer` twice over plus the drone's
 * flight still in hand. That is `2 × t_answer + droneTraverseSeconds` of traverse time left, i.e.
 * `1 − (2 × t_answer + droneTraverseSeconds) / laneTraverseSeconds` — ≈0.694 at this file's
 * defaults, not §6.1's 0.853.
 */
export function criticalThreshold(config: Config): number {
  return (
    1 - (2 * config.tAnswerSeconds + config.droneTraverseSeconds) / config.laneTraverseSeconds
  );
}

/**
 * DESIGN.md §5's tiers, keyed off the board's highest urgency (`u_max`, the tank nearest the
 * wall). Critical is checked first — specs/05-urgency-targeting.md: deriving a critical threshold
 * below `alertThreshold` (a huge `tAnswerSeconds`) must still win, not fall through to alert. Copies
 * before sorting so the caller's array and tanks are never touched.
 *
 * - `u_max` at or above `criticalThreshold` → every tank at or above it (usually one, DESIGN.md
 *   §5 — "must be offered now").
 * - else `u_max` at or above `config.alertThreshold` → the `config.alertPoolSize` most urgent
 *   tanks, or the whole board when it holds fewer than that.
 * - else → the whole board (DESIGN.md §5's relaxed tier: any tank may be the answer).
 */
export function candidatePool(tanks: readonly Tank[], config: Config): Tank[] {
  const sorted = [...tanks].sort((a, b) => b.x - a.x);
  const uMax = sorted[0]?.x;
  if (uMax === undefined) return sorted;

  const critical = criticalThreshold(config);
  if (uMax >= critical) return sorted.filter((tank) => tank.x >= critical);
  if (uMax >= config.alertThreshold) return sorted.slice(0, config.alertPoolSize);
  return sorted;
}

/**
 * Weighted pick, weight `1 + tank.x` — DESIGN.md §5: "weighted toward higher urgency", so a tank
 * at the wall is about twice as likely as one just spawned. Draws **exactly one** `rng.next()`,
 * even from a pool of one, so which seed a run replays with never depends on how big the pool
 * happened to be at the moment of the pick.
 *
 * The draw lands in `[0, total)` and walks the pool in the order it was given, accumulating
 * weight, returning the first tank whose cumulative weight exceeds it. The final tank is returned
 * if the walk falls through — floating-point summation of the weights can leave the draw a hair
 * above the true total, same reasoning as `step.ts`'s `ARRIVAL_EPSILON`, but here as a fallback
 * rather than a tolerance, since the "which tank" question has no dial to tune a tolerance with.
 *
 * Throws on an empty pool rather than guessing, the same stance as `problem.ts`'s
 * `generateProblem`.
 */
export function pickTarget(pool: readonly Tank[], rng: Rng): Tank {
  if (pool.length === 0) throw new Error('pickTarget: cannot pick a target from an empty pool');

  const weights = pool.map((tank) => 1 + tank.x);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const draw = rng.next() * total;

  let cumulative = 0;
  for (let i = 0; i < pool.length; i += 1) {
    cumulative += weights[i] ?? 0;
    if (draw < cumulative) {
      const tank = pool[i];
      // Unreachable: i ranges over pool's own indices.
      if (tank === undefined) throw new Error('pickTarget: internal error walking the pool');
      return tank;
    }
  }

  const last = pool[pool.length - 1];
  // Unreachable: pool.length > 0 is checked above.
  if (last === undefined) throw new Error('pickTarget: internal error on pool fallthrough');
  return last;
}
