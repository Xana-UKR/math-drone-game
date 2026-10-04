/**
 * Core is unitless: a tank's `x` runs 0 at spawn to 1 at the wall. Render maps that to pixels.
 */
export interface Tank {
  id: number;
  lane: number;
  x: number;
  number: number;
}

/** A spawn not yet released onto the board, scheduled for a fixed clock time. */
export interface PendingSpawn {
  at: number;
  lane: number;
  number: number;
}

/** Pure arithmetic — `a op b`. Knows nothing about tanks. */
export interface Problem {
  a: number;
  op: '+' | '-';
  b: number;
  answer: number;
}

/** A `Problem` currently displayed, pinned to the tank whose number is its answer. */
export type LiveProblem = Problem & { targetId: number };

/**
 * One drone, in flight or absent — DESIGN.md §4: one at a time, no retargeting. `x` shares the
 * tanks' axis: 1 at the wall it launches from, 0 at the far edge. `hit` flies straight down the
 * target's own lane and carries the id of the tank it will destroy on impact; `miss` carries
 * neither — render derives its diagonal path from `x` alone.
 */
export type Drone =
  | { kind: 'hit'; x: number; lane: number; targetId: number }
  | { kind: 'miss'; x: number };

export interface GameState {
  time: number;
  tanks: Tank[];
  pending: PendingSpawn[];
  nextId: number;
  problem: LiveProblem | null;
  drone: Drone | null;
  hearts: number;
  /** 4b adds `'won'`. */
  outcome: 'playing' | 'lost';
}

/**
 * Placeholder tuning values for Milestone 1 (PLAN.md). Only the fields this increment uses —
 * drones and wave size arrive with the increments that need them.
 */
export interface Config {
  readonly lanes: number;
  readonly laneTraverseSeconds: number;
  readonly spawnIntervalSeconds: number;
  readonly spawnCount: number;
  readonly answerMin: number;
  readonly answerMax: number;
  readonly operandMin: number;
  readonly operandMax: number;
  /**
   * One knob covering both carrying in addition and borrowing in subtraction — DESIGN.md §10
   * calls this the real difficulty cliff, not magnitude: `4+3` and `8+7` are both "under 20" and
   * wildly different in difficulty at age five.
   */
  readonly allowCarry: boolean;
  /**
   * A **speed**, not a per-shot flight duration: the time to cross the full board width, wall to
   * far edge. DESIGN.md §6's fairness argument is that the gap between drone and tank closes at
   * `v_drone + v_tank`, so a near tank must die sooner than a distant one — a fixed duration would
   * break that.
   */
  readonly droneTraverseSeconds: number;
  /** DESIGN.md §7: hearts a run starts with; a breach costs one and zero ends the run. */
  readonly hearts: number;
}

export const defaultConfig: Config = {
  lanes: 4,
  // 34 s / 6 s (PLAN.md, decided 2026-10-03): the placeholder 20 s / 2.5 s crowded the board
  // faster than a realistic answer time could clear it, losing most runs by the tenth tank.
  laneTraverseSeconds: 34,
  spawnIntervalSeconds: 6,
  // Tanks now die as fast as they are tapped (increment 3), so 20 emptied the board before the
  // increment could be judged. Still a placeholder, retired by increment 4b's wave.
  spawnCount: 60,
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
  droneTraverseSeconds: 0.4,
  hearts: 3,
};
