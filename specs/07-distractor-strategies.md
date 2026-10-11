# Increment 7 — Distractor strategies (mistake answers)

DESIGN §9: distractors are the educational content. The wrong numbers on the board should be ones a
child gets by making a real mistake, so that only doing the sum picks the right tank. Today a
problem's distractors are just the other tanks, and their numbers are random. **Decided with the
author 2026-10-11:**
- This becomes a `Config` setting with levels, so that it can be raised as she improves.
- 7 lands before 8, so that the play session after 8 can compare levels.
- DESIGN §9's "well-separated" gap is **dropped**: she has made no wrong answers, so keeping numbers
  apart would only make the game easier.

## Simulation (session scratchpad: 300 seeds, correct answers every 5 s)

| Level | What the game does | Problem-dependent mistake on the board | Any mistake on the board |
|---|---|---|---|
| `off` (today) | random | 10% | 47% |
| **`traps`** | picks the target's problem to fit the board | **77%** (87% with 2+ other tanks) | 83% |
| `near` (7b) | `traps`, plus entering tanks prefer a neighbour of a board number | — | 90%* |

Measured on the implementation, with all five kinds active. *`near` was measured earlier, with four
kinds and the pre-review filter; re-measure it when 7b is specced.

`traps` also cuts the `x ± 0` problems (12% → 3%). `near` needs numbers drawn at entry, which
means the `GameState` change and the edits to 8 test files rejected earlier, so it is split off as
**7b**. That increment is built when the play session shows she has outgrown `traps`.

## In scope

- **New `src/core/mistakes.ts`** — the named mistakes for a `+`/`−` problem.
  - `mistakesFor(problem, config)` returns `Mistake[]` (`{ kind, value }`, exported for 8), keeping
    only the active kinds, only values inside the answer range, and never the answer itself.
  - `offByOne`: answer ± 1.
  - `offByTwo`: answer ± 2. **Added by the author:** a miscount of 1 or 2 is likely her commonest
    mistake.
  - `forgottenCarry`: only when the problem regroups. For `+` the carried ten is dropped
    (`8 + 7` → 5). For `−` the smaller ones digit is taken from the larger, with no borrow
    (`15 − 8` → 13).
  - `operationSwap`: the other operation (`8 + 7` → 1; `12 − 5` → 17).
  - `digitReversal`: a two-digit answer with differing digits, reversed (`20` → 2). Within 0–20
    this almost never fires; it is kept because DESIGN §9 names it.
- **`Config.mistakeAnswers: 'off' | 'traps'`**, shipped as `'traps'`.
- **`Config.mistakeKinds: readonly MistakeKind[]`** — which kinds count as traps. It ships with all
  five, so that they can be narrowed as play shows which ones she actually makes.
  `mistakesFor` lists only the active kinds.
  - **Note:** `offByOne`, `offByTwo` and `digitReversal` depend only on the answer, not on which
    problem is asked, so every candidate shares them. `traps` cannot add them; they still label a
    wrong tap (8), and raising them is 7b's `near`. `mistakes.ts` exports the other two as
    `PROBLEM_DEPENDENT_KINDS`.
- **`src/core/problem.ts`**: `generateProblem` gains an optional `others: readonly number[] = []`
  (the other tanks' numbers).
  - Under `'traps'`, it draws from the candidates that have at least one **problem-dependent**
    mistake on the board, if there are any. Otherwise it draws from all candidates. *(Changed at
    review: counting the answer-only kinds let every candidate through whenever one was on the
    board, so the filter did nothing.)*
  - It is still one `rng.int` draw. With `others` empty, or under `'off'`, it behaves exactly as
    today.
- **`src/core/step.ts`**: `ensureProblem` passes the other tanks' numbers.
- **`src/app/main.ts`**: in dev builds, `?mistakes=off` or `?mistakes=traps` in the URL overrides
  the setting, so that the play session can switch levels between runs without a code edit.
  *DESIGN does not cover this.*
- **Tests:** a new `test/core/mistakes.test.ts`, with:
  - one test per mistake kind;
  - a test that an inactive kind is never listed;
  - a `traps` test, where a board holding a mistake always gets a problem that uses it;
  - two tests that answer-only mistakes on the board do not count when choosing;
  - an `off` test, where the pick is identical to today's for the same seed.

  I expect no existing test to change. If one does, I stop and ask.

## Out of scope

- **`near` (7b)** and the **adjacent times-table** mistake (no `×` exists; for `+` it equals
  off-by-one).
- **Labelling wrong taps with a mistake kind.** 8 records the facts, including which level the run
  used, and the label can be computed later from `mistakesFor`.
- A preset or settings UI (10+). Retuning anything.

## Done when

- `npm run check` passes.
- In a real browser with `?mistakes=traps`, the board often shows the answer's likely mistakes
  (`8 + 7` with 14, 5 or 1 on another tank). With `?mistakes=off`, it plays as today.

## At the record step

- **DESIGN §9:** distractors are a per-preset level, not a fixed "well-separated" rule, with today's
  reasoning; the mistake list for `+`/`−`, including off-by-two; the active kinds are a setting; and
  `traps` picks the problem, not the numbers.
- **PLAN:** the status line; 7b added to the ladder; 8 records the run's level; the "Distractors" row
  and the `Config` field list.
