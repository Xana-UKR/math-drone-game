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

export interface GameState {
  time: number;
  tanks: Tank[];
  pending: PendingSpawn[];
  nextId: number;
  problem: LiveProblem | null;
}

/**
 * Placeholder tuning values for Milestone 1 (PLAN.md). Only the fields this increment uses —
 * hearts, drones and wave size arrive with the increments that need them.
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
}

export const defaultConfig: Config = {
  lanes: 4,
  laneTraverseSeconds: 20,
  spawnIntervalSeconds: 2.5,
  spawnCount: 20,
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
};
