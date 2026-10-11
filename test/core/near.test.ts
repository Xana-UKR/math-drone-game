import { describe, expect, it } from 'vitest';

import { generateProblem } from '../../src/core/problem';
import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import type { Config, GameState, MistakeKind, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 7b (specs/07b-near-distractors.md): the `near` level puts off-by-one and off-by-two
 * numbers on the board. `createGameState` draws the wave in clusters of `nearClusterSize` — each
 * number after a cluster's first neighbours one drawn before it in that cluster — and `step` lets an entering tank take the pending number with
 * the most neighbours on the board (±1 scores 2, ±2 scores 1). Which gaps count follows
 * `mistakeKinds`. `'off'` and `'traps'` are unchanged. Every field these tests depend on is pinned.
 */
const ALL_KINDS: readonly MistakeKind[] = [
  'offByOne',
  'offByTwo',
  'forgottenCarry',
  'operationSwap',
  'digitReversal',
];

const traps: Config = {
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
  tAnswerSeconds: 5,
  mistakeAnswers: 'traps',
  mistakeKinds: ALL_KINDS,
  nearClusterSize: 4,
};

const near: Config = { ...traps, mistakeAnswers: 'near' };
const off: Config = { ...traps, mistakeAnswers: 'off' };

const DT = 1 / 60;
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

/** The wave in draw order: the opening board by id (ids count up in draw order), then the queue. */
function drawOrder(state: GameState, config: Config): number[] {
  if (state.tanks.length !== Math.min(config.lanes, config.waveSize)) {
    throw new Error('fixture: the governor refused an opening tank, so pending is not in draw order');
  }
  return [...[...state.tanks].sort((a, b) => a.id - b.id).map((tank) => tank.number), ...state.pending];
}

function isNeighbour(n: number, others: readonly number[], gaps: readonly number[]): boolean {
  return others.some((other) => gaps.includes(Math.abs(other - n)));
}

/** A board with an empty lane 3 (or more), its tanks deep enough to be clearable, and a queue. */
function boardOf(numbers: number[], pending: number[]): GameState {
  const tanks: Tank[] = numbers.map((number, i) => ({ id: i + 1, lane: i, x: 0.3 + 0.05 * i, number }));
  return {
    ...createGameState(traps, createRng(1)),
    tanks,
    pending,
    nextId: tanks.length + 1,
    problem: null,
    drone: null,
  };
}

/** Numbers that entered this step, in lane order. */
function entered(before: GameState, after: GameState): number[] {
  return after.tanks
    .filter((tank) => !before.tanks.some((old) => old.id === tank.id))
    .sort((a, b) => a.lane - b.lane)
    .map((tank) => tank.number);
}

describe('createGameState under near — the clustered draw', () => {
  /**
   * Every number that does not open a cluster (draw index not divisible by `nearClusterSize`)
   * neighbours, by one of `gaps`, an earlier number of its own cluster — whenever such a number was
   * still allowed. Within 0–`answerMax`, the whole range.
   */
  function expectClustered(config: Config, gaps: readonly number[]): void {
    const size = config.nearClusterSize;
    for (const seed of SEEDS) {
      const numbers = drawOrder(createGameState(config, createRng(seed)), config);
      numbers.forEach((n, i) => {
        if (i % size === 0) return;
        const cluster = numbers.slice(i - (i % size), i);
        const earlier = numbers.slice(0, i);
        const anyAllowed = Array.from({ length: config.answerMax + 1 }, (_, k) => k).some(
          (k) => !earlier.includes(k) && isNeighbour(k, cluster, gaps),
        );
        if (anyAllowed) expect(isNeighbour(n, cluster, gaps), `seed ${seed}: ${numbers.join(',')}`).toBe(true);
      });
    }
  }

  it('draws every number that does not open a cluster as a ±1 or ±2 neighbour of an earlier one in its cluster, while one is still allowed', () => {
    expectClustered(near, [1, 2]);
  });

  it('counts only the gaps of active kinds — with only offByTwo active, each such number is exactly 2 from an earlier one in its cluster', () => {
    expectClustered({ ...near, mistakeKinds: ['offByTwo'] }, [2]);
  });

  it('with nearClusterSize 13, chains the whole wave as one cluster', () => {
    expectClustered({ ...near, nearClusterSize: 13 }, [1, 2]);
  });

  it('with nearClusterSize 1, draws exactly as traps', () => {
    for (const seed of SEEDS) {
      expect(createGameState({ ...near, nearClusterSize: 1 }, createRng(seed))).toEqual(
        createGameState(traps, createRng(seed)),
      );
    }
  });

  it('at 0–100, spreads the median wave across more than 40 numbers (clusters of 4)', () => {
    const wide: Config = { ...near, answerMax: 100, operandMax: 100 };
    const spans: number[] = [];
    for (let seed = 1; seed <= 300; seed += 1) {
      const numbers = drawOrder(createGameState(wide, createRng(seed)), wide);
      spans.push(Math.max(...numbers) - Math.min(...numbers));
    }
    spans.sort((a, b) => a - b);
    expect(spans[150]).toBeGreaterThan(40);
  });

  it('still draws waveSize distinct numbers inside the answer range', () => {
    for (const seed of SEEDS) {
      const numbers = drawOrder(createGameState(near, createRng(seed)), near);
      expect(numbers).toHaveLength(near.waveSize);
      expect(new Set(numbers).size).toBe(near.waveSize);
      for (const n of numbers) {
        expect(n).toBeGreaterThanOrEqual(near.answerMin);
        expect(n).toBeLessThanOrEqual(near.answerMax);
      }
    }
  });

  it('falls back to any allowed number when none neighbours the numbers drawn (range 0–3, only offByTwo)', () => {
    // After 0 and 2 (or 1 and 3), the two numbers left are 1 away from everything drawn.
    const config: Config = { ...near, answerMin: 0, answerMax: 3, waveSize: 4, mistakeKinds: ['offByTwo'] };
    for (const seed of SEEDS) {
      const numbers = drawOrder(createGameState(config, createRng(seed)), config);
      expect([...numbers].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    }
  });

  it('draws the same wave as traps when neither offByOne nor offByTwo is active', () => {
    const kinds: readonly MistakeKind[] = ['forgottenCarry', 'operationSwap', 'digitReversal'];
    for (const seed of SEEDS) {
      expect(createGameState({ ...near, mistakeKinds: kinds }, createRng(seed))).toEqual(
        createGameState({ ...traps, mistakeKinds: kinds }, createRng(seed)),
      );
    }
  });

  it('consumes exactly as many rng draws as traps', () => {
    for (const seed of SEEDS) {
      const a = createRng(seed);
      const b = createRng(seed);
      createGameState(near, a);
      createGameState(traps, b);
      expect(a.next()).toBe(b.next());
    }
  });
});

describe('createGameState under off and traps — unchanged by 7b', () => {
  it('draws each number uniformly from the numbers still allowed, exactly as before 7b', () => {
    for (const config of [off, traps]) {
      for (const seed of SEEDS) {
        const reference = createRng(seed);
        const expected: number[] = [];
        for (let i = 0; i < config.waveSize; i += 1) {
          const allowed = Array.from({ length: 21 }, (_, k) => k).filter((k) => !expected.includes(k));
          expected.push(allowed[reference.int(0, allowed.length)] as number);
        }
        expect(drawOrder(createGameState(config, createRng(seed)), config)).toEqual(expected);
      }
    }
  });
});

describe('step under near — the entry pick', () => {
  it('prefers a ±1 neighbour over a ±2 one (board 10, queue 8, 11 → 11)', () => {
    const before = boardOf([10], [8, 11]);
    const after = step(before, DT, { ...near, lanes: 2 });
    expect(entered(before, after)).toEqual([11]);
  });

  it('adds up the scores of every board neighbour (board 10, 14, queue 16, 12 → 12)', () => {
    // 16 is 2 from 14 (scores 1); 12 is 2 from 10 and 2 from 14 (scores 2).
    const before = boardOf([10, 14], [16, 12]);
    const after = step(before, DT, { ...near, lanes: 3 });
    expect(entered(before, after)).toEqual([12]);
  });

  it('breaks a tie by the earliest number in the queue (board 10, queue 12, 8 → 12)', () => {
    const before = boardOf([10], [12, 8]);
    const after = step(before, DT, { ...near, lanes: 2 });
    expect(entered(before, after)).toEqual([12]);
  });

  it('takes the front of the queue when no pending number neighbours the board (board 10, queue 3, 18 → 3)', () => {
    const before = boardOf([10], [3, 18]);
    const after = step(before, DT, { ...near, lanes: 2 });
    expect(entered(before, after)).toEqual([3]);
  });

  it('drops the chosen number from the queue and keeps the rest in order', () => {
    const before = boardOf([10], [3, 11, 18]);
    const after = step(before, DT, { ...near, lanes: 2 });
    expect(after.pending).toEqual([3, 18]);
  });

  it('scores against tanks that entered earlier in the same step (board 10, queue 11, 3, 13 → 11 then 13)', () => {
    // Against 10 alone, 13 scores 0 and the second entry would take 3; against 10 and 11 it scores 1.
    const before = boardOf([10], [11, 3, 13]);
    const after = step(before, DT, { ...near, lanes: 3 });
    expect(entered(before, after)).toEqual([11, 13]);
  });

  it('counts only the gaps of active kinds — with only offByTwo active, board 10, queue 11, 12 → 12', () => {
    const before = boardOf([10], [11, 12]);
    const after = step(before, DT, { ...near, lanes: 2, mistakeKinds: ['offByTwo'] });
    expect(entered(before, after)).toEqual([12]);
  });
});

describe('step under off and traps — unchanged by 7b', () => {
  it('takes the front of the queue whatever neighbours the board (board 10, queue 3, 11 → 3)', () => {
    for (const config of [off, traps]) {
      const before = boardOf([10], [3, 11]);
      const after = step(before, DT, { ...config, lanes: 2 });
      expect(entered(before, after)).toEqual([3]);
    }
  });
});

describe('generateProblem under near', () => {
  it('asks the same problem as traps for the same seed and board', () => {
    for (const seed of SEEDS) {
      for (const answer of [0, 7, 15, 20]) {
        expect(generateProblem(answer, createRng(seed), near, [1, 5, 14])).toEqual(
          generateProblem(answer, createRng(seed), traps, [1, 5, 14]),
        );
      }
    }
  });
});

describe('whole runs under near (300 seeds, correct answers every 5 s)', () => {
  /** Plays every seed to the end; returns the share of problems with a ±1/±2 on another tank. */
  function shareWithNeighbour(config: Config, onBoard?: (state: GameState) => void): number {
    let problems = 0;
    let withNeighbour = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const rng = createRng(seed);
      let state = createGameState(config, rng);
      let shown = state.problem;
      for (let i = 0; i < 400 * 60 && state.outcome === 'playing'; i += 1) {
        state = ensureProblem(state, rng, config);
        const { problem } = state;
        if (problem !== null && problem !== shown) {
          shown = problem;
          problems += 1;
          const others = state.tanks.filter((tank) => tank.id !== problem.targetId).map((tank) => tank.number);
          if (isNeighbour(problem.answer, others, [1, 2])) withNeighbour += 1;
        }
        const last = state.log[state.log.length - 1];
        if (problem !== null && state.drone === null && last !== undefined && state.time - last.shownAt >= 5) {
          state = selectTank(state, problem.targetId);
        }
        state = step(state, DT, config);
        onBoard?.(state);
      }
    }
    return withNeighbour / problems;
  }

  it('puts a ±1 or ±2 on another tank for over 60% of problems, against under half under traps', () => {
    expect(shareWithNeighbour(near)).toBeGreaterThan(0.6);
    expect(shareWithNeighbour(traps)).toBeLessThan(0.5);
  });

  it('never shows two tanks with the same number (DESIGN.md §9)', () => {
    const duplicates: number[][] = [];
    shareWithNeighbour(near, (state) => {
      const numbers = state.tanks.map((tank) => tank.number);
      if (new Set(numbers).size !== numbers.length) duplicates.push(numbers);
    });
    expect(duplicates).toEqual([]);
  }, 30_000);
});
