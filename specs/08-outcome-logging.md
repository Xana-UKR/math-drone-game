# Increment 8 — Outcome logging

DESIGN §14 says: "Record outcomes from day one". Each problem gets a record: the problem, what was
tapped, and how long it took. Each run records its `mistakeAnswers` level. The log is what the
play session after 8 uses to compare `?mistakes=off` with `?mistakes=traps`. Nothing reads it yet.
**Decided with the author 2026-10-11:** the log is a `GameState` field. Each event is written by
the function that causes it, not inferred afterwards from state differences. Adding `log: []` to
the state literals in existing tests changes no assertion, so it does not count as modifying a
test.

## In scope

- **`src/core/types.ts`**:
  - `GameState.log: ProblemRecord[]`, in the order the problems were shown.
  - `ProblemRecord` is `{ problem: Problem, shownAt, taps: { chosen, seconds }[], result }`.
    - `shownAt` is `state.time`, in game time. `seconds` counts from `shownAt`.
    - `result` is `'open' | 'correct' | 'breached' | 'runEnded'`.
- **`src/core/step.ts`** — each event is written by the function that causes it. Only the last
  record can be `'open'`.
  - `ensureProblem` appends an `'open'` record when it sets a problem.
  - `selectTank` adds a tap to that record on every launch, hit or miss. A refused tap logs
    nothing.
  - `step` closes the record:
    - `'correct'` on its drone's impact;
    - `'breached'` when its tank reaches the wall;
    - `'runEnded'` when the run is lost while it is still live.
  - `createGameState` starts the log empty.
- **New `src/core/outcomes.ts`**: `runLog(state, config, seed)` returns
  `{ seed, mistakeAnswers, mistakeKinds, outcome, seconds, problems }` for a finished run.
  - It lives in core so that increment 9's harness builds the same log.
  - `mistakeKinds` is there so that old logs stay readable if the active kinds are narrowed after
    a play session.
- **`src/app/main.ts`**: when a run ends, prints `runLog(...)` once with `console.info` as JSON,
  in every build, so that a play session can copy it out.
  - **Added at verification (the author):** fractional numbers (the times) are printed rounded to
    2 decimals. Core and `runLog` keep exact values, which increment 9 needs.
- **The distractor kind is not stored.** It is computed later with `mistakesFor` (PLAN.md).
- **Tests:**
  - a new `test/core/outcomes.test.ts`;
  - `log: []` added to the state literals in 8 existing test files (drone, fairness, hearts,
    refill, step, summary, targeting, wave). Nothing else in them changes.

## Out of scope

- Storing the log (localStorage or profiles, §15 and 10+), a "save to file" button, and anything on
  screen.
- `wrongAnswers` stays as it is, although the log now holds the same facts. Merging them would
  change the end-of-run summary and its tests.
- Labelling taps with a mistake kind, any analysis of the log, and the harness (9).

## Done when

- `npm run check` passes.
- After a browser run, the console shows one JSON log. It holds the seed, the level, one record
  per problem shown with its taps and timings, and the run's outcome.

## At the record step

- **DESIGN §14:** what the log holds, and that it is console-only for now.
- **PLAN:** the status line.
