import { describe, expect, it } from 'vitest';

import type { Rng } from '../../src/core/rng';
import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import { candidatePool, criticalThreshold, pickTarget } from '../../src/core/targeting';
import type { Config, GameState, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 5 (specs/05-urgency-targeting.md). DESIGN.md §5: a tank's urgency is its `x` (0 at
 * spawn, 1 at the wall); the board's highest urgency picks the tier, the tier picks the candidate
 * pool, and a pick weighted by `1 + u` picks the target. The critical threshold is derived, never
 * typed in: `1 − (2·t_answer + droneTraverseSeconds) / laneTraverseSeconds` — the last moment a
 * tank can be passed over and still be savable on the next problem.
 */

const DT = 1 / 60;

/** Every field this increment reads pinned, so retuning `defaultConfig` cannot change these tests. */
const config: Config = {
  ...defaultConfig,
  lanes: 4,
  laneTraverseSeconds: 34,
  droneTraverseSeconds: 0.4,
  tAnswerSeconds: 5,
  alertThreshold: 0.5,
  alertPoolSize: 3,
};

/** 1 − (2·5 + 0.4) / 34. */
const CRITICAL = 1 - 10.4 / 34;

function tankAt(x: number, id: number, lane = id % 4): Tank {
  return { id, lane, x, number: id };
}

const ids = (tanks: readonly Tank[]): number[] => tanks.map((tank) => tank.id).sort((a, b) => a - b);

/** An rng whose `next()` returns `value` every time, counting its draws. */
function fixedRng(value: number): { rng: Rng; draws: () => number } {
  let count = 0;
  return {
    rng: {
      next: () => {
        count += 1;
        return value;
      },
      int: (min) => {
        count += 1;
        return min;
      },
    },
    draws: () => count,
  };
}

describe('criticalThreshold — derived, never typed in', () => {
  it('is 1 − (2·t_answer + drone flight) / traverse — ≈ 0.694 at 5 s, 0.4 s and 34 s', () => {
    expect(criticalThreshold(config)).toBeCloseTo(CRITICAL, 12);
    expect(criticalThreshold(config)).toBeCloseTo(0.694, 3);
  });

  it('drops when t_answer rises — a slower player needs the answer offered sooner', () => {
    expect(criticalThreshold({ ...config, tAnswerSeconds: 8 })).toBeCloseTo(1 - 16.4 / 34, 12);
  });

  it('rises when the traverse time rises — slower tanks leave more time', () => {
    expect(criticalThreshold({ ...config, laneTraverseSeconds: 50 })).toBeCloseTo(1 - 10.4 / 50, 12);
  });

  it('drops when the drone flight time rises', () => {
    expect(criticalThreshold({ ...config, droneTraverseSeconds: 2 })).toBeCloseTo(1 - 12 / 34, 12);
  });
});

describe('candidatePool — DESIGN.md §5 tiers', () => {
  it('relaxed: offers every tank while the most urgent is below the alert threshold', () => {
    const tanks = [tankAt(0.05, 1), tankAt(0.2, 2), tankAt(0.35, 3), tankAt(0.49, 4)];
    expect(ids(candidatePool(tanks, config))).toEqual([1, 2, 3, 4]);
  });

  it('alert: offers the alertPoolSize most urgent tanks once the most urgent reaches 0.5', () => {
    const tanks = [tankAt(0.05, 1), tankAt(0.2, 2), tankAt(0.35, 3), tankAt(0.6, 4)];
    expect(ids(candidatePool(tanks, config))).toEqual([2, 3, 4]);
  });

  it('alert: honours alertPoolSize', () => {
    const tanks = [tankAt(0.05, 1), tankAt(0.2, 2), tankAt(0.35, 3), tankAt(0.6, 4)];
    expect(ids(candidatePool(tanks, { ...config, alertPoolSize: 2 }))).toEqual([3, 4]);
  });

  it('alert: offers the whole board when it holds fewer tanks than alertPoolSize', () => {
    const tanks = [tankAt(0.1, 1), tankAt(0.6, 2)];
    expect(ids(candidatePool(tanks, config))).toEqual([1, 2]);
  });

  it('alert: a most-urgent tank exactly at the alert threshold is the alert tier', () => {
    const tanks = [tankAt(0.05, 1), tankAt(0.2, 2), tankAt(0.35, 3), tankAt(0.5, 4)];
    expect(ids(candidatePool(tanks, config))).toEqual([2, 3, 4]);
  });

  it('critical: offers only the tanks at or above the critical threshold', () => {
    // Increment 6: the 0.9 tank has 3.4 s left — past the unsavable line, so never offered — and
    // the front savable tank (0.75) is critical, so it is offered alone.
    const tanks = [tankAt(0.1, 1), tankAt(0.6, 2), tankAt(0.75, 3), tankAt(0.9, 4)];
    expect(ids(candidatePool(tanks, config))).toEqual([3]);
  });

  it('critical: offers exactly one tank when only one has crossed the threshold', () => {
    const tanks = [tankAt(0.1, 1), tankAt(0.4, 2), tankAt(0.6, 3), tankAt(0.8, 4)];
    expect(ids(candidatePool(tanks, config))).toEqual([4]);
  });

  it('critical: a tank exactly at the critical threshold is critical', () => {
    const tanks = [tankAt(0.1, 1), tankAt(0.6, 2), tankAt(CRITICAL, 3)];
    expect(ids(candidatePool(tanks, config))).toEqual([3]);
  });

  it('critical wins when a huge t_answer derives a threshold below the alert threshold', () => {
    const slow: Config = { ...config, tAnswerSeconds: 12 }; // 1 − 24.4/34 ≈ 0.28
    const tanks = [tankAt(0.1, 1), tankAt(0.3, 2), tankAt(0.45, 3)];
    // Increment 6: the critical pool runs from the front to the first critical tank — here the
    // front one alone.
    expect(ids(candidatePool(tanks, slow))).toEqual([3]);
  });

  it('does not mutate the tanks it is given', () => {
    const tanks = [tankAt(0.6, 4), tankAt(0.05, 1), tankAt(0.35, 3), tankAt(0.2, 2)];
    const before = structuredClone(tanks);
    candidatePool(tanks, config);
    expect(tanks).toEqual(before);
  });
});

describe('pickTarget — weighted toward urgency by 1 + u', () => {
  it('draws exactly one rng value per pick, even from a pool of one', () => {
    const single = fixedRng(0.5);
    pickTarget([tankAt(0.3, 1)], single.rng);
    expect(single.draws()).toBe(1);

    const several = fixedRng(0.5);
    pickTarget([tankAt(0.1, 1), tankAt(0.4, 2), tankAt(0.7, 3)], several.rng);
    expect(several.draws()).toBe(1);
  });

  it('maps the draw onto cumulative 1 + u weights in pool order', () => {
    // Weights 1 and 2, total 3: a draw below 1/3 lands on the first tank, above it on the second.
    const pool = [tankAt(0, 1), tankAt(1 - 1e-12, 2)];
    expect(pickTarget(pool, fixedRng(0.3).rng).id).toBe(1);
    expect(pickTarget(pool, fixedRng(0.34).rng).id).toBe(2);
    expect(pickTarget(pool, fixedRng(0.999).rng).id).toBe(2);
  });

  it('picks a tank at the wall about twice as often as one just spawned', () => {
    const pool = [tankAt(0, 1), tankAt(0.999, 2)];
    const rng = createRng(77);
    let nearWall = 0;
    const picks = 20000;
    for (let i = 0; i < picks; i += 1) if (pickTarget(pool, rng).id === 2) nearWall += 1;
    const ratio = nearWall / (picks - nearWall);
    expect(ratio).toBeGreaterThan(1.85);
    expect(ratio).toBeLessThan(2.15);
  });

  it('can pick every tank in the pool — the relaxed tier really varies', () => {
    const pool = [tankAt(0.05, 1), tankAt(0.2, 2), tankAt(0.35, 3), tankAt(0.45, 4)];
    const rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) seen.add(pickTarget(pool, rng).id);
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('throws on an empty pool', () => {
    expect(() => pickTarget([], createRng(1))).toThrow();
  });
});

function boardOf(tanks: Tank[]): GameState {
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
  };
}

describe('ensureProblem — targets through the tiers', () => {
  it('never targets a tank outside the critical pool, across many seeds', () => {
    const board = boardOf([tankAt(0.1, 1), tankAt(0.3, 2), tankAt(0.5, 3), tankAt(0.8, 4)]);
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(ensureProblem(board, createRng(seed), config).problem?.targetId).toBe(4);
    }
  });

  it('targets a tank other than the front one on some seeds in the relaxed tier', () => {
    const board = boardOf([tankAt(0.1, 1), tankAt(0.2, 2), tankAt(0.3, 3), tankAt(0.4, 4)]);
    const targets = new Set<number | undefined>();
    for (let seed = 1; seed <= 50; seed += 1) {
      targets.add(ensureProblem(board, createRng(seed), config).problem?.targetId);
    }
    expect([...targets].some((id) => id !== 4)).toBe(true);
  });
});

/**
 * A scripted run the way `main.ts` plays it: one rng stream, `ensureProblem` after `step`. It taps
 * every `TAP_EVERY_STEPS` steps, every third answer wrong, so problems stay live across misses.
 */
const TAP_EVERY_STEPS = 150; // 2.5 s
const WRONG_EVERY_NTH = 3;

interface Frame {
  /** The state after `step`, before `ensureProblem` — the board a new problem is chosen from. */
  stepped: GameState;
  state: GameState;
}

function playedRun(seed: number, seconds: number): Frame[] {
  const rng = createRng(seed);
  let current = createGameState(config, rng);
  const frames: Frame[] = [];
  let answers = 0;
  for (let i = 0; i < Math.round(seconds / DT) && current.outcome === 'playing'; i += 1) {
    const { problem } = current;
    if (problem !== null && current.drone === null && i % TAP_EVERY_STEPS === 0) {
      answers += 1;
      const wrong = answers % WRONG_EVERY_NTH === 0;
      const tapped = current.tanks.find((tank) =>
        wrong ? tank.id !== problem.targetId : tank.id === problem.targetId,
      );
      if (tapped !== undefined) current = selectTank(current, tapped.id);
    }
    const stepped = step(current, DT, config);
    current = ensureProblem(stepped, rng, config);
    frames.push({ stepped, state: current });
  }
  return frames;
}

describe('a played run — the answer never changes under the player (DESIGN.md §5)', () => {
  const seeds = [3, 17, 42];

  it.each(seeds)('keeps targetId and answer fixed for as long as the problem is live (seed %i)', (seed) => {
    const frames = playedRun(seed, 90);
    for (let i = 1; i < frames.length; i += 1) {
      const before = frames[i - 1]?.state.problem;
      const after = frames[i]?.state.problem;
      if (before === undefined || before === null || after === undefined || after === null) continue;
      if (after === before) continue;
      // A different problem is only allowed once the old target has left the board.
      const stillThere = frames[i]?.stepped.tanks.some((tank) => tank.id === before.targetId);
      expect(stillThere).toBe(false);
    }
  });

  it.each(seeds)('sets every new problem on a tank from the candidate pool of its board (seed %i)', (seed) => {
    for (const { stepped, state } of playedRun(seed, 90)) {
      if (stepped.problem !== null || state.problem === null) continue;
      const pool = candidatePool(stepped.tanks, config).map((tank) => tank.id);
      expect(pool).toContain(state.problem.targetId);
    }
  });

  it('does not always put the answer on the front tank', () => {
    let notFront = 0;
    for (const seed of seeds) {
      for (const { stepped, state } of playedRun(seed, 90)) {
        if (stepped.problem !== null || state.problem === null) continue;
        const front = stepped.tanks.reduce((a, b) => (b.x > a.x ? b : a));
        if (state.problem.targetId !== front.id) notFront += 1;
      }
    }
    expect(notFront).toBeGreaterThan(0);
  });
});
