import { describe, expect, it } from 'vitest';

import type { Rng } from '../../src/core/rng';
import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import type { Config, GameState, LiveProblem, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 4a (specs/04a-hearts-and-losing.md). DESIGN.md §4.6 and §7: a tank reaching the wall
 * costs one heart and is destroyed on impact; the run ends, lost, at zero hearts. A lost run is
 * frozen — nothing moves, no tap lands, no problem is set — so the board the child sees is the one
 * that beat them, and the headless harness gets a run that ends on its own.
 */

/** Every field pinned, so retuning `defaultConfig` cannot quietly change what these tests mean. */
const config: Config = {
  ...defaultConfig,
  lanes: 4,
  laneTraverseSeconds: 20,
  openingStagger: 0.1,
  waveSize: 20,
  droneTraverseSeconds: 0.4,
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
  hearts: 3,
  resupplyEvery: 4,
};

const DT = 1 / 60;
/** Half of one fixed step's advance short of the wall: any single step breaches it. */
const ONE_STEP_FROM_WALL = 1 - DT / config.laneTraverseSeconds / 2;

function tankAt(x: number, overrides: Partial<Tank> = {}): Tank {
  return { id: 1, lane: 0, x, number: 12, ...overrides };
}

function boardOf(
  tanks: Tank[],
  hearts: number = config.hearts,
  problem: LiveProblem | null = null,
): GameState {
  return {
    time: 0,
    tanks,
    pending: [],
    nextId: tanks.length + 1,
    problem,
    drone: null,
    hearts,
    drones: config.waveSize,
    correct: 0,
    outcome: 'playing',
  };
}

/** A run lost by its last breach: one heart left, a tank about to breach, another still far off. */
function lostState(): GameState {
  const lost = step(
    boardOf([tankAt(ONE_STEP_FROM_WALL, { id: 1 }), tankAt(0.3, { id: 2, lane: 1, number: 7 })], 1),
    DT,
    config,
  );
  if (lost.outcome !== 'lost') throw new Error('fixture: expected the run to be lost');
  return lost;
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** An rng that counts its draws, so a test can prove a function drew nothing. */
function countingRng(seed: number): { rng: Rng; draws: () => number } {
  const inner = createRng(seed);
  let count = 0;
  return {
    rng: {
      next: () => {
        count += 1;
        return inner.next();
      },
      int: (min, maxExclusive) => {
        count += 1;
        return inner.int(min, maxExclusive);
      },
    },
    draws: () => count,
  };
}

describe('hearts at the start of a run', () => {
  it('starts a run with config.hearts hearts and the outcome playing', () => {
    const state = createGameState({ ...config, hearts: 5 }, createRng(1));
    expect(state.hearts).toBe(5);
    expect(state.outcome).toBe('playing');
  });

  it("ships DESIGN.md §7's three hearts in defaultConfig", () => {
    expect(defaultConfig.hearts).toBe(3);
  });
});

describe('step — a breach costs a heart', () => {
  it('costs one heart when a tank reaches the wall, and removes that tank', () => {
    const after = step(boardOf([tankAt(ONE_STEP_FROM_WALL)]), DT, config);
    expect(after.hearts).toBe(2);
    expect(after.tanks).toEqual([]);
  });

  it('costs one heart per tank when two tanks breach in the same step', () => {
    const board = boardOf([
      tankAt(ONE_STEP_FROM_WALL, { id: 1, lane: 0 }),
      tankAt(ONE_STEP_FROM_WALL, { id: 2, lane: 1, number: 7 }),
    ]);
    expect(step(board, DT, config).hearts).toBe(1);
  });

  it('costs nothing while every tank is still short of the wall', () => {
    const after = step(boardOf([tankAt(0.5), tankAt(0.9, { id: 2, number: 7 })]), DT, config);
    expect(after.hearts).toBe(3);
  });

  it('costs nothing for a target one step from the wall that the drone destroys first', () => {
    const board = boardOf([tankAt(ONE_STEP_FROM_WALL, { number: 13 })], 3, {
      a: 8,
      op: '+',
      b: 5,
      answer: 13,
      targetId: 1,
    });
    const after = step(selectTank(board, 1), DT, config);
    expect(after.tanks).toEqual([]);
    expect(after.hearts).toBe(3);
  });

  it('does not mutate the state it is given when a breach costs a heart', () => {
    const board = boardOf([tankAt(ONE_STEP_FROM_WALL)]);
    const before = clone(board);
    step(board, DT, config);
    expect(board).toEqual(before);
  });
});

describe('step — breaches land on their nominal step at every traverse time (PLAN carried item)', () => {
  // PLAN.md's measured list, plus 20 and 34: summing dt / traverse at dt = 1/60 lands a few 1e-15
  // *below* 1 at the nominal step for most of these, which without a tolerance lets the tank
  // survive — and stay unpaid-for — one step too long.
  const traverseTimes = [5, 6, 7, 8, 11, 12, 13, 14, 15, 17, 18, 20, 21, 22, 24, 30, 34, 40, 45, 50];

  for (const laneTraverseSeconds of traverseTimes) {
    it(`breaches exactly on step ${laneTraverseSeconds * 60} at a ${laneTraverseSeconds} s traverse`, () => {
      const timed: Config = { ...config, laneTraverseSeconds };
      const nominal = laneTraverseSeconds * 60;
      let current = boardOf([tankAt(0)]);
      for (let i = 1; i < nominal; i += 1) current = step(current, DT, timed);
      expect(current.tanks).toHaveLength(1);
      expect(current.hearts).toBe(3);

      current = step(current, DT, timed);
      expect(current.tanks).toEqual([]);
      expect(current.hearts).toBe(2);
    });
  }
});

describe('step — losing', () => {
  it('stays playing while one heart remains', () => {
    // The far tank keeps the wave unfinished: with the breaching tank alone on the board and
    // nothing pending, a breach with a heart left would be a won wave (DESIGN.md §7, increment 4b).
    const board = boardOf([tankAt(ONE_STEP_FROM_WALL), tankAt(0.3, { id: 2, lane: 1, number: 7 })], 2);
    const after = step(board, DT, config);
    expect(after.hearts).toBe(1);
    expect(after.outcome).toBe('playing');
  });

  it('ends the run as lost in the same step the last heart is spent', () => {
    const after = step(boardOf([tankAt(ONE_STEP_FROM_WALL)], 1), DT, config);
    expect(after.hearts).toBe(0);
    expect(after.outcome).toBe('lost');
  });

  it('never takes hearts below zero when more tanks breach at once than hearts remain', () => {
    const board = boardOf(
      [
        tankAt(ONE_STEP_FROM_WALL, { id: 1, lane: 0 }),
        tankAt(ONE_STEP_FROM_WALL, { id: 2, lane: 1, number: 7 }),
        tankAt(ONE_STEP_FROM_WALL, { id: 3, lane: 2, number: 9 }),
      ],
      1,
    );
    const after = step(board, DT, config);
    expect(after.hearts).toBe(0);
    expect(after.outcome).toBe('lost');
  });
});

describe('a lost run is frozen', () => {
  it('step returns the lost state unchanged — the clock, the tanks and the pending spawns all stop', () => {
    const lost = { ...lostState(), pending: [4] };
    expect(step(lost, DT, config)).toBe(lost);
  });

  it('step does not land a drone that was in flight when the run was lost', () => {
    const lost: GameState = { ...lostState(), drone: { kind: 'hit', x: 0.31, lane: 1, targetId: 2 } };
    expect(step(lost, DT, config)).toBe(lost);
  });

  it('selectTank ignores every tap after the run is lost', () => {
    const lost: GameState = {
      ...lostState(),
      problem: { a: 3, op: '+', b: 4, answer: 7, targetId: 2 },
    };
    expect(selectTank(lost, 2)).toBe(lost);
  });

  it('ensureProblem sets no problem after the run is lost, and draws no randomness doing it', () => {
    const lost = lostState();
    expect(lost.problem).toBeNull();
    expect(lost.tanks.length).toBeGreaterThan(0);
    const { rng, draws } = countingRng(9);
    expect(ensureProblem(lost, rng, config)).toBe(lost);
    expect(draws()).toBe(0);
  });
});

/** The loop `main.ts` runs, with no taps at all: every tank breaches. */
function playUntouched(seconds: number, seed: number): GameState[] {
  const rng = createRng(seed);
  let current = createGameState(config, rng);
  const frames: GameState[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    current = ensureProblem(step(current, DT, config), rng, config);
    frames.push(current);
  }
  return frames;
}

describe('a played run with no taps', () => {
  const frames = playUntouched(60, 21);

  it('loses — the run ends on its own, with no caller deciding to stop it', () => {
    expect(frames[frames.length - 1]?.outcome).toBe('lost');
    expect(frames[frames.length - 1]?.hearts).toBe(0);
  });

  it('only ever loses hearts, one breach at a time at this config, never gaining one back', () => {
    for (let i = 1; i < frames.length; i += 1) {
      const lost = (frames[i - 1]?.hearts ?? 0) - (frames[i]?.hearts ?? 0);
      expect([0, 1]).toContain(lost);
    }
  });

  it('stops changing from the step it is lost', () => {
    const lostAt = frames.findIndex((frame) => frame.outcome === 'lost');
    expect(lostAt).toBeGreaterThan(0);
    for (const frame of frames.slice(lostAt)) expect(frame).toBe(frames[lostAt]);
  });

  it('replays an identical loss from the same seed', () => {
    expect(playUntouched(60, 21)).toEqual(frames);
  });

  it('plays a different wave from a different seed — what a restart on a fresh seed relies on', () => {
    const a = createGameState(config, createRng(1));
    const b = createGameState(config, createRng(2));
    expect(a.pending).not.toEqual(b.pending);
  });
});
