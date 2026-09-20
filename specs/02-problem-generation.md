# Increment 2 — Problem generation

The problem is generated **from the tanks**, not the tanks from the problem (DESIGN.md §9): a tank
owns its number from spawn until death, and the generator builds a problem whose answer is that
tank's existing number. Add/sub within 20, seeded, all §9 constraints.

## In scope

- **`src/core/types.ts`** — `Problem { a, op: '+' | '-', b, answer }` (pure arithmetic, knows
  nothing of tanks), `LiveProblem = Problem & { targetId }`, and `GameState.problem: LiveProblem |
  null`. New `Config` fields, from PLAN.md's Milestone 1 table: `answerMin: 0`, `answerMax: 20`,
  `operandMin: 0`, `operandMax: 20`, and `allowCarry: true` — one knob for carrying *and*
  borrowing, which DESIGN.md §10 calls the real difficulty cliff. It ships **on**: `8+7` and
  `13-5` are the problems worth putting in front of a 7-year-old, and increment 9 tunes against
  what she will actually see. Turning it off is the easier preset for a younger player.
- **`src/core/problem.ts`** — `candidateProblems(answer, config): Problem[]` **enumerates** every
  valid `a op b`, and `generateProblem(answer, rng, config): Problem` picks one with `rng.int`.
  Enumeration, not rejection sampling: the ranges are tiny, and an empty result is then a provable
  fact rather than an infinite loop. Constraints: no negative results, operands in
  `[operandMin, operandMax]`, answer in `[answerMin, answerMax]` — the §9 legibility cap — and,
  only while `allowCarry` is false, no carrying in `+` or borrowing in `-`.
- **Tank numbers are answers.** `createGameState` draws each spawn's number from
  `[answerMin, answerMax]`, excluding the numbers of the `ceil(laneTraverse / spawnInterval)`
  preceding spawns — the tanks that can still be on screen. The `ceil` is deliberately not reduced
  by one: a tank is released without moving, so it holds the board for `traverse + dt` and
  outlives its own traverse time by a frame. That is §9's "no two tanks on screen may show the
  same number", enforced where the spawn list is built, so `step` stays pure
  and rng-free. §9's "no other tank is also a correct answer" then needs no code: one answer, and
  on-screen numbers are distinct.
- **`src/core/step.ts`** — `step` clears `state.problem` when its target tank is no longer on the
  board (§5: the answer re-rolls the moment its tank is gone, and never changes otherwise). New
  `ensureProblem(state, rng, config)` sets a problem when there is none and tanks exist: it is the
  only function that consumes rng draws during play, kept out of `step` so `step` stays pure until
  increment 6 needs otherwise. Its target pick is a **placeholder** — the longest-lived tank on the
  board — commented as such; §5's tiers and weighted pick are increment 5.
- **`src/app/main.ts`** — holds the rng and calls `ensureProblem` **inside** the fixed-timestep
  loop, immediately after each `step`. Once per rAF frame instead would tie rng consumption to the
  frame rate and destroy same-seed reproducibility.
- **`src/render/scene.ts`** — the base console of DESIGN.md §3: a panel on the right edge whose
  left face is the wall tanks still stop at, showing `a + b = ?` as `<text>`. Render **reads**
  `state.problem` and draws it; it never builds, picks or validates one. Every decision about what
  the problem *is* lives in `core/`, so deleting the panel would change nothing but the view.
- **`eslint.config.js`** — close the carried-over gap PLAN.md names: ban `Date.now` and
  `new Date()` inside `src/core/**`, where `noInlineConfig` makes it non-negotiable. Time is
  injected as `dt`; a reachable clock silently destroys same-seed reproducibility.

## Out of scope

- §5 urgency tiers, weighted pick, the critical threshold (increment 5) — the placeholder target
  pick is exactly what 5 replaces.
- Tapping, answering, drones, a problem *changing* because it was solved (increment 3); hearts,
  breach, win/loss (4a/4b).
- Named distractor strategies (increment 7) — distractors here are just the other tanks' numbers.
- Multiplication, division, negative results, numbers past 20 (increment 10+ presets); the §6
  fairness assertion and the spawn governor (6); outcome logging (8).
- Styling the console beyond legible text; responsive layout; jsdom tests for `render/`.

## Done when

`npm run check` passes, and the author opens `npm run dev` and sees a problem on the base console
whose answer is on exactly one tank on screen, changing when that tank reaches the wall.
Tests: every answer in `[answerMin, answerMax]` has at least one candidate problem under
`allowCarry` both true and false; no candidate goes negative or uses an out-of-range operand; with
`allowCarry` false none carries or borrows, and with it true a carrying problem is reachable; the
same seed yields the same problems; across a full simulated run no two tanks on screen ever share a
number, and the live problem's answer always matches exactly one tank on the board; `Date.now()`
and `new Date()` are rejected inside core and allowed outside it.
