import { isSavable } from './fairness';
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
 * `v_tank × t_answer` in core's unitless x, `1 − t_answer / laneTraverseSeconds`.
 *
 * specs/05-urgency-targeting.md (decided with the author) uses a different line instead: critical
 * means **"must be offered now"**. A tank skipped for this problem only gets another chance after
 * this answer resolves (one more `t_answer`) and the drone's flight to it, so it needs `t_answer`
 * twice over plus the drone's flight still in hand: `2 × t_answer + droneTraverseSeconds` of
 * traverse time left — ≈0.694 at the defaults, not §6.1's 0.853.
 *
 * Increment 6 (specs/06-fairness-governor.md) generalises that per place in line. The savable tank
 * in place `place` (1 = nearest the wall) has others to be answered ahead of it, so it must be
 * offered now, or one of them must be, once it has no more than `(place + 1) × t_answer +
 * place × droneTraverseSeconds` left: `1 − ((place + 1) × t_answer + place × flight) / traverse`.
 * Place 1 is increment 5's value, unchanged.
 */
export function criticalThreshold(config: Config, place = 1): number {
  return (
    1 -
    ((place + 1) * config.tAnswerSeconds + place * config.droneTraverseSeconds) /
      config.laneTraverseSeconds
  );
}

/**
 * DESIGN.md §5's tiers over the **savable** tanks only (`fairness.ts`'s `isSavable` — a tank past
 * the unsavable line cannot be saved by any answer, so offering it wastes the problem). Savable
 * tanks are sorted most urgent first (copies before sorting; the caller's array and tanks are never
 * touched), and the tiers are keyed off them. Critical is checked first —
 * specs/05-urgency-targeting.md: a critical threshold below `alertThreshold` (a huge
 * `tAnswerSeconds`) must still win, not fall through to alert.
 *
 * - empty board → empty pool.
 * - no savable tank (late in a slowly played wave; DESIGN.md does not cover it) → the one tank with
 *   the most time left, the likeliest save.
 * - the savable tank in place `k` at or above `criticalThreshold(config, k)` is critical: it must
 *   be offered now, or a tank ahead of it must. The pool is every savable tank from the front up to
 *   and including the first critical one.
 * - else the most urgent savable tank at or above `config.alertThreshold` → the
 *   `config.alertPoolSize` most urgent savable tanks, or all of them when there are fewer.
 * - else → every savable tank (DESIGN.md §5's relaxed tier).
 */
export function candidatePool(tanks: readonly Tank[], config: Config): Tank[] {
  const sorted = [...tanks].sort((a, b) => b.x - a.x);
  const last = sorted[sorted.length - 1];
  if (last === undefined) return sorted;

  const savable = sorted.filter((tank) => isSavable(tank, config));
  const front = savable[0];
  if (front === undefined) return [last];

  for (let i = 0; i < savable.length; i += 1) {
    const tank = savable[i];
    if (tank !== undefined && tank.x >= criticalThreshold(config, i + 1)) {
      return savable.slice(0, i + 1);
    }
  }

  if (front.x >= config.alertThreshold) return savable.slice(0, config.alertPoolSize);
  return savable;
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
