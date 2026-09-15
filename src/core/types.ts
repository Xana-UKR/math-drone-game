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

export interface GameState {
  time: number;
  tanks: Tank[];
  pending: PendingSpawn[];
  nextId: number;
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
}

export const defaultConfig: Config = {
  lanes: 4,
  laneTraverseSeconds: 20,
  spawnIntervalSeconds: 2.5,
  spawnCount: 20,
};
