import { describe, expect, it } from 'vitest';

import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import type { Config, GameState, LiveProblem, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 4c (specs/04c-lane-refill.md). A run opens with one tank in every lane at staggered
 * depths, and a tank leaving the board — destroyed by a drone or breaching the wall — is replaced
 * in its own lane in the same step, from the front of the wave's queue, until the queue runs out.
 * Every number of the wave is distinct and drawn up front, so `step` stays free of randomness.
 */

/** Every field pinned, so retuning `defaultConfig` cannot quietly change what these tests mean. */
const config: Config = {
  ...defaultConfig,
  lanes: 4,
  laneTraverseSeconds: 34,
  openingStagger: 0.05,
  waveSize: 13,
  resupplyEvery: 4,
  droneTraverseSeconds: 0.4,
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
  hearts: 3,
  // 4c's queue order: under 'near' (increment 7b) an entering tank takes a close neighbour instead.
  mistakeAnswers: 'traps',
};

const DT = 1 / 60;
/** Half of one fixed step's advance short of the wall: any single step breaches it. */
const ONE_STEP_FROM_WALL = 1 - DT / config.laneTraverseSeconds / 2;

function tankAt(x: number, overrides: Partial<Tank> = {}): Tank {
  return { id: 1, lane: 0, x, number: 12, ...overrides };
}

function boardOf(tanks: Tank[], overrides: Partial<GameState> = {}): GameState {
  return {
    time: 0,
    tanks,
    pending: [],
    nextId: tanks.length + 1,
    problem: null,
    drone: null,
    hearts: config.hearts,
    drones: config.waveSize,
    correct: 0,
    outcome: 'playing',
    wrongAnswers: [],
    log: [],
    ...overrides,
  };
}

/** The live problem pointing at tank 1, which carries 13. */
const PROBLEM_FOR_TANK_1: LiveProblem = { a: 8, op: '+', b: 5, answer: 13, targetId: 1 };

/** Steps until the drone in flight resolves; returns the state of the step it resolved on. */
function flyToEnd(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 600 && current.drone !== null; i += 1) current = step(current, DT, config);
  if (current.drone !== null) throw new Error('fixture: the drone never resolved');
  return current;
}

function inLane(state: GameState, lane: number): Tank[] {
  return state.tanks.filter((tank) => tank.lane === lane);
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

describe('createGameState — the opening board', () => {
  it('starts with a zero clock and one tank in every lane', () => {
    const state = createGameState(config, createRng(1));
    expect(state.time).toBe(0);
    expect(state.tanks.map((tank) => tank.lane).sort()).toEqual([0, 1, 2, 3]);
  });

  it('staggers the opening tanks at 0.025, 0.075, 0.125 and 0.175 of the lane', () => {
    const state = createGameState(config, createRng(1));
    const depths = state.tanks.map((tank) => tank.x).sort((a, b) => a - b);
    expect(depths).toHaveLength(4);
    [0.025, 0.075, 0.125, 0.175].forEach((depth, i) => expect(depths[i]).toBeCloseTo(depth, 10));
  });

  it('spaces the opening depths by openingStagger, one per lane, at any lane count', () => {
    const wide: Config = { ...config, lanes: 6, openingStagger: 0.1 };
    const depths = createGameState(wide, createRng(2))
      .tanks.map((tank) => tank.x)
      .sort((a, b) => a - b);
    expect(depths).toHaveLength(6);
    depths.forEach((depth, i) => expect(depth).toBeCloseTo((i + 0.5) * 0.1, 10));
  });

  it('draws the lane order from the seed — different seeds put the front tank in different lanes', () => {
    const frontLanes = new Set<number>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const { tanks } = createGameState(config, createRng(seed));
      const front = tanks.reduce((a, b) => (b.x > a.x ? b : a));
      frontLanes.add(front.lane);
    }
    expect(frontLanes.size).toBeGreaterThan(1);
  });

  it('draws every number of the wave distinct, board and queue together', () => {
    for (const waveSize of [13, 21]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const state = createGameState({ ...config, waveSize }, createRng(seed));
        const numbers = [...state.tanks.map((tank) => tank.number), ...state.pending];
        expect(numbers).toHaveLength(waveSize);
        expect(new Set(numbers).size).toBe(waveSize);
      }
    }
  });

  it('opens with only waveSize tanks, each in its own lane, when the wave is smaller than the lane count', () => {
    const state = createGameState({ ...config, waveSize: 2 }, createRng(4));
    expect(state.tanks).toHaveLength(2);
    expect(new Set(state.tanks.map((tank) => tank.lane)).size).toBe(2);
    expect(state.pending).toEqual([]);
  });

  it('says which dials are wrong when the answer range holds fewer numbers than the wave', () => {
    // 4 numbers in [0, 3] against a wave of 13. The message has to name both dials — the raw
    // `rng.int(0, 0)` error underneath says nothing about why there was nothing to draw from.
    const tooSmall: Config = { ...config, answerMin: 0, answerMax: 3 };
    expect(() => createGameState(tooSmall, createRng(1))).toThrow(/waveSize/);
    expect(() => createGameState(tooSmall, createRng(1))).toThrow(/answer range/);
  });

  it('ships openingStagger 0.05 in defaultConfig, as decided for increment 4c', () => {
    expect(defaultConfig.openingStagger).toBe(0.05);
  });
});

describe('step — lane refill', () => {
  it('refills a lane at x = 0 in the same step a drone destroys its tank', () => {
    const board = boardOf(
      [
        tankAt(0.5, { id: 1, lane: 2, number: 13 }),
        tankAt(0.1, { id: 2, lane: 1, number: 7 }),
        tankAt(0.3, { id: 3, lane: 0, number: 8 }),
        tankAt(0.2, { id: 4, lane: 3, number: 9 }),
      ],
      { problem: PROBLEM_FOR_TANK_1, pending: [4, 5] },
    );
    const impact = flyToEnd(selectTank(board, 1));
    expect(impact.tanks.some((tank) => tank.id === 1)).toBe(false);
    const refill = inLane(impact, 2);
    expect(refill).toHaveLength(1);
    expect(refill[0]?.x).toBe(0);
    expect(refill[0]?.number).toBe(4);
  });

  it('refills a lane at x = 0 in the same step its tank breaches', () => {
    const board = boardOf(
      [
        tankAt(ONE_STEP_FROM_WALL, { lane: 3 }),
        tankAt(0.1, { id: 2, lane: 1, number: 7 }),
        tankAt(0.3, { id: 3, lane: 0, number: 8 }),
        tankAt(0.2, { id: 4, lane: 2, number: 9 }),
      ],
      { pending: [4] },
    );
    const after = step(board, DT, config);
    expect(inLane(after, 3).map((tank) => [tank.x, tank.number])).toEqual([[0, 4]]);
  });

  it("takes the refill's number from the front of the queue, and drops it from the queue", () => {
    const board = boardOf(
      [
        tankAt(ONE_STEP_FROM_WALL),
        tankAt(0.3, { id: 2, lane: 1, number: 7 }),
        tankAt(0.2, { id: 3, lane: 2, number: 8 }),
        tankAt(0.1, { id: 4, lane: 3, number: 9 }),
      ],
      { pending: [4, 5, 6] },
    );
    const after = step(board, DT, config);
    expect(inLane(after, 0).map((tank) => tank.number)).toEqual([4]);
    expect(after.pending).toEqual([5, 6]);
  });

  it('gives a refilled tank a fresh id', () => {
    const board = boardOf([tankAt(ONE_STEP_FROM_WALL, { id: 7 })], { nextId: 8, pending: [4] });
    const after = step(board, DT, config);
    expect(after.tanks.map((tank) => tank.id)).toEqual([8]);
    expect(after.nextId).toBe(9);
  });

  it('refills two lanes emptied in the same step in ascending lane order', () => {
    const board = boardOf(
      [
        tankAt(ONE_STEP_FROM_WALL, { id: 1, lane: 3, number: 9 }),
        tankAt(ONE_STEP_FROM_WALL, { id: 2, lane: 1, number: 7 }),
        tankAt(0.3, { id: 3, lane: 0, number: 8 }),
        tankAt(0.2, { id: 4, lane: 2, number: 10 }),
      ],
      { hearts: 3, pending: [4, 5] },
    );
    const after = step(board, DT, config);
    expect(inLane(after, 1).map((tank) => tank.number)).toEqual([4]);
    expect(inLane(after, 3).map((tank) => tank.number)).toEqual([5]);
  });

  it('refills both lanes when a kill and a breach empty them in the same step', () => {
    const board = boardOf(
      [
        tankAt(0.5, { id: 1, lane: 0, number: 13 }),
        tankAt(ONE_STEP_FROM_WALL, { id: 2, lane: 2, number: 7 }),
        tankAt(0.3, { id: 3, lane: 1, number: 8 }),
        tankAt(0.2, { id: 4, lane: 3, number: 9 }),
      ],
      {
        problem: PROBLEM_FOR_TANK_1,
        // A hit drone a hair behind its target: it impacts in the next step.
        drone: { kind: 'hit', x: 0.5 + 1e-6, lane: 0, targetId: 1 },
        drones: config.waveSize - 1,
        pending: [4, 5],
      },
    );
    const after = step(board, DT, config);
    expect(after.correct).toBe(1);
    expect(after.hearts).toBe(config.hearts - 1);
    expect(inLane(after, 0).map((tank) => [tank.x, tank.number])).toEqual([[0, 4]]);
    expect(inLane(after, 2).map((tank) => [tank.x, tank.number])).toEqual([[0, 5]]);
  });

  it('refills nothing when a miss drone leaves the board', () => {
    const board = boardOf(
      [
        tankAt(0.5, { id: 1, number: 13 }),
        tankAt(0.1, { id: 2, lane: 1, number: 7 }),
        tankAt(0.3, { id: 3, lane: 2, number: 8 }),
        tankAt(0.2, { id: 4, lane: 3, number: 9 }),
      ],
      { problem: PROBLEM_FOR_TANK_1, pending: [4] },
    );
    const after = flyToEnd(selectTank(board, 2));
    expect(after.tanks.map((tank) => tank.id)).toEqual([1, 2, 3, 4]);
    expect(after.pending).toEqual([4]);
  });

  it('never refills a lane whose tank is still on the board', () => {
    // Lane 3 is empty, so a tank does enter this step — and it must go there, not into a lane
    // that still holds its own tank.
    const board = boardOf(
      [
        tankAt(0.2),
        tankAt(0.1, { id: 2, lane: 1, number: 7 }),
        tankAt(0.3, { id: 3, lane: 2, number: 8 }),
      ],
      { pending: [4, 5] },
    );
    const after = step(board, DT, config);
    for (const lane of [0, 1, 2]) {
      expect(inLane(after, lane).map((tank) => tank.id)).toEqual([lane + 1]);
    }
    expect(inLane(after, 3).map((tank) => tank.number)).toEqual([4]);
    expect(after.pending).toEqual([5]);
  });

  it('leaves an emptied lane empty once the queue has run out', () => {
    const board = boardOf([
      tankAt(ONE_STEP_FROM_WALL, { lane: 3 }),
      tankAt(0.1, { id: 2, lane: 1, number: 7 }),
    ]);
    const after = step(board, DT, config);
    expect(inLane(after, 3)).toEqual([]);
    expect(after.tanks).toHaveLength(1);
  });

  it('does not mutate the state it is given when it refills', () => {
    const board = boardOf([tankAt(ONE_STEP_FROM_WALL)], { pending: [4, 5] });
    const before = clone(board);
    step(board, DT, config);
    expect(board).toEqual(before);
  });
});

/**
 * The loop `main.ts` runs. `tapEverySeconds` null is a player who never taps (every tank breaches,
 * so hearts are raised to the wave size to keep the run going); otherwise a player who always
 * taps the right tank, at most once every `tapEverySeconds`.
 */
function play(seed: number, tapEverySeconds: number | null): GameState[] {
  const playConfig: Config =
    tapEverySeconds === null ? { ...config, hearts: config.waveSize + 1 } : config;
  const rng = createRng(seed);
  let current = createGameState(playConfig, rng);
  const frames: GameState[] = [current];
  const tapEvery = tapEverySeconds === null ? 0 : Math.round(tapEverySeconds / DT);

  for (let i = 0; i < Math.round(600 / DT) && current.outcome === 'playing'; i += 1) {
    const { problem } = current;
    if (tapEverySeconds !== null && problem !== null && current.drone === null && i % tapEvery === 0) {
      current = selectTank(current, problem.targetId);
    }
    current = ensureProblem(step(current, DT, playConfig), rng, playConfig);
    frames.push(current);
  }
  return frames;
}

const players: [string, number | null][] = [
  ['a player answering every 3 s', 3],
  ['a player answering every 0.5 s', 0.5],
  ['a player who never taps', null],
];

for (const [name, tapEverySeconds] of players) {
  describe(`a played run under lane refill — ${name}`, () => {
    const seeds = [41, 42, 43];
    const runs = seeds.map((seed) => play(seed, tapEverySeconds));

    it('holds one tank in every lane while the queue still has numbers', () => {
      let checked = 0;
      for (const frames of runs) {
        for (const frame of frames) {
          if (frame.pending.length === 0) continue;
          checked += 1;
          expect(frame.tanks.map((tank) => tank.lane).sort()).toEqual([0, 1, 2, 3]);
        }
      }
      expect(checked).toBeGreaterThan(0);
    });

    it('never holds two tanks in one lane', () => {
      for (const frames of runs) {
        for (const frame of frames) {
          const lanes = frame.tanks.map((tank) => tank.lane);
          expect(new Set(lanes).size).toBe(lanes.length);
        }
      }
    });

    it('never shows two tanks with the same number at once', () => {
      for (const frames of runs) {
        for (const frame of frames) {
          const numbers = frame.tanks.map((tank) => tank.number);
          expect(new Set(numbers).size).toBe(numbers.length);
        }
      }
    });

    it('releases exactly waveSize tanks over the run, every one with its own number', () => {
      for (const frames of runs) {
        const seen = new Map<number, number>();
        for (const frame of frames) for (const tank of frame.tanks) seen.set(tank.id, tank.number);
        expect(seen.size).toBe(config.waveSize);
        expect(new Set(seen.values()).size).toBe(config.waveSize);
      }
    });

    it('drains the wave to a win', () => {
      for (const frames of runs) expect(frames[frames.length - 1]?.outcome).toBe('won');
    });

    it('replays identically from the same seed and the same player', () => {
      expect(play(41, tapEverySeconds)).toEqual(runs[0]);
    });
  });
}
