# Build Plan

**Status: increment 2 complete. Next: increment 3 — tap to shoot.**

Carried into increment 3:

- **Hold the target player's first session until increment 5 is in — but do not reorder the ladder.**
  5 is already the increment after 4b, so this only moves the session, not the work. With increment
  2's placeholder targeting the answer is always on the tank nearest the wall (every tank moves at
  one speed and the placeholder picks the oldest), which is learnable: tap the front tank, skip the
  arithmetic. A `t_answer` measured from a session played that way is measured from a child not
  doing the math, and increment 9 tunes everything against that number. **What 5 does not fix:** on
  a crowded board §5 picks its pool from `u_max`, so the critical tier fires and hands you the same
  front tank the placeholder does. Excluding tanks that are already unsavable is §6's job, in
  increment 6. 5 buys variety early in a wave, when the relaxed tier lets any tank be the answer —
  which is the variation this game wants, and reason enough to keep 5 where it is rather than
  hurrying it forward.
- **Expect to slow `spawnIntervalSeconds` while building 4a.** At the placeholder config tanks
  arrive every 2.5 s and cross in 20 s, so at the assumed 5 s answer time the queue grows whatever
  you target: tanks 8 onward breach and the run is lost around the tenth. That is a spawn-rate
  problem, not a targeting one. Increment 9 replaces the value with a measured one; until then it
  is the dial to turn to see a win at all.
- **The clock is now banned inside `src/core/**`** — this was increment 2's carried item and it is
  closed. `no-restricted-globals` bans the `Date` binding itself (which covers `Date.now()`,
  `Date()`, `new Date()`, an aliased `const D = Date`, and a bare reference) and `globalThis`
  (which is how `globalThis.Date` and `globalThis.document` would otherwise walk past every other
  guard). The narrower `no-restricted-properties` and `NewExpression` rules are kept alongside it
  for their specific messages. Increment 0 recorded this as "unenforceable mechanically" — that
  was wrong, and `test/core/boundary.test.ts` now proves all six forms.
- The core-boundary guards were hardened after review (dynamic `import()`, inline `eslint-disable`,
  co-located tests, warnings, file-extension globs). Two gaps remain open on purpose: the
  pre-commit hook checks the working tree rather than the index, and `npm run check` never runs
  `vite build`. The second now has teeth — `src/app/` and `src/render/` carry real code as of
  increment 1, so nothing mechanical catches a break in them. Both are in `JOURNAL.md`.

How we execute `DESIGN.md`. Rules for working live in `CLAUDE.md`; reasoning lives in `WORKFLOW.md`.

## Settled decisions

| Decision | Detail |
|---|---|
| **Run shape** | Finite, winnable wave — DESIGN.md §7 |
| **Stack** | TypeScript + Vite + Vitest, DOM/inline-SVG, no engine — DESIGN.md §17 |
| **Order** | Playable first: ugly rectangles end-to-end before tuning or art |
| **Practice mode** | Late (increment 10+) — the target player is fine starting under time pressure |

## The ladder

| # | Increment | Kind | Done when |
|---|---|---|---|
| **0** | **Scaffold.** Vite + TS(strict) + Vitest; `src/{core,render,app,assets}` + `test/`; ESLint core-boundary rule; `npm run check`; pre-commit hook | infra | `npm run dev` serves; `npm run check` passes; a deliberate `document` reference in `core/` fails the build |
| **1** | **Tanks move.** Core: `types.ts`, seeded `rng.ts`, `step()` moving tanks right and removing them at the wall. Render: SVG lanes, `<rect>` tanks, number as `<text>`. App: fixed-timestep rAF loop | vertical | You watch tanks cross and vanish + test: after 20 s simulated at speed v, x == wall |
| **2** | **Problem generation.** Add/sub within 20; all §9 generator constraints; seeded; target tank chosen by the caller. Problem drawn on the base | core | Tests green; a problem shows on the wall matching some tank's number |
| **3** | **Tap to shoot.** Correct → drone flies the lane, tank dies, new problem. Wrong → diagonal drone off-screen, problem unchanged. One drone in flight; no retargeting | vertical | **First playable moment** — playable endlessly, no stakes |
| **4a** | **Hearts and losing.** Hearts = 3; a breach costs one and destroys the tank; zero hearts ends the run; full-screen tap-to-restart, **each restart drawing a fresh seed** — the played run seeds itself at start, the increment-9 harness injects one, and `core/` never creates its own | vertical | You let tanks through, lose, restart in one tap — and the wave is different each time |
| **4b** | **Drones, wave and winning.** Pool starts at N; every answer costs one; +1 per M correct; wave of N; win = wave exhausted with hearts remaining; **loss checked first** on simultaneous impact | vertical | You complete a run to a **win**; a test proves the `floor(N/M)` error budget |
| | *— end of Milestone 1: a complete, ugly, winnable game —* | | |
| **5** | **Urgency targeting.** §5 tiers and weighted pick; critical threshold **derived** as `t_answer / traverse_time`, never a typed-in feel number | core | A test per tier; the answer never changes mid-problem |
| **6** | **Fairness invariant + spawn governor.** §6 assertion in dev builds; state-dependent spawning replaces the fixed list | core | Setting `t_answer` absurdly high makes the assertion fire |
| **7** | **Distractor strategies.** Adjacent times-table fact, off-by-one/carry, operand confusion, digit reversal — named, per-tier | core | A test per strategy; age-7 tier yields well-separated distractors |
| **8** | **Outcome logging.** Per problem: the problem, chosen answer, which distractor, elapsed time | core | A run dumps records; nothing consumes them yet |
| **9** | **Simulation harness.** Headless; player modelled as `(t_answer, accuracy)`; 1000 runs per preset; report run length, win rate, breach rate, "no safe answer available" count. **Then tune.** | core | Win rates per preset; DESIGN.md §17a.1 and §17a.2 closed |
| **10+** | Practice mode → real assets (§13 manifest, named SVG groups, sprite sheets, dev asset page) → presets UI → audio (Howler) → recall mode → profiles/stats → PWA + offline | mixed | per DESIGN.md §18 priority |

**Effort:** leave at the Claude Code default (`xhigh`) throughout, except increments **6** and **9** —
set `max` when opening those sessions. Set it at session start, never mid-session (`WORKFLOW.md`).

Increments 1, 3, 4a and 4b are **vertical** slices (core + render). 2 and 5–9 are pure core, added
underneath a game that already runs — so nothing is ever un-playable, and the "all the logic first"
trap is avoided.

## Placeholder config for Milestone 1

A `Config` object in `core/types.ts`, not scattered constants. Increment 9 replaces these with
measured values.

| Setting | Value | Source |
|---|---|---|
| Lanes | 4 | §3 (3–6; responsive later) |
| Lane traverse time | 20 s | slow tier per §12 |
| `t_answer` assumption | 5 s | §17a.1 placeholder — to be measured, not trusted |
| **Critical urgency threshold** | **0.75** | *derived*: `t_answer / traverse` = 5/20 (§6.1) |
| Alert threshold | 0.5 | §5 placeholder |
| Drone flight time | ~0.4 s | §4 — drama dial, not fairness |
| Hearts | 3 | §7 |
| Drones | start N, +1 per M=3 correct | §7 |
| Wave size N | 12 | §7 — gives a 4-mistake error budget |
| Problems | add/sub within 20, carrying and borrowing allowed | §2 default preset |
| Distractors | well-separated, not near-misses | §9, for age 7 |

The critical threshold is **computed** from `t_answer` and traverse time, never typed in — §6 is
explicit that this is the one threshold that must be derived. Encode it as a function so changing
`t_answer` moves it automatically.

**`allowCarry` ships `true`, reversing this table's original "no borrowing".** `4+3` and `8+7` are
both "under 20" and wildly different (§10), and the second is the one worth putting in front of a
7-year-old — increment 9 should tune against the problems she will actually see. It is a `Config`
knob, so `false` stays available as the easier preset for a younger player.

**`Config` does not hold this whole table yet, deliberately.** Each increment adds the fields it
uses, so an unused constant can never drift out of sync with the increment that defines its
meaning. As of increment 2 it holds `lanes`, `laneTraverseSeconds`, `spawnIntervalSeconds`,
`spawnCount`, `answerMin`, `answerMax`, `operandMin`, `operandMax` and `allowCarry`.

**Increment 1 ships `spawnCount: 20`, which is not the wave size N = 12 above.** It is a fixed
pre-wave spawn list, long enough to watch tanks cross, and is named `spawnCount` rather than
`waveSize` precisely so it claims no wave semantics. Increment 4b introduces the real wave of
N = 12 and retires it; increment 6's governor retires the fixed list itself.

## Two disciplines

1. **Don't make it pretty before increment 9.** Real art before the simulation has tuned `t_answer`
   means re-tuning against assets that are expensive to change. Rectangles are a feature until then.
2. **Increment 1 already draws the number as `<text>` inside the tank group.** §13 calls the tank
   text safe zone the most fragile part of the asset contract — prove it on day two, not at
   increment 10.

## Where the target player enters

**After 5**, not after 4b — see the note at the top. That first unassisted session is the only
real source for `t_answer`, and increment 9 is worthless without it. Until 5 lands, the answer is
always on the front tank, which is learnable without doing any arithmetic. Watch, don't help,
and note how long she stares before tapping.
