import type { Rng } from './rng';
import type { Config, Problem } from './types';

/** True when adding a and b requires carrying past the ones digit. */
function addRegroups(a: number, b: number): boolean {
  return (a % 10) + (b % 10) >= 10;
}

/** True when subtracting b from a requires borrowing from the tens digit. */
function subRegroups(a: number, b: number): boolean {
  return a % 10 < b % 10;
}

/**
 * Enumerates every `a op b` that evaluates to `answer` under `config` — no rejection sampling.
 * The ranges are tiny, so a full enumeration is cheap and an empty result is a provable fact
 * rather than a loop that might never terminate. Constraints applied per candidate: both operands
 * within `[operandMin, operandMax]`, and — only while `config.allowCarry` is false — no carrying
 * in `+` and no borrowing in `-`.
 *
 * The two whole-answer constraints are checked once, up front, because the result of every
 * candidate for a given answer *is* that answer: DESIGN.md §9's legibility cap
 * (`[answerMin, answerMax]`), and its ban on negative results.
 */
export function candidateProblems(answer: number, config: Config): Problem[] {
  const { answerMin, answerMax, operandMin, operandMax, allowCarry } = config;
  if (answer < answerMin || answer > answerMax) return [];
  if (answer < 0) return [];

  const problems: Problem[] = [];

  for (let a = operandMin; a <= operandMax; a += 1) {
    const b = answer - a;
    if (b < operandMin || b > operandMax) continue;
    if (!allowCarry && addRegroups(a, b)) continue;
    problems.push({ a, op: '+', b, answer });
  }

  for (let b = operandMin; b <= operandMax; b += 1) {
    const a = answer + b;
    if (a < operandMin || a > operandMax) continue;
    if (!allowCarry && subRegroups(a, b)) continue;
    problems.push({ a, op: '-', b, answer });
  }

  return problems;
}

/**
 * Picks one candidate for `answer` with a single `rng.int` draw. Throws — rather than guessing —
 * when no candidate exists, which `candidateProblems`' enumeration makes a provable fact instead
 * of a hope. The emptiness check has to come before the draw: `rng.int(0, 0)` throws its own
 * opaque range error otherwise.
 */
export function generateProblem(answer: number, rng: Rng, config: Config): Problem {
  const candidates = candidateProblems(answer, config);
  const problem = candidates.length === 0 ? undefined : candidates[rng.int(0, candidates.length)];
  if (problem === undefined) {
    throw new Error(`generateProblem: no candidate problem produces answer ${answer}`);
  }
  return problem;
}
