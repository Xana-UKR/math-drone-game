import type { Rng } from './rng';
import type { Config, GameState, PendingSpawn, Tank } from './types';

/**
 * Builds the entire fixed spawn list up front — the only place randomness is consumed. `step`
 * itself is pure and reads no rng.
 */
export function createGameState(config: Config, rng: Rng): GameState {
  const pending: PendingSpawn[] = [];
  for (let i = 0; i < config.spawnCount; i += 1) {
    pending.push({
      at: i * config.spawnIntervalSeconds,
      lane: rng.int(0, config.lanes),
      number: rng.int(0, 100),
    });
  }
  return { time: 0, tanks: [], pending, nextId: 1 };
}

/**
 * Advances the clock by `dt`, releases every pending spawn whose time has come, moves each tank
 * right by `dt / laneTraverseSeconds`, and retires any tank that reached the wall. Pure: never
 * mutates `state` or the `Tank` objects inside it.
 */
export function step(state: GameState, dt: number, config: Config): GameState {
  const time = state.time + dt;

  const pending: PendingSpawn[] = [];
  const due: PendingSpawn[] = [];
  for (const spawn of state.pending) {
    if (spawn.at <= time) due.push(spawn);
    else pending.push(spawn);
  }

  const advance = dt / config.laneTraverseSeconds;
  const movedTanks = state.tanks
    .map((tank) => ({ ...tank, x: tank.x + advance }))
    .filter((tank) => tank.x < 1);

  let nextId = state.nextId;
  const releasedTanks: Tank[] = due.map((spawn) => {
    const tank: Tank = { id: nextId, lane: spawn.lane, x: 0, number: spawn.number };
    nextId += 1;
    return tank;
  });

  return { time, tanks: [...movedTanks, ...releasedTanks], pending, nextId };
}
