import { describe, expect, it } from 'vitest';

import { mistakesFor } from '../../src/core/mistakes';
import { candidateProblems, generateProblem } from '../../src/core/problem';
import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem } from '../../src/core/step';
import type { Config, GameState, MistakeKind, Problem, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 7 (specs/07-distractor-strategies.md): DESIGN.md §9's distractors as named mistakes,
 * and the `traps` level that picks the target's problem so that a mistake already on the board is
 * one this problem invites. Every field these tests depend on is pinned, so retuning
 * `defaultConfig` cannot quietly change what they mean.
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
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
  mistakeAnswers: 'traps',
  mistakeKinds: ALL_KINDS,
};

const off: Config = { ...traps, mistakeAnswers: 'off' };

function add(a: number, b: number): Problem {
  return { a, op: '+', b, answer: a + b };
}

function sub(a: number, b: number): Problem {
  return { a, op: '-', b, answer: a - b };
}

/** The values `mistakesFor` lists for one kind, sorted — order within a kind is not specified. */
function valuesOf(problem: Problem, kind: MistakeKind, config: Config = traps): number[] {
  return mistakesFor(problem, config)
    .filter((mistake) => mistake.kind === kind)
    .map((mistake) => mistake.value)
    .sort((x, y) => x - y);
}

function usesMistake(problem: Problem, value: number, config: Config = traps): boolean {
  return mistakesFor(problem, config).some((mistake) => mistake.value === value);
}

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe('mistakesFor — one test per named mistake (DESIGN.md §9)', () => {
  it('offByOne: lists the answer ± 1 (8 + 7 → 14 and 16)', () => {
    expect(valuesOf(add(8, 7), 'offByOne')).toEqual([14, 16]);
  });

  it('offByTwo: lists the answer ± 2 (8 + 7 → 13 and 17)', () => {
    expect(valuesOf(add(8, 7), 'offByTwo')).toEqual([13, 17]);
  });

  it('forgottenCarry: an addition that carries drops the carried ten (8 + 7 → 5)', () => {
    expect(valuesOf(add(8, 7), 'forgottenCarry')).toEqual([5]);
  });

  it('forgottenCarry: a subtraction that borrows takes the smaller ones digit from the larger (15 − 8 → 13)', () => {
    expect(valuesOf(sub(15, 8), 'forgottenCarry')).toEqual([13]);
  });

  it('forgottenCarry: lists nothing for a problem that does not regroup (3 + 4, 18 − 3)', () => {
    expect(valuesOf(add(3, 4), 'forgottenCarry')).toEqual([]);
    expect(valuesOf(sub(18, 3), 'forgottenCarry')).toEqual([]);
  });

  it('operationSwap: an addition done as a subtraction (8 + 7 → 1)', () => {
    expect(valuesOf(add(8, 7), 'operationSwap')).toEqual([1]);
  });

  it('operationSwap: a subtraction done as an addition (12 − 5 → 17)', () => {
    expect(valuesOf(sub(12, 5), 'operationSwap')).toEqual([17]);
  });

  it('digitReversal: a two-digit answer with differing digits, reversed (12 + 8 = 20 → 2)', () => {
    expect(valuesOf(add(12, 8), 'digitReversal')).toEqual([2]);
  });

  it('digitReversal: lists nothing for a one-digit answer or matching digits (3 + 4, 6 + 5)', () => {
    expect(valuesOf(add(3, 4), 'digitReversal')).toEqual([]);
    expect(valuesOf(add(6, 5), 'digitReversal')).toEqual([]);
  });
});

describe('mistakesFor — what it never lists', () => {
  it('never lists a value outside the answer range (0 + 0 has no −1 or −2; 15 − 8 has no 23; 13 − 1 has no 21)', () => {
    expect(valuesOf(add(0, 0), 'offByOne')).toEqual([1]);
    expect(valuesOf(add(0, 0), 'offByTwo')).toEqual([2]);
    expect(valuesOf(sub(15, 8), 'operationSwap')).toEqual([]);
    expect(valuesOf(sub(13, 1), 'digitReversal')).toEqual([]);
  });

  it('never lists the answer itself (10 + 0 done as 10 − 0 is still 10)', () => {
    expect(mistakesFor(add(10, 0), traps).map((mistake) => mistake.value)).not.toContain(10);
  });

  it('never lists a kind that is not in config.mistakeKinds', () => {
    const onlyMiscounts: Config = { ...traps, mistakeKinds: ['offByOne', 'offByTwo'] };
    const kinds = new Set(mistakesFor(add(8, 7), onlyMiscounts).map((mistake) => mistake.kind));
    expect([...kinds].sort()).toEqual(['offByOne', 'offByTwo']);
  });
});

describe('generateProblem — the traps level', () => {
  it('always asks a problem that invites a mistake already on the board (15 with a 1 on the board → 8 + 7 or 7 + 8)', () => {
    for (const seed of SEEDS) {
      const problem = generateProblem(15, createRng(seed), traps, [1]);
      expect(problem.answer).toBe(15);
      expect(usesMistake(problem, 1), JSON.stringify(problem)).toBe(true);
    }
  });

  it('still varies the problem when several candidates invite a mistake on the board', () => {
    const picks = new Set(SEEDS.map((seed) => JSON.stringify(generateProblem(15, createRng(seed), traps, [1]))));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('falls back to every candidate when none invites a mistake on the board — the same pick as off', () => {
    // No problem for 15 invites 15 as a mistake: it is the answer itself.
    for (const seed of SEEDS) {
      expect(generateProblem(15, createRng(seed), traps, [15])).toEqual(generateProblem(15, createRng(seed), off));
    }
  });

  it('ignores answer-only mistakes when choosing: 15 with a 14 and a 1 on the board → still 8 + 7 or 7 + 8', () => {
    // 14 is off-by-one for every candidate for 15, so counting it would let them all through.
    for (const seed of SEEDS) {
      const problem = generateProblem(15, createRng(seed), traps, [14, 1]);
      expect([add(8, 7), add(7, 8)], JSON.stringify(problem)).toContainEqual(problem);
    }
  });

  it('falls back to every candidate when the board holds only answer-only mistakes — the same pick as off', () => {
    // 14 and 16 are 15 ± 1; every problem-dependent mistake for 15 is odd, so neither is one.
    for (const seed of SEEDS) {
      expect(generateProblem(15, createRng(seed), traps, [14, 16])).toEqual(
        generateProblem(15, createRng(seed), off),
      );
    }
  });

  it('counts only the active kinds — a 1 on the board is no trap when operationSwap is inactive', () => {
    const noSwap: Config = { ...traps, mistakeKinds: ['offByOne', 'offByTwo', 'forgottenCarry', 'digitReversal'] };
    for (const seed of SEEDS) {
      expect(generateProblem(15, createRng(seed), noSwap, [1])).toEqual(generateProblem(15, createRng(seed), off));
    }
  });

  it('behaves exactly as before increment 7 when given no other numbers', () => {
    for (const seed of SEEDS) {
      expect(generateProblem(15, createRng(seed), traps)).toEqual(generateProblem(15, createRng(seed), off));
    }
  });

  it('still draws exactly one rng value', () => {
    const rng = createRng(9);
    generateProblem(15, rng, traps, [1]);
    const reference = createRng(9);
    generateProblem(15, reference, off);
    expect(rng.next()).toBe(reference.next());
  });

  it('only ever returns candidates for the answer', () => {
    const allowed = candidateProblems(15, traps);
    for (const seed of SEEDS) {
      expect(allowed).toContainEqual(generateProblem(15, createRng(seed), traps, [1, 5, 14]));
    }
  });
});

describe('generateProblem — the off level', () => {
  it('ignores the board: the same pick for the same seed, whatever numbers are on it', () => {
    for (const seed of SEEDS) {
      expect(generateProblem(15, createRng(seed), off, [1, 5, 14])).toEqual(generateProblem(15, createRng(seed), off));
    }
  });
});

describe('ensureProblem — passes the other tanks to the generator', () => {
  function boardOf(tanks: Tank[], config: Config): GameState {
    return { ...createGameState(config, createRng(1)), tanks, pending: [], problem: null };
  }

  it('under traps, every problem on a 15-and-1 board uses the other tank as a mistake', () => {
    const tanks: Tank[] = [
      { id: 1, lane: 0, x: 0.1, number: 15 },
      { id: 2, lane: 1, x: 0.1, number: 1 },
    ];
    for (const seed of SEEDS) {
      const problem = ensureProblem(boardOf(tanks, traps), createRng(seed), traps).problem;
      if (problem === null) throw new Error('ensureProblem set no problem on a non-empty board');
      const other = tanks.find((tank) => tank.id !== problem.targetId);
      if (other === undefined) throw new Error('no other tank on the board');
      expect(usesMistake(problem, other.number), JSON.stringify(problem)).toBe(true);
    }
  });

  it("does not count the target's own number as a mistake on the board", () => {
    // A lone tank: the only number on the board is the answer, so traps falls back and matches off.
    const tanks: Tank[] = [{ id: 1, lane: 0, x: 0.1, number: 15 }];
    for (const seed of SEEDS) {
      expect(ensureProblem(boardOf(tanks, traps), createRng(seed), traps).problem).toEqual(
        ensureProblem(boardOf(tanks, off), createRng(seed), off).problem,
      );
    }
  });
});

describe('defaultConfig — the shipped level', () => {
  it('ships near with all five mistake kinds active, as decided after increment 7b', () => {
    expect(defaultConfig.mistakeAnswers).toBe('near');
    expect([...defaultConfig.mistakeKinds].sort()).toEqual([...ALL_KINDS].sort());
  });
});
