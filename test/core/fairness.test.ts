import { describe, expect, it } from 'vitest';

import { isClearable, isSavable, unclearableEntries } from '../../src/core/fairness';
import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import { candidatePool, criticalThreshold } from '../../src/core/targeting';
import type { Config, GameState, LiveProblem, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 6 (specs/06-fairness-governor.md). DESIGN.md §6: a player who answers every problem
 * correctly within `t_answer` never loses a tank.
 *
 * - **Savable:** a tank's time left, `(1 − x) × traverse`, is more than `t_answer`.
 * - **Place in line `k`:** 1 + the other tanks at least as close to the wall that will still be
 *   answered — the savable ones, plus the live target wherever it is.
 * - **Clearable:** answering most-urgent first, the tank's turn comes at
 *   `k·t_answer + (k−1)·flight`, and its time left exceeds that.
 *
 * The picker (§5's critical tier, per place in line), the governor (who may enter the board) and
 * the dev-build assertion all use these.
 */

const DT = 1 / 60;

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
  tAnswerSeconds: 5,
  alertThreshold: 0.5,
  alertPoolSize: 3,
};

/** A 9 s player: at 34 s and 0.4 s flight, place 3 needs 27.8 s and place 4 needs 37.2 s. */
const slow: Config = { ...config, tAnswerSeconds: 9 };

/** No tank can be cleared at all: even place 1 needs more than the whole 34 s traverse. */
const absurd: Config = { ...config, tAnswerSeconds: 40 };

/** The `x` at which a tank has `seconds` of its traverse left. */
const withLeft = (seconds: number, traverse = config.laneTraverseSeconds): number =>
  1 - seconds / traverse;

function tankAt(x: number, id: number, lane = id % 4, number = id): Tank {
  return { id, lane, x, number };
}

const ids = (tanks: readonly Tank[]): number[] => tanks.map((tank) => tank.id).sort((a, b) => a - b);

function boardOf(tanks: Tank[], overrides: Partial<GameState> = {}): GameState {
  return {
    time: 0,
    tanks,
    pending: [],
    nextId: Math.max(0, ...tanks.map((tank) => tank.id)) + 1,
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

function inLane(state: GameState, lane: number): Tank[] {
  return state.tanks.filter((tank) => tank.lane === lane);
}

describe('isSavable — DESIGN.md §6: d > v_tank × t_answer', () => {
  it('needs strictly more than t_answer left: savable at 5.01 s, not at 4.99 s', () => {
    expect(isSavable(tankAt(withLeft(5.01), 1), config)).toBe(true);
    expect(isSavable(tankAt(withLeft(4.99), 1), config)).toBe(false);
  });

  it('moves the line with t_answer — the same tank is not savable for a 9 s player', () => {
    const tank = tankAt(withLeft(7), 1);
    expect(isSavable(tank, config)).toBe(true);
    expect(isSavable(tank, slow)).toBe(false);
  });
});

describe('isClearable — §6 applied to the whole queue', () => {
  it('treats a tank alone like isSavable — place 1 needs more than t_answer left', () => {
    expect(isClearable(tankAt(withLeft(5.01), 1), [tankAt(withLeft(5.01), 1)], null, config)).toBe(true);
    expect(isClearable(tankAt(withLeft(4.99), 1), [tankAt(withLeft(4.99), 1)], null, config)).toBe(false);
  });

  it('needs 2·t_answer + flight left in place 2 — clearable at 10.5 s, not at 10.3 s', () => {
    const ahead = tankAt(withLeft(6), 1);
    const clear = tankAt(withLeft(10.5), 2);
    const late = tankAt(withLeft(10.3), 2);
    expect(isClearable(clear, [ahead, clear], null, config)).toBe(true);
    expect(isClearable(late, [ahead, late], null, config)).toBe(false);
  });

  it('needs 3·t_answer + 2·flight left in place 3 — clearable at 15.9 s, not at 15.7 s', () => {
    const ahead = [tankAt(withLeft(6), 1), tankAt(withLeft(11), 2)];
    const clear = tankAt(withLeft(15.9), 3);
    const late = tankAt(withLeft(15.7), 3);
    expect(isClearable(clear, [...ahead, clear], null, config)).toBe(true);
    expect(isClearable(late, [...ahead, late], null, config)).toBe(false);
  });

  it('does not count a tank ahead that is already past the unsavable line — it will not be answered', () => {
    const doomed = tankAt(withLeft(3), 1);
    const tank = tankAt(withLeft(10.3), 2);
    expect(isClearable(tank, [doomed, tank], null, config)).toBe(true);
  });

  it('counts the live target ahead even after it has crossed the unsavable line — it is being answered', () => {
    const target = tankAt(withLeft(3), 1);
    const tank = tankAt(withLeft(10.3), 2);
    expect(isClearable(tank, [target, tank], 1, config)).toBe(false);
  });

  it('counts the live target ahead even when it is further from the wall than the tank', () => {
    const tank = tankAt(withLeft(9), 1);
    const target = tankAt(withLeft(30), 2);
    expect(isClearable(tank, [tank, target], null, config)).toBe(true);
    expect(isClearable(tank, [tank, target], 2, config)).toBe(false);
  });

  it('counts a tank level with it as ahead of it', () => {
    const a = tankAt(withLeft(10.3), 1);
    const b = tankAt(withLeft(10.3), 2);
    expect(isClearable(b, [a, b], null, config)).toBe(false);
  });

  it('ignores the tanks behind it', () => {
    const tank = tankAt(withLeft(6), 1);
    const behind = [tankAt(withLeft(20), 2), tankAt(withLeft(30), 3), tankAt(0, 4)];
    expect(isClearable(tank, [tank, ...behind], null, config)).toBe(true);
  });
});

describe('criticalThreshold — per place in line', () => {
  it("keeps place 1 at increment 5's 1 − (2·t_answer + flight) / traverse ≈ 0.694", () => {
    expect(criticalThreshold(config, 1)).toBeCloseTo(1 - 10.4 / 34, 12);
    expect(criticalThreshold(config)).toBeCloseTo(1 - 10.4 / 34, 12);
  });

  it('is 1 − ((k+1)·t_answer + k·flight) / traverse in place k — ≈ 0.535 in place 2, ≈ 0.376 in place 3', () => {
    expect(criticalThreshold(config, 2)).toBeCloseTo(1 - 15.8 / 34, 12);
    expect(criticalThreshold(config, 3)).toBeCloseTo(1 - 21.2 / 34, 12);
  });
});

describe('candidatePool — only savable tanks, critical per place in line', () => {
  it('never offers a tank past the unsavable line while a savable one is on the board', () => {
    const tanks = [tankAt(0.9, 4), tankAt(0.3, 1), tankAt(0.2, 2), tankAt(0.1, 3)];
    expect(ids(candidatePool(tanks, config))).toEqual([1, 2, 3]);
  });

  it('offers only the front tank when it is critical', () => {
    const tanks = [tankAt(0.75, 3), tankAt(0.6, 2), tankAt(0.1, 1)];
    expect(ids(candidatePool(tanks, config))).toEqual([3]);
  });

  it('offers the front tanks up to the second in line when that one is critical — not a newcomer (seed 24 at 15.9 s)', () => {
    // #4 has 12.2 s left (not critical in place 1); #2 has 15.6 s, under place 2's 15.8 s.
    // Increment 5's alert tier offered #4, #2 or #6 here, and picked #6.
    const tanks = [tankAt(0.642, 4), tankAt(0.542, 2), tankAt(0.155, 6), tankAt(0, 7)];
    expect(ids(candidatePool(tanks, config))).toEqual([2, 4]);
  });

  it('applies the alert tier to the savable tanks only', () => {
    const tanks = [tankAt(0.95, 5), tankAt(0.6, 4), tankAt(0.35, 3), tankAt(0.2, 2), tankAt(0.05, 1)];
    expect(ids(candidatePool(tanks, config))).toEqual([2, 3, 4]);
  });

  it('offers the one tank with the most time left when no tank is savable', () => {
    const tanks = [tankAt(0.95, 2), tankAt(0.9, 1)];
    expect(ids(candidatePool(tanks, config))).toEqual([1]);
  });
});

describe('step — the governor decides who enters an empty lane', () => {
  /** Three savable tanks for a 9 s player, lane 3 empty: a newcomer would be fourth in line. */
  const fullForSlow = (overrides: Partial<GameState> = {}): GameState =>
    boardOf([tankAt(0.1, 1, 0), tankAt(0.2, 2, 1), tankAt(0.3, 3, 2, 13)], { pending: [4, 5], ...overrides });

  it('lets the next tank into an empty lane at once, at x = 0, when it would be clearable', () => {
    const board = boardOf([tankAt(0.1, 1, 0), tankAt(0.2, 2, 1), tankAt(0.3, 3, 2)], { pending: [4] });
    const after = step(board, DT, config);
    expect(inLane(after, 3).map((tank) => [tank.x, tank.number])).toEqual([[0, 4]]);
    expect(after.pending).toEqual([]);
  });

  it('holds a tank back from an empty lane when it could not be cleared behind the tanks already there', () => {
    const after = step(fullForSlow(), DT, slow);
    expect(inLane(after, 3)).toEqual([]);
    expect(after.pending).toEqual([4, 5]);
  });

  it('lets one held-back tank in once a tank ahead leaves the board, then holds the next one back again', () => {
    const problem: LiveProblem = { a: 8, op: '+', b: 5, answer: 13, targetId: 3 };
    const board = fullForSlow({
      problem,
      // A hit drone a hair behind tank 3: it impacts in this step, emptying lane 2.
      drone: { kind: 'hit', x: 0.3 + 1e-6, lane: 2, targetId: 3 },
      drones: config.waveSize - 1,
    });
    const after = step(board, DT, slow);
    expect(inLane(after, 2).map((tank) => [tank.x, tank.number])).toEqual([[0, 4]]);
    expect(inLane(after, 3)).toEqual([]);
    expect(after.pending).toEqual([5]);
  });

  it('counts the live target ahead even after it has crossed the unsavable line', () => {
    // Tank 3 has 6.8 s left — past a 9 s player's line — but is the problem being answered.
    const tanks = [tankAt(0.1, 1, 0), tankAt(0.2, 2, 1), tankAt(0.8, 3, 2, 13)];
    const problem: LiveProblem = { a: 8, op: '+', b: 5, answer: 13, targetId: 3 };
    expect(inLane(step(boardOf(tanks, { pending: [4], problem }), DT, slow), 3)).toEqual([]);
    expect(inLane(step(boardOf(tanks, { pending: [4] }), DT, slow), 3)).toHaveLength(1);
  });

  it('fills empty lanes in ascending lane order and stops at the first refusal', () => {
    const board = boardOf([tankAt(0.3, 1, 2)], { pending: [4, 5, 6] });
    const after = step(board, DT, slow);
    expect(inLane(after, 0).map((tank) => tank.number)).toEqual([4]);
    expect(inLane(after, 1).map((tank) => tank.number)).toEqual([5]);
    expect(inLane(after, 3)).toEqual([]);
    expect(after.pending).toEqual([6]);
  });

  it('always lets a tank onto an empty board, even one no player could clear — a run never stalls', () => {
    const after = step(boardOf([], { pending: [4, 5] }), DT, absurd);
    expect(after.tanks.map((tank) => [tank.lane, tank.x, tank.number])).toEqual([[0, 0, 4]]);
    expect(after.pending).toEqual([5]);
  });
});

describe('createGameState — the opening board goes through the same rule', () => {
  it('opens all four lanes at the shipped config, at the same depths as before', () => {
    const depths = createGameState(config, createRng(1))
      .tanks.map((tank) => tank.x)
      .sort((a, b) => a - b);
    expect(depths).toHaveLength(4);
    [0.025, 0.075, 0.125, 0.175].forEach((depth, i) => expect(depths[i]).toBeCloseTo(depth, 10));
  });

  it('leaves the rearmost opening position empty for a 9 s player, and queues its tank first', () => {
    for (const seed of [1, 2, 3]) {
      const full = createGameState(config, createRng(seed));
      const governed = createGameState(slow, createRng(seed));
      const rearmost = full.tanks.reduce((a, b) => (b.x < a.x ? b : a));

      expect(governed.tanks.map((tank) => tank.x).sort((a, b) => a - b)).toHaveLength(3);
      expect(governed.tanks.some((tank) => tank.lane === rearmost.lane)).toBe(false);
      expect(governed.pending).toEqual([rearmost.number, ...full.pending]);
    }
  });

  it('draws the same numbers and lanes from a seed whatever t_answer is', () => {
    const full = createGameState(config, createRng(5));
    const governed = createGameState(slow, createRng(5));
    for (const tank of governed.tanks) {
      expect(full.tanks).toContainEqual(expect.objectContaining({ lane: tank.lane, x: tank.x, number: tank.number }));
    }
  });

  it('always places the front opening tank, even when no player could clear it', () => {
    const state = createGameState(absurd, createRng(1));
    expect(state.tanks).toHaveLength(1);
    expect(state.tanks[0]?.x).toBeCloseTo(0.175, 10);
    expect(state.pending).toHaveLength(config.waveSize - 1);
  });

  it('gives the placed opening tanks distinct ids, all below nextId', () => {
    for (const cfg of [config, slow, absurd]) {
      const state = createGameState(cfg, createRng(7));
      const tankIds = state.tanks.map((tank) => tank.id);
      expect(new Set(tankIds).size).toBe(tankIds.length);
      for (const id of tankIds) expect(id).toBeLessThan(state.nextId);
    }
  });
});

describe('unclearableEntries — what the dev-build §6 assertion reports', () => {
  it('reports nothing for the shipped opening board', () => {
    expect(unclearableEntries(createGameState(config, createRng(1)), 1, config)).toEqual([]);
  });

  it('reports the opening board when t_answer is absurdly high (40 s)', () => {
    const state = createGameState(absurd, createRng(1));
    expect(unclearableEntries(state, 1, absurd)).toHaveLength(1);
  });

  it('reports a tank forced onto an empty board that no player could clear', () => {
    const board = boardOf([], { pending: [4], nextId: 9 });
    const after = step(board, DT, absurd);
    expect(unclearableEntries(after, board.nextId, absurd).map((tank) => tank.number)).toEqual([4]);
  });

  it('ignores tanks that entered before sinceId', () => {
    const state = createGameState(absurd, createRng(1));
    expect(unclearableEntries(state, state.nextId, absurd)).toEqual([]);
  });

  it('reports nothing for a tank the governor let in', () => {
    const board = boardOf([tankAt(0.3, 1, 2)], { pending: [4, 5, 6] });
    const after = step(board, DT, slow);
    expect(unclearableEntries(after, board.nextId, slow)).toEqual([]);
  });
});

/**
 * The guarantee itself, played the way `main.ts` runs the loop: a scripted player taps the right
 * tank exactly `t_answer` after each problem appears, never wrong. At most one tap per fixed step,
 * applied before `step`.
 */
interface PerfectRun {
  final: GameState;
  frames: GameState[];
  unsavableOffers: number;
  unclearable: number;
}

function playPerfect(cfg: Config, seed: number): PerfectRun {
  const rng = createRng(seed);
  let state = createGameState(cfg, rng);
  const frames: GameState[] = [state];
  let unclearable = unclearableEntries(state, 1, cfg).length;
  let unsavableOffers = 0;
  let shownAt = 0;

  for (let i = 0; i < Math.round(600 / DT) && state.outcome === 'playing'; i += 1) {
    const { problem } = state;
    if (problem !== null && state.drone === null && state.time - shownAt >= cfg.tAnswerSeconds - 1e-9) {
      state = selectTank(state, problem.targetId);
    }

    const sinceId = state.nextId;
    state = step(state, DT, cfg);
    unclearable += unclearableEntries(state, sinceId, cfg).length;

    const before = state.problem;
    state = ensureProblem(state, rng, cfg);
    const after = state.problem;
    if (after !== null && after !== before) {
      shownAt = state.time;
      const target = state.tanks.find((tank) => tank.id === after.targetId);
      if (target === undefined || !isSavable(target, cfg)) unsavableOffers += 1;
    }
    frames.push(state);
  }

  return { final: state, frames, unsavableOffers, unclearable };
}

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);

const configs: [string, Config][] = [
  ['the shipped config (5 s)', config],
  ['t_answer 7 s', { ...config, tAnswerSeconds: 7 }],
  ['t_answer 9 s, where the governor holds the fourth lane back', slow],
  ['6 lanes at t_answer 6 s', { ...config, lanes: 6, tAnswerSeconds: 6 }],
];

for (const [name, cfg] of configs) {
  describe(`a player answering correctly in exactly t_answer never loses a tank — ${name}`, () => {
    const runs = SEEDS.map((seed) => playPerfect(cfg, seed));

    it('keeps every heart and wins, across 100 seeds', () => {
      for (const { final } of runs) {
        expect(final.outcome).toBe('won');
        expect(final.hearts).toBe(cfg.hearts);
        expect(final.correct).toBe(cfg.waveSize);
      }
    });

    it('is never offered a tank already past the unsavable line', () => {
      for (const { unsavableOffers } of runs) expect(unsavableOffers).toBe(0);
    });

    it('never trips the §6 assertion', () => {
      for (const { unclearable } of runs) expect(unclearable).toBe(0);
    });
  });
}

describe('the board a perfect player sees', () => {
  it("keeps every heart on seed 24, which lost one to increment 5's pick order", () => {
    const { final } = playPerfect(config, 24);
    expect(final.hearts).toBe(config.hearts);
  });

  it('keeps a tank in every lane while numbers are queued, at the shipped config', () => {
    let checked = 0;
    for (const seed of [41, 42, 43]) {
      for (const frame of playPerfect(config, seed).frames) {
        if (frame.pending.length === 0) continue;
        checked += 1;
        expect(frame.tanks.map((tank) => tank.lane).sort()).toEqual([0, 1, 2, 3]);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never holds more than three tanks for a 9 s player', () => {
    for (const seed of [41, 42, 43]) {
      for (const frame of playPerfect(slow, seed).frames) expect(frame.tanks.length).toBeLessThanOrEqual(3);
    }
  });
});
