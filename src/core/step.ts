import { generateProblem } from './problem';
import type { Rng } from './rng';
import type { Config, GameState, LiveProblem, PendingSpawn, Tank } from './types';

/**
 * Builds the entire fixed spawn list up front — the only place randomness is consumed by spawn
 * scheduling. `step` itself is pure and reads no rng.
 *
 * A tank's number is the answer it will eventually be asked for (DESIGN.md §9), so no two tanks
 * that can be on screen at the same time may show the same number. Each spawn's number is
 * therefore drawn from the answer range with the numbers of every spawn still on screen excluded.
 * Drawing an index into the list of numbers still allowed (one `rng.int` call) keeps this
 * deterministic, instead of re-rolling until a collision-free number turns up.
 */
export function createGameState(config: Config, rng: Rng): GameState {
  const pending: PendingSpawn[] = [];

  // Spawn `i + k` overlaps spawn `i` while `k * spawnIntervalSeconds` is less than the time spawn
  // `i` spends on the board. That time is `laneTraverseSeconds + dt`, not `laneTraverseSeconds`:
  // a tank is released without moving on its release frame, so it outlives its own traverse time
  // by one step — on the 20 s / 2.5 s default, 9 tanks share the board for a frame, not 8. Core
  // does not know `dt` and so cannot size that extra frame. Taking the plain `ceil` of the ratio
  // covers it at every ratio: it is exact when the ratio sits at or just below an integer — the
  // cases where that extra frame decides the overlap — and errs by one spare exclusion elsewhere.
  const overlapCount = Math.max(
    0,
    Math.ceil(config.laneTraverseSeconds / config.spawnIntervalSeconds),
  );
  const onScreen: number[] = [];

  for (let i = 0; i < config.spawnCount; i += 1) {
    const lane = rng.int(0, config.lanes);

    const taken = new Set(onScreen);
    const allowed: number[] = [];
    for (let n = config.answerMin; n <= config.answerMax; n += 1) {
      if (!taken.has(n)) allowed.push(n);
    }

    // Tested before the draw rather than after it: `rng.int(0, 0)` would throw its own opaque
    // range error first, hiding the one thing the caller needs to know.
    const number = allowed.length === 0 ? undefined : allowed[rng.int(0, allowed.length)];
    if (number === undefined) {
      throw new Error(
        `createGameState: the answer range [${config.answerMin}, ${config.answerMax}] is too ` +
          `small to keep ${overlapCount + 1} tanks on screen distinct — spawn ${i} has no ` +
          'number left',
      );
    }

    pending.push({ at: i * config.spawnIntervalSeconds, lane, number });

    onScreen.push(number);
    if (onScreen.length > overlapCount) onScreen.shift();
  }

  return { time: 0, tanks: [], pending, nextId: 1, problem: null };
}

/**
 * Advances the clock by `dt`, releases every pending spawn whose time has come, moves each tank
 * right by `dt / laneTraverseSeconds`, and retires any tank that reached the wall. Also clears
 * `state.problem` when its target tank is no longer on the board — DESIGN.md §5: the answer
 * re-rolls the moment its tank is gone, and never changes otherwise. `ensureProblem` is the only
 * function that sets a new problem, so `step` still consumes no randomness. Pure: never mutates
 * `state` or the `Tank` objects inside it.
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

  const tanks = [...movedTanks, ...releasedTanks];

  const { problem } = state;
  const nextProblem: LiveProblem | null =
    problem !== null && !tanks.some((tank) => tank.id === problem.targetId) ? null : problem;

  return { time, tanks, pending, nextId, problem: nextProblem };
}

/**
 * Sets a new live problem when there is none and tanks exist to ask about. Returns `state`
 * unchanged — and draws no rng — when a problem is already live (§5: the answer never changes
 * under the player's finger) or the board is empty.
 *
 * The target pick here — the earliest-spawned tank still on the board (lowest `id`) — is a
 * **placeholder**. Increment 5 replaces it with DESIGN.md §5's urgency tiers and weighted pick;
 * nothing here should be mistaken for that.
 */
export function ensureProblem(state: GameState, rng: Rng, config: Config): GameState {
  if (state.problem !== null || state.tanks.length === 0) return state;

  const target = state.tanks.reduce((earliest, tank) => (tank.id < earliest.id ? tank : earliest));

  const generated = generateProblem(target.number, rng, config);
  return { ...state, problem: { ...generated, targetId: target.id } };
}
