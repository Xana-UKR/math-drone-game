import { addRegroups, mistakesFor, PROBLEM_DEPENDENT_KINDS, subRegroups } from './mistakes';
import type { Rng } from './rng';
import type { Config, Problem } from './types';

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
 *
 * Under `config.mistakeAnswers === 'traps'` (increment 7), the draw is from the candidates with a
 * problem-dependent mistake (`PROBLEM_DEPENDENT_KINDS` in `mistakes.ts`) equal to one of `others` —
 * the other tanks' numbers — when there are any, otherwise from all candidates. Answer-only kinds
 * (off-by-one, off-by-two, reversed digits) are shared by every candidate, so counting them would
 * let any of them through and make the filter a no-op. Under `'off'`, or with `others` empty,
 * `others` changes nothing. Still one `rng.int` draw either way. `'near'` (increment 7b) treats
 * this draw exactly as `'traps'`; its clustering happens in `createGameState` and `step`.
 */
export function generateProblem(
  answer: number,
  rng: Rng,
  config: Config,
  others: readonly number[] = [],
): Problem {
  const all = candidateProblems(answer, config);
  let candidates = all;
  if (config.mistakeAnswers === 'traps' || config.mistakeAnswers === 'near') {
    const trapping = all.filter((candidate) =>
      mistakesFor(candidate, config).some(
        (mistake) => PROBLEM_DEPENDENT_KINDS.includes(mistake.kind) && others.includes(mistake.value),
      ),
    );
    if (trapping.length > 0) candidates = trapping;
  }
  const problem = candidates.length === 0 ? undefined : candidates[rng.int(0, candidates.length)];
  if (problem === undefined) {
    throw new Error(`generateProblem: no candidate problem produces answer ${answer}`);
  }
  return problem;
}
