import { describe, expect, it } from 'vitest';

import { candidateProblems, generateProblem } from '../../src/core/problem';
import { createRng } from '../../src/core/rng';
import type { Config, Problem } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * DESIGN.md §9: the problem is built from a tank's existing number, so the generator is asked for
 * an answer and returns an arithmetic sentence that produces it. Every field is pinned so that
 * retuning `defaultConfig` cannot quietly change what these tests mean.
 */
const carrying: Config = {
  ...defaultConfig,
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
};

const noCarrying: Config = { ...carrying, allowCarry: false };

/** Answer 13 is the worked example below: it has carrying additions (8+5) and borrows (20-7). */
const EXAMPLE_ANSWER = 13;

function answerRange(config: Config): number[] {
  const values: number[] = [];
  for (let n = config.answerMin; n <= config.answerMax; n += 1) values.push(n);
  return values;
}

function evaluate(problem: Problem): number {
  return problem.op === '+' ? problem.a + problem.b : problem.a - problem.b;
}

/** Carrying in an addition, borrowing in a subtraction — DESIGN.md §10's one difficulty cliff. */
function regroups(problem: Problem): boolean {
  return problem.op === '+'
    ? (problem.a % 10) + (problem.b % 10) >= 10
    : problem.a % 10 < problem.b % 10;
}

function everyCandidate(config: Config): Problem[] {
  return answerRange(config).flatMap((answer) => candidateProblems(answer, config));
}

describe('candidateProblems — the DESIGN.md §9 constraints', () => {
  it('gives every answer in the configured range at least one problem, with carrying allowed', () => {
    for (const answer of answerRange(carrying)) {
      expect(candidateProblems(answer, carrying).length, `no problem produces ${answer}`).toBeGreaterThan(0);
    }
  });

  it('gives every answer in the configured range at least one problem, with carrying banned', () => {
    for (const answer of answerRange(noCarrying)) {
      expect(candidateProblems(answer, noCarrying).length, `no problem produces ${answer}`).toBeGreaterThan(0);
    }
  });

  it('only produces problems that actually evaluate to the answer asked for', () => {
    for (const answer of answerRange(carrying)) {
      for (const problem of candidateProblems(answer, carrying)) {
        expect(evaluate(problem)).toBe(answer);
        expect(problem.answer).toBe(answer);
      }
    }
  });

  it('never produces an operand outside [operandMin, operandMax]', () => {
    const narrow: Config = { ...carrying, operandMin: 2, operandMax: 12, answerMax: 10 };
    for (const problem of everyCandidate(narrow)) {
      for (const operand of [problem.a, problem.b]) {
        expect(operand).toBeGreaterThanOrEqual(narrow.operandMin);
        expect(operand).toBeLessThanOrEqual(narrow.operandMax);
      }
    }
  });

  it('never produces a negative result', () => {
    for (const problem of everyCandidate(carrying)) expect(evaluate(problem)).toBeGreaterThanOrEqual(0);
  });

  it('never produces an answer outside [answerMin, answerMax] — the §9 legibility cap', () => {
    for (const problem of everyCandidate(carrying)) {
      expect(problem.answer).toBeGreaterThanOrEqual(carrying.answerMin);
      expect(problem.answer).toBeLessThanOrEqual(carrying.answerMax);
    }
  });

  it('produces no carrying addition and no borrowing subtraction while allowCarry is false', () => {
    for (const problem of everyCandidate(noCarrying)) {
      expect(regroups(problem), `${problem.a} ${problem.op} ${problem.b} regroups`).toBe(false);
    }
  });

  it('produces both a carrying addition and a borrowing subtraction while allowCarry is true', () => {
    const problems = candidateProblems(EXAMPLE_ANSWER, carrying);
    expect(problems.some((problem) => problem.op === '+' && regroups(problem))).toBe(true);
    expect(problems.some((problem) => problem.op === '-' && regroups(problem))).toBe(true);
  });

  it('offers both addition and subtraction for a mid-range answer', () => {
    const ops = new Set(candidateProblems(EXAMPLE_ANSWER, carrying).map((problem) => problem.op));
    expect(ops).toEqual(new Set(['+', '-']));
  });

  it('allows a zero operand', () => {
    const problems = candidateProblems(EXAMPLE_ANSWER, carrying);
    expect(problems).toContainEqual({ a: 13, op: '+', b: 0, answer: 13 });
  });

  it('is a pure function of its arguments — it consumes no randomness', () => {
    expect(candidateProblems(EXAMPLE_ANSWER, carrying)).toEqual(
      candidateProblems(EXAMPLE_ANSWER, carrying),
    );
  });

  it('returns nothing for an answer outside the configured range', () => {
    expect(candidateProblems(carrying.answerMax + 1, carrying)).toEqual([]);
    expect(candidateProblems(-1, carrying)).toEqual([]);
  });
});

describe('generateProblem', () => {
  it('returns a problem whose answer is the number it was asked for', () => {
    for (const answer of answerRange(carrying)) {
      expect(generateProblem(answer, createRng(answer), carrying).answer).toBe(answer);
    }
  });

  it('returns only problems from the candidate list for that answer', () => {
    const allowed = candidateProblems(EXAMPLE_ANSWER, carrying);
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(allowed).toContainEqual(generateProblem(EXAMPLE_ANSWER, createRng(seed), carrying));
    }
  });

  it('returns the same problem for the same seed', () => {
    expect(generateProblem(EXAMPLE_ANSWER, createRng(7), carrying)).toEqual(
      generateProblem(EXAMPLE_ANSWER, createRng(7), carrying),
    );
  });

  it('does not always return the same candidate — the pick is drawn from the rng', () => {
    const picks = new Set<string>();
    for (let seed = 1; seed <= 50; seed += 1) {
      picks.add(JSON.stringify(generateProblem(EXAMPLE_ANSWER, createRng(seed), carrying)));
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('respects allowCarry when picking', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(regroups(generateProblem(EXAMPLE_ANSWER, createRng(seed), noCarrying))).toBe(false);
    }
  });

  it('throws rather than guessing when no problem can produce the answer', () => {
    expect(() => generateProblem(carrying.answerMax + 1, createRng(1), carrying)).toThrow();
  });
});
