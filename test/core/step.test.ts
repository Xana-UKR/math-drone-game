import { describe, expect, it } from 'vitest';

import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, step } from '../../src/core/step';
import type { Config, GameState, LiveProblem, Tank } from '../../src/core/types';
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
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
};

/** A board with no pending spawns, so movement tests are independent of the schedule. */
function boardOf(tanks: Tank[]): GameState {
  return { time: 0, tanks, pending: [], nextId: tanks.length + 1, problem: null };
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
      problem: null,
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
      problem: null,
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
      problem: null,
      pending: [{ at: 0, lane: 1, number: 17 }],
      nextId: 1,
    };
    expect(step(queued, 1 / 60, config).pending).toEqual([]);
  });

  it('releases every due spawn, not just the first', () => {
    const queued: GameState = {
      time: 0,
      tanks: [],
      problem: null,
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

/**
 * Increment 2. A tank's number is an *answer* (DESIGN.md §9), so the numbers on the board are what
 * the generator has to work with — and two tanks showing the same number would make the problem
 * ambiguous no matter how good the generator is.
 */

/**
 * Run the loop the way `main.ts` does: one rng stream shared between `createGameState` and
 * `ensureProblem`, and `ensureProblem` inside the fixed timestep, after `step`. Sharing the stream
 * matters — giving the two functions independent streams from the same seed is also deterministic,
 * so a test that did that would pass while never exercising the arrangement that ships.
 */
function play(seconds: number, seed: number, overrides: Partial<Config> = {}): GameState[] {
  const dt = 1 / 60;
  const playConfig: Config = { ...config, ...overrides };
  const rng = createRng(seed);
  const frames: GameState[] = [];
  let current = createGameState(playConfig, rng);
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    current = ensureProblem(step(current, dt, playConfig), rng, playConfig);
    frames.push(current);
  }
  return frames;
}

function problemOf(state: GameState): LiveProblem {
  const { problem } = state;
  if (problem === null) throw new Error('expected a live problem');
  return problem;
}

describe('createGameState — tank numbers are answers', () => {
  it('draws every tank number from the configured answer range', () => {
    const state = createGameState({ ...config, spawnCount: 60 }, createRng(11));
    for (const spawn of state.pending) {
      expect(Number.isInteger(spawn.number)).toBe(true);
      expect(spawn.number).toBeGreaterThanOrEqual(config.answerMin);
      expect(spawn.number).toBeLessThanOrEqual(config.answerMax);
    }
  });

  it('uses most of the answer range across a long schedule', () => {
    // The exclusion window alone forces ~9 distinct numbers, so a weak bound here would hold even
    // if the generator collapsed to cycling one window forever. 60 spawns over a range of 21.
    const state = createGameState({ ...config, spawnCount: 60 }, createRng(11));
    const range = config.answerMax - config.answerMin + 1;
    expect(new Set(state.pending.map((spawn) => spawn.number)).size).toBeGreaterThanOrEqual(
      range - 3,
    );
  });

  it('never lets two tanks on screen at once show the same number, at any traverse/interval ratio', () => {
    // One ratio is not enough. The overlap window is derived from traverse / interval, and the
    // ratios that break it are the ones sitting at or just below an integer — where a tank
    // outliving its traverse time by one frame decides whether the next spawn overlaps it.
    const ratios: Partial<Config>[] = [
      { laneTraverseSeconds: 20, spawnIntervalSeconds: 2.5 }, // exactly 8
      { laneTraverseSeconds: 19.999999, spawnIntervalSeconds: 2.5 }, // a hair under 8
      { laneTraverseSeconds: 19.99, spawnIntervalSeconds: 2.5 },
      { laneTraverseSeconds: 19.999999, spawnIntervalSeconds: 2 }, // a hair under 10
      { laneTraverseSeconds: 19.99, spawnIntervalSeconds: 4 },
      { laneTraverseSeconds: 20, spawnIntervalSeconds: 2.2 }, // 9.09…
      { laneTraverseSeconds: 20, spawnIntervalSeconds: 3 }, // 6.67
      { laneTraverseSeconds: 12, spawnIntervalSeconds: 1.5 }, // exactly 8, different scale
    ];

    for (const ratio of ratios) {
      const label = `traverse ${ratio.laneTraverseSeconds} / interval ${ratio.spawnIntervalSeconds}`;
      for (const seed of [1, 2, 3]) {
        const spawnConfig: Config = { ...config, ...ratio, spawnCount: 40 };
        let current = createGameState(spawnConfig, createRng(seed));
        const steps = Math.round(120 / (1 / 60));
        let mostOnScreen = 0;
        for (let i = 0; i < steps; i += 1) {
          current = step(current, 1 / 60, spawnConfig);
          const numbers = current.tanks.map((tank) => tank.number);
          mostOnScreen = Math.max(mostOnScreen, numbers.length);
          expect(new Set(numbers).size, `${label}: duplicate on screen: ${numbers.join()}`).toBe(
            numbers.length,
          );
        }
        // Guard the assertion above: a board that never got crowded proves nothing.
        expect(mostOnScreen, `${label}: board never got crowded`).toBeGreaterThan(3);
      }
    }
  });

  it('says which dial is wrong when the answer range is too small for the board', () => {
    // overlapCount 20 against a range of 4 numbers. The message has to name the range — the raw
    // `rng.int(0, 0)` error underneath says nothing about why there was nothing to draw from.
    const tooSmall: Config = { ...config, spawnIntervalSeconds: 1, answerMin: 0, answerMax: 3 };
    expect(() => createGameState(tooSmall, createRng(1))).toThrow(/answer range/);
  });
});

describe('step — the live problem', () => {
  const board = (): GameState => ({
    ...boardOf([tankAt(0.9, { id: 1, number: 13 }), tankAt(0.2, { id: 2, lane: 1, number: 7 })]),
    problem: { a: 8, op: '+', b: 5, answer: 13, targetId: 1 },
  });

  it('starts a run with no problem', () => {
    expect(createGameState(config, createRng(1)).problem).toBeNull();
  });

  it('leaves the problem untouched while its target tank is on the board', () => {
    expect(step(board(), 0.5, config).problem).toEqual(board().problem);
  });

  it('clears the problem when its target tank reaches the wall', () => {
    expect(step(board(), 5, config).problem).toBeNull();
  });

  it('keeps the problem when a tank that is not the target reaches the wall', () => {
    const state: GameState = {
      ...boardOf([tankAt(0.1, { id: 1, number: 13 }), tankAt(0.99, { id: 2, lane: 1, number: 7 })]),
      problem: { a: 8, op: '+', b: 5, answer: 13, targetId: 1 },
    };
    const after = step(state, 1, config);
    expect(after.tanks.map((tank) => tank.id)).toEqual([1]);
    expect(after.problem).toEqual(state.problem);
  });

  it('builds no problem of its own — step stays free of randomness', () => {
    const empty = boardOf([tankAt(0.2, { id: 1, number: 13 })]);
    expect(step(empty, 0.5, config).problem).toBeNull();
  });
});

describe('ensureProblem', () => {
  const twoTanks = (): GameState =>
    boardOf([tankAt(0.9, { id: 5, number: 13 }), tankAt(0.2, { id: 2, lane: 1, number: 7 })]);

  const live = (): GameState => ({
    ...twoTanks(),
    problem: { a: 8, op: '+', b: 5, answer: 13, targetId: 5 },
  });

  it('sets a problem whose answer is the number on a tank currently on the board', () => {
    const state = ensureProblem(twoTanks(), createRng(3), config);
    expect(state.tanks.map((tank) => tank.number)).toContain(problemOf(state).answer);
  });

  it('points the problem at the tank carrying the answer', () => {
    const state = ensureProblem(twoTanks(), createRng(3), config);
    const problem = problemOf(state);
    const target = state.tanks.find((tank) => tank.id === problem.targetId);
    expect(target?.number).toBe(problem.answer);
  });

  it('targets the earliest-spawned tank, not the one nearest the wall (placeholder for §5)', () => {
    expect(problemOf(ensureProblem(twoTanks(), createRng(3), config)).targetId).toBe(2);
  });

  it('leaves a live problem alone — the answer never changes under the player', () => {
    expect(ensureProblem(live(), createRng(3), config).problem).toEqual(live().problem);
  });

  it('draws no randomness when a problem is already live', () => {
    const rng = createRng(3);
    ensureProblem(live(), rng, config);
    expect(rng.next()).toBe(createRng(3).next());
  });

  it('sets no problem on an empty board, and draws no randomness doing it', () => {
    const rng = createRng(3);
    expect(ensureProblem(boardOf([]), rng, config).problem).toBeNull();
    expect(rng.next()).toBe(createRng(3).next());
  });

  it('does not mutate the state it is given', () => {
    const state = twoTanks();
    const before = clone(state);
    ensureProblem(state, createRng(3), config);
    expect(state).toEqual(before);
  });

  it('replays an identical sequence of problems from the same seed', () => {
    const run = (): (LiveProblem | null)[] => play(40, 21).map((frame) => frame.problem);
    expect(run()).toEqual(run());
  });
});

describe('a played run keeps DESIGN.md §9 true end to end', () => {
  const frames = play(60, 31);

  it('shows a problem for most of the run', () => {
    expect(frames.filter((frame) => frame.problem !== null).length).toBeGreaterThan(
      frames.length / 2,
    );
  });

  it('always has exactly one tank on the board carrying the live answer', () => {
    for (const frame of frames) {
      const { problem } = frame;
      if (problem === null) continue;
      expect(frame.tanks.filter((tank) => tank.number === problem.answer)).toHaveLength(1);
    }
  });

  it('never points the problem at a tank that has left the board', () => {
    for (const frame of frames) {
      const { problem } = frame;
      if (problem === null) continue;
      expect(frame.tanks.some((tank) => tank.id === problem.targetId)).toBe(true);
    }
  });

  it('never re-targets while the current target is still on the board', () => {
    // DESIGN.md §5: the answer never changes under the player's finger. The condition has to be
    // "the old target is still there", not "the targetId matches" — keying off the id would skip
    // every frame where a re-target actually happened, which is the only thing that can fail.
    let checked = 0;
    for (let i = 1; i < frames.length; i += 1) {
      const previous = frames[i - 1]?.problem ?? null;
      const current = frames[i] ?? null;
      if (previous === null || current === null) continue;
      if (!current.tanks.some((tank) => tank.id === previous.targetId)) continue;
      checked += 1;
      expect(current.problem).toEqual(previous);
    }
    // Guard: if nothing was ever checked the loop above asserts nothing.
    expect(checked).toBeGreaterThan(frames.length / 2);
  });
});
