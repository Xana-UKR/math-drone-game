import type { Config, MistakeKind, Problem } from './types';

/** One named wrong answer to a problem (DESIGN.md §9). */
export interface Mistake {
  readonly kind: MistakeKind;
  readonly value: number;
}

/**
 * The kinds whose value depends on which problem is asked, not only on its answer. Every
 * candidate for an answer shares its off-by-one, off-by-two and reversed-digit values, so only
 * these kinds can tell one candidate from another — which is what the `traps` level chooses on
 * (`generateProblem`).
 */
export const PROBLEM_DEPENDENT_KINDS: readonly MistakeKind[] = ['forgottenCarry', 'operationSwap'];

/** True when adding a and b requires carrying past the ones digit. */
export function addRegroups(a: number, b: number): boolean {
  return (a % 10) + (b % 10) >= 10;
}

/** True when subtracting b from a requires borrowing from the tens digit. */
export function subRegroups(a: number, b: number): boolean {
  return a % 10 < b % 10;
}

/** The ones digit of a non-negative whole number. */
function ones(n: number): number {
  return n % 10;
}

/** The tens digit of a non-negative whole number below 100. */
function tens(n: number): number {
  return Math.floor(n / 10) % 10;
}

/**
 * The wrong numbers a child gets by making a real mistake on `problem` — DESIGN.md §9's
 * distractors, as named kinds (specs/07-distractor-strategies.md). Lists only kinds in
 * `config.mistakeKinds`, only values inside `[answerMin, answerMax]`, and never the answer itself.
 * A value may appear under more than one kind; order is not specified.
 */
export function mistakesFor(problem: Problem, config: Config): Mistake[] {
  const { a, op, b, answer } = problem;
  const candidates: Mistake[] = [];

  candidates.push({ kind: 'offByOne', value: answer - 1 }, { kind: 'offByOne', value: answer + 1 });
  candidates.push({ kind: 'offByTwo', value: answer - 2 }, { kind: 'offByTwo', value: answer + 2 });

  // Only when the problem regroups: `+` drops the carried ten; `-` takes the smaller ones digit
  // from the larger instead of borrowing.
  if (op === '+' && addRegroups(a, b)) {
    candidates.push({ kind: 'forgottenCarry', value: answer - 10 });
  } else if (op === '-' && subRegroups(a, b)) {
    candidates.push({
      kind: 'forgottenCarry',
      value: 10 * (tens(a) - tens(b)) + Math.abs(ones(a) - ones(b)),
    });
  }

  candidates.push({ kind: 'operationSwap', value: op === '+' ? Math.abs(a - b) : a + b });

  // Reversed digits, leading zero dropped (20 → 2); a one-digit answer or matching digits has none.
  if (answer >= 10 && answer <= 99 && ones(answer) !== tens(answer)) {
    candidates.push({ kind: 'digitReversal', value: 10 * ones(answer) + tens(answer) });
  }

  return candidates.filter(
    ({ kind, value }) =>
      config.mistakeKinds.includes(kind) &&
      value >= config.answerMin &&
      value <= config.answerMax &&
      value !== answer,
  );
}
