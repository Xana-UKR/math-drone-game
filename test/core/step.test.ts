import { describe, expect, it } from 'vitest';

import { createRng } from '../../src/core/rng';
import { createGameState, step } from '../../src/core/step';
import type { Config, GameState, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * `step` is the whole of increment 1's behaviour: it owns the clock, releases the fixed spawn
 * list, moves tanks right and retires them at the wall. Core is unitless — x runs 0 at spawn to
 * 1 at the wall — so every position below is a fraction of a lane, not a pixel.
 */

/** Every field pinned, so retuning `defaultConfig` cannot quietly change what these tests mean. */
const config: Config = {
  ...defaultConfig,
  lanes: 4,
  laneTraverseSeconds: 20,
  spawnIntervalSeconds: 2.5,
  spawnCount: 20,
};

/** A board with no pending spawns, so movement tests are independent of the schedule. */
function boardOf(tanks: Tank[]): GameState {
  return { time: 0, tanks, pending: [], nextId: tanks.length + 1 };
}

function tankAt(x: number, overrides: Partial<Tank> = {}): Tank {
  return { id: 1, lane: 0, x, number: 12, ...overrides };
}

function onlyTank(state: GameState): Tank {
  expect(state.tanks).toHaveLength(1);
  const [tank] = state.tanks;
  if (tank === undefined) throw new Error('expected exactly one tank on the board');
  return tank;
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/**
 * Run `seconds` of simulated time at a fixed timestep, the way the rAF loop will. The step count
 * is computed rather than accumulated: `1/60` is not exactly representable, so summing it 360
 * times lands just under 6 and an `elapsed < seconds` loop would run one step too many.
 */
function simulate(state: GameState, seconds: number, dt = 1 / 60): GameState {
  let current = state;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) current = step(current, dt, config);
  return current;
}

describe('createGameState', () => {
  it('starts with a zero clock and an empty board', () => {
    const state = createGameState(config, createRng(1));
    expect(state.time).toBe(0);
    expect(state.tanks).toEqual([]);
  });

  it('queues exactly spawnCount spawns up front', () => {
    const state = createGameState({ ...config, spawnCount: 7 }, createRng(1));
    expect(state.pending).toHaveLength(7);
  });

  it('schedules the first spawn immediately and the rest one interval apart', () => {
    const schedule = createGameState(
      { ...config, spawnCount: 4, spawnIntervalSeconds: 2.5 },
      createRng(1),
    );
    expect(schedule.pending.map((spawn) => spawn.at)).toEqual([0, 2.5, 5, 7.5]);
  });

  it('assigns every spawn a lane within the configured lane count', () => {
    const state = createGameState({ ...config, lanes: 3, spawnCount: 40 }, createRng(5));
    for (const spawn of state.pending) {
      expect(Number.isInteger(spawn.lane)).toBe(true);
      expect(spawn.lane).toBeGreaterThanOrEqual(0);
      expect(spawn.lane).toBeLessThan(3);
    }
  });

  it('uses more than one lane across a long schedule', () => {
    const state = createGameState({ ...config, spawnCount: 40 }, createRng(5));
    expect(new Set(state.pending.map((spawn) => spawn.lane)).size).toBeGreaterThan(1);
  });

  it('builds an identical schedule from the same seed', () => {
    expect(createGameState(config, createRng(42))).toEqual(createGameState(config, createRng(42)));
  });
});

describe('step — clock and spawning', () => {
  it('accumulates dt into the state clock', () => {
    const state = step(step(boardOf([]), 0.5, config), 0.25, config);
    expect(state.time).toBeCloseTo(0.75, 10);
  });

  it('holds a spawn back until the clock reaches its scheduled time', () => {
    const queued: GameState = {
      time: 0,
      tanks: [],
      pending: [{ at: 5, lane: 2, number: 12 }],
      nextId: 1,
    };
    const early = step(queued, 4.9, config);
    expect(early.tanks).toEqual([]);
    expect(onlyTank(step(early, 0.2, config)).lane).toBe(2);
  });

  it('releases a spawned tank at the start of its lane', () => {
    const queued: GameState = {
      time: 0,
      tanks: [],
      pending: [{ at: 0, lane: 1, number: 17 }],
      nextId: 1,
    };
    const tank = onlyTank(step(queued, 1 / 60, config));
    expect(tank.x).toBe(0);
    expect(tank.number).toBe(17);
  });

  it('drops a released spawn from the pending list', () => {
    const queued: GameState = {
      time: 0,
      tanks: [],
      pending: [{ at: 0, lane: 1, number: 17 }],
      nextId: 1,
    };
    expect(step(queued, 1 / 60, config).pending).toEqual([]);
  });

  it('releases every due spawn, not just the first', () => {
    const queued: GameState = {
      time: 0,
      tanks: [],
      pending: [
        { at: 0, lane: 0, number: 3 },
        { at: 1, lane: 1, number: 4 },
        { at: 9, lane: 2, number: 5 },
      ],
      nextId: 1,
    };
    const state = step(queued, 2, config);
    expect(state.tanks).toHaveLength(2);
    expect(state.pending).toHaveLength(1);
  });

  it('gives every tank a distinct id', () => {
    // Ids must be unique across the whole run, not merely among the tanks alive at one instant:
    // scene.ts keys its SVG nodes by id, so a reused id hands a new tank a dead tank's node.
    // Collect every id ever issued and check the count against the number of spawns released.
    const dt = 1 / 60;
    const steps = Math.round(50 / dt);
    let current = createGameState(config, createRng(8));
    const ids = new Set<number>();
    for (let i = 0; i < steps; i += 1) {
      current = step(current, dt, config);
      for (const tank of current.tanks) ids.add(tank.id);
    }
    expect(current.pending).toHaveLength(0);
    expect(ids.size).toBe(config.spawnCount);
  });
});

describe('step — movement', () => {
  it('moves a tank half a lane in half the traverse time', () => {
    expect(onlyTank(step(boardOf([tankAt(0)]), 10, config)).x).toBe(0.5);
  });

  it('moves a tank the full lane in the traverse time, and retires it at the wall', () => {
    expect(step(boardOf([tankAt(0)]), 20, config).tanks).toEqual([]);
  });

  it('keeps a tank that is still short of the wall', () => {
    expect(onlyTank(step(boardOf([tankAt(0)]), 19, config)).x).toBeCloseTo(0.95, 10);
  });

  it('reaches the same position in many small steps as in one large step', () => {
    const stepped = simulate(boardOf([tankAt(0)]), 6);
    expect(onlyTank(stepped).x).toBeCloseTo(6 / 20, 9);
  });

  it('moves at the speed the configured traverse time implies', () => {
    const slow: Config = { ...config, laneTraverseSeconds: 40 };
    expect(onlyTank(step(boardOf([tankAt(0)]), 10, slow)).x).toBe(0.25);
  });

  it('keeps each tank in its own lane for its whole life', () => {
    const board = boardOf([tankAt(0, { id: 1, lane: 0 }), tankAt(0, { id: 2, lane: 3 })]);
    expect(simulate(board, 5).tanks.map((tank) => tank.lane)).toEqual([0, 3]);
  });

  it('keeps a tank on its own number from spawn to death', () => {
    const state = simulate(boardOf([tankAt(0, { number: 19 })]), 15);
    expect(onlyTank(state).number).toBe(19);
  });

  it('retires only the tank that reached the wall', () => {
    const board = boardOf([tankAt(0.99, { id: 1 }), tankAt(0.1, { id: 2, lane: 1 })]);
    expect(onlyTank(step(board, 1, config)).id).toBe(2);
  });

  it('never leaves a tank sitting past the wall', () => {
    const state = simulate(createGameState(config, createRng(4)), 30);
    // Guard the loop below: on an empty board it would assert nothing and still pass.
    expect(state.tanks.length).toBeGreaterThan(0);
    for (const tank of state.tanks) expect(tank.x).toBeLessThan(1);
  });
});

describe('step — purity', () => {
  it('does not mutate the state it is given', () => {
    const state = createGameState(config, createRng(2));
    const before = clone(state);
    step(state, 5, config);
    expect(state).toEqual(before);
  });

  it('does not mutate the tanks it is given', () => {
    const tank = tankAt(0.2);
    step(boardOf([tank]), 5, config);
    expect(tank.x).toBe(0.2);
  });

  it('replays an identical run from the same seed', () => {
    const run = (): GameState => simulate(createGameState(config, createRng(77)), 45);
    expect(run()).toEqual(run());
  });

  it('reads no clock of its own — the same dt sequence gives the same result whenever it runs', () => {
    const first = simulate(createGameState(config, createRng(3)), 12);
    const second = simulate(createGameState(config, createRng(3)), 12);
    expect(first.time).toBe(second.time);
    expect(first.tanks).toEqual(second.tanks);
  });
});
