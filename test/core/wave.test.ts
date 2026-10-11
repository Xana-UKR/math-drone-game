import { describe, expect, it } from 'vitest';

import type { Rng } from '../../src/core/rng';
import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import type { Config, GameState, LiveProblem, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 4b (specs/04b-drones-wave-winning.md). DESIGN.md §7: a run is a finite wave of N
 * tanks; the drone pool starts at N, every answer costs one, and every M correct answers land one
 * back. The run is won once the wave is exhausted with hearts left — the loss checked first.
 * (4b's §6 empty-board floor retired in increment 4c; lane refill is in refill.test.ts.)
 */

/** Every field pinned, so retuning `defaultConfig` cannot quietly change what these tests mean. */
const config: Config = {
  ...defaultConfig,
  lanes: 4,
  laneTraverseSeconds: 34,
  openingStagger: 0.1,
  waveSize: 13,
  resupplyEvery: 4,
  droneTraverseSeconds: 0.4,
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
  hearts: 3,
};

const DT = 1 / 60;
/** Half of one fixed step's advance short of the wall: any single step breaches it. */
const ONE_STEP_FROM_WALL = 1 - DT / config.laneTraverseSeconds / 2;

function tankAt(x: number, overrides: Partial<Tank> = {}): Tank {
  return { id: 1, lane: 0, x, number: 12, ...overrides };
}

function boardOf(
  tanks: Tank[],
  overrides: Partial<GameState> = {},
): GameState {
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

/**
 * Tank 1 is the target (number 13), tank 2 a far distractor that keeps the wave unfinished, so an
 * impact on tank 1 never also wins the run.
 */
function targetAndDistractor(overrides: Partial<GameState> = {}): GameState {
  return boardOf(
    [tankAt(0.5, { id: 1, number: 13 }), tankAt(0.1, { id: 2, lane: 1, number: 7 })],
    { problem: PROBLEM_FOR_TANK_1, ...overrides },
  );
}

/** Steps until the drone in flight resolves; returns the state of the step it resolved on. */
function flyToEnd(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 600 && current.drone !== null; i += 1) current = step(current, DT, config);
  if (current.drone !== null) throw new Error('fixture: the drone never resolved');
  return current;
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

describe('the wave and the pool at the start of a run', () => {
  it('starts the drone pool at waveSize — DESIGN.md §7: the pool starts at N', () => {
    const state = createGameState({ ...config, waveSize: 9 }, createRng(1));
    expect(state.drones).toBe(9);
  });

  it('starts with no correct answers', () => {
    expect(createGameState(config, createRng(1)).correct).toBe(0);
  });

  it('ships N = 13 and M = 4 in defaultConfig, as decided for increment 4b', () => {
    expect(defaultConfig.waveSize).toBe(13);
    expect(defaultConfig.resupplyEvery).toBe(4);
  });
});

describe('selectTank — every answer costs a drone', () => {
  it('a correct tap costs one drone', () => {
    expect(selectTank(targetAndDistractor({ drones: 5 }), 1).drones).toBe(4);
  });

  it('a wrong tap costs one drone', () => {
    expect(selectTank(targetAndDistractor({ drones: 5 }), 2).drones).toBe(4);
  });

  it('refuses every tap with an empty pool — returns the state itself, no drone launched', () => {
    const dry = targetAndDistractor({ drones: 0 });
    expect(selectTank(dry, 1)).toBe(dry);
    expect(selectTank(dry, 2)).toBe(dry);
  });

  it('does not mutate the state it is given when it spends a drone', () => {
    const state = targetAndDistractor({ drones: 5 });
    const before = JSON.parse(JSON.stringify(state)) as GameState;
    selectTank(state, 1);
    expect(state).toEqual(before);
  });
});

describe('step — correct answers and resupply land on impact', () => {
  it('counts a correct answer when the drone destroys its target, not at the tap', () => {
    const launched = selectTank(targetAndDistractor({ correct: 1 }), 1);
    expect(launched.correct).toBe(1);
    expect(flyToEnd(launched).correct).toBe(2);
  });

  it('grants one drone on the impact that brings correct to a multiple of resupplyEvery', () => {
    const launched = selectTank(targetAndDistractor({ correct: 3, drones: 5 }), 1);
    expect(launched.drones).toBe(4);
    const after = flyToEnd(launched);
    expect(after.correct).toBe(4);
    expect(after.drones).toBe(5);
  });

  it('grants nothing on an impact between multiples of resupplyEvery', () => {
    const after = flyToEnd(selectTank(targetAndDistractor({ correct: 1, drones: 5 }), 1));
    expect(after.correct).toBe(2);
    expect(after.drones).toBe(4);
  });

  it('counts nothing for a miss drone leaving the board', () => {
    const after = flyToEnd(selectTank(targetAndDistractor({ correct: 3, drones: 5 }), 2));
    expect(after.correct).toBe(3);
    expect(after.drones).toBe(4);
  });

  it('counts nothing for an orphaned hit whose target is already gone', () => {
    const orphaned = targetAndDistractor({
      correct: 3,
      drones: 5,
      drone: { kind: 'hit', x: 1, lane: 3, targetId: 99 },
    });
    const after = step(orphaned, DT, config);
    expect(after.drone).toBeNull();
    expect(after.correct).toBe(3);
    expect(after.drones).toBe(5);
  });
});

describe('step — winning', () => {
  it('wins in the step a drone destroys the last tank of the wave', () => {
    const launched = selectTank(boardOf([tankAt(0.5, { number: 13 })], { problem: PROBLEM_FOR_TANK_1 }), 1);
    let current = launched;
    while (current.drone !== null) {
      expect(current.outcome).toBe('playing');
      current = step(current, DT, config);
    }
    expect(current.tanks).toEqual([]);
    expect(current.outcome).toBe('won');
  });

  it('wins in the step the last tank of the wave breaches with hearts remaining', () => {
    const after = step(boardOf([tankAt(ONE_STEP_FROM_WALL)]), DT, config);
    expect(after.hearts).toBe(2);
    expect(after.outcome).toBe('won');
  });

  it('does not win while numbers are still pending', () => {
    const after = step(boardOf([tankAt(ONE_STEP_FROM_WALL)], { pending: [4] }), DT, config);
    expect(after.outcome).toBe('playing');
  });

  it('loses, not wins, when the last tank of the wave takes the last heart — loss is checked first', () => {
    const after = step(boardOf([tankAt(ONE_STEP_FROM_WALL)], { hearts: 1 }), DT, config);
    expect(after.tanks).toEqual([]);
    expect(after.outcome).toBe('lost');
  });

  it('freezes a won run — step, selectTank and ensureProblem return it unchanged, drawing nothing', () => {
    const won = step(boardOf([tankAt(ONE_STEP_FROM_WALL)]), DT, config);
    expect(won.outcome).toBe('won');
    expect(step(won, DT, config)).toBe(won);

    // A tank and a problem planted on the won board, so each call has something it would act on.
    const planted: GameState = {
      ...won,
      tanks: [tankAt(0.5, { number: 13 })],
      problem: PROBLEM_FOR_TANK_1,
    };
    expect(selectTank(planted, 1)).toBe(planted);
    const unproblemed: GameState = { ...planted, problem: null };
    const { rng, draws } = countingRng(3);
    expect(ensureProblem(unproblemed, rng, config)).toBe(unproblemed);
    expect(draws()).toBe(0);
  });
});

/**
 * The loop `main.ts` runs, with a scripted player who answers the instant a problem is live.
 * `missAt` lists, by the number of correct answers landed so far, when to answer wrong instead —
 * a value repeated is a repeated miss. A miss needs a tank that is *not* the target, so when one
 * is due on a one-tank board the player waits for the next tank rather than tapping. Runs until
 * the run ends; at most one tap per fixed step, applied before `step`, as `main.ts` drains it.
 */
function playScripted(
  playConfig: Config,
  seed: number,
  missAt: readonly number[],
): { final: GameState; frames: GameState[]; misses: number } {
  const rng = createRng(seed);
  let current = createGameState(playConfig, rng);
  const frames: GameState[] = [];
  const missesDue = [...missAt];
  let misses = 0;

  for (let i = 0; i < Math.round(600 / DT) && current.outcome === 'playing'; i += 1) {
    const { problem } = current;
    if (problem !== null && current.drone === null && current.drones > 0) {
      const due = missesDue.indexOf(current.correct);
      if (due === -1) {
        current = selectTank(current, problem.targetId);
      } else {
        const wrong = current.tanks.find((tank) => tank.id !== problem.targetId);
        if (wrong !== undefined) {
          current = selectTank(current, wrong.id);
          missesDue.splice(due, 1);
          misses += 1;
        }
      }
    }
    current = ensureProblem(step(current, DT, playConfig), rng, playConfig);
    frames.push(current);
  }

  return { final: current, frames, misses };
}

/** Misses all before the first correct answer, spread evenly, or all as late as a miss can be. */
function orderings(budget: number, waveSize: number): Record<string, number[]> {
  return {
    'up front': Array.from({ length: budget }, () => 0),
    spread: Array.from({ length: budget }, (_, i) => Math.floor((i * (waveSize - 1)) / budget)),
    // At N − 2 correct the last two tanks of the wave are left, so a non-target tank still exists.
    late: Array.from({ length: budget }, () => waveSize - 2),
  };
}

describe('the error budget is floor((N − 1) / M) wrong answers (DESIGN.md §7)', () => {
  const budget = Math.floor((config.waveSize - 1) / config.resupplyEvery);

  it('is three mistakes at the shipped N = 13, M = 4', () => {
    expect(budget).toBe(3);
  });

  for (const [name, missAt] of Object.entries(orderings(budget, config.waveSize))) {
    it(`destroys every tank and wins on full hearts with the budget's wrong answers ${name}`, () => {
      const { final, misses } = playScripted(config, 31, missAt);
      expect(misses).toBe(budget);
      expect(final.outcome).toBe('won');
      expect(final.correct).toBe(config.waveSize);
      expect(final.hearts).toBe(config.hearts);
    });
  }

  // One mistake over the budget can cost more than one tank: the resupply the last unaffordable
  // shot would have earned is lost too. At 13 / 4, four mistakes leave room for 11 hits, not 12.
  it('one wrong answer more runs the pool dry two tanks short at N = 13, M = 4 — they breach, and the run scrapes a win', () => {
    const { final, misses } = playScripted(config, 31, Array.from({ length: budget + 1 }, () => 0));
    expect(misses).toBe(budget + 1);
    expect(final.drones).toBe(0);
    expect(final.correct).toBe(config.waveSize - 2);
    expect(final.hearts).toBe(config.hearts - 2);
    expect(final.outcome).toBe('won');
  });

  const otherEconomies: { waveSize: number; resupplyEvery: number }[] = [
    { waveSize: 12, resupplyEvery: 3 },
    { waveSize: 10, resupplyEvery: 5 },
    { waveSize: 7, resupplyEvery: 2 },
  ];
  for (const economy of otherEconomies) {
    const { waveSize, resupplyEvery } = economy;
    const economyBudget = Math.floor((waveSize - 1) / resupplyEvery);

    it(`holds at N = ${waveSize}, M = ${resupplyEvery}: ${economyBudget} wrong answers win clean, one more leaves tanks unanswered`, () => {
      const economyConfig: Config = { ...config, ...economy };
      const atBudget = playScripted(economyConfig, 32, Array.from({ length: economyBudget }, () => 0));
      expect(atBudget.final.correct).toBe(waveSize);
      expect(atBudget.final.hearts).toBe(config.hearts);

      const over = playScripted(economyConfig, 32, Array.from({ length: economyBudget + 1 }, () => 0));
      expect(over.final.drones).toBe(0);
      expect(over.final.correct).toBeLessThan(waveSize);
      // Every tank the pool could not answer breached, one heart each.
      expect(over.final.hearts).toBe(Math.max(0, config.hearts - (waveSize - over.final.correct)));
    });
  }
});
