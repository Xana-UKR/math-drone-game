# Build Plan

**Status: increment 0 complete (`bed74b9`). Next: increment 1 — tanks move.**

Carried into increment 1:

- Delete `src/core/placeholder.ts` — it exists only so `tsconfig.core.json` has inputs, and
  increment 1's spec must name it.
- **`Date.now()` is reachable from core** and no config can exclude it (it is in the ES lib, not
  the DOM lib). Time must be *injected* into `step()`, not read — same hazard class as
  `Math.random`, but unenforceable mechanically, so it belongs in the spec.
- The core-boundary guards ship with known holes (dynamic `import()`, inline `eslint-disable`,
  tests co-located under `src/` being skipped). Details in `JOURNAL.md`; harden when one bites,
  or as a standalone chore before increment 5.

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
| **4a** | **Hearts and losing.** Hearts = 3; a breach costs one and destroys the tank; zero hearts ends the run; full-screen tap-to-restart | vertical | You let tanks through, lose, restart in one tap |
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
| Problems | add/sub within 20, no borrowing | §2 default preset |
| Distractors | well-separated, not near-misses | §9, for age 7 |

The critical threshold is **computed** from `t_answer` and traverse time, never typed in — §6 is
explicit that this is the one threshold that must be derived. Encode it as a function so changing
`t_answer` moves it automatically.

## Two disciplines

1. **Don't make it pretty before increment 9.** Real art before the simulation has tuned `t_answer`
   means re-tuning against assets that are expensive to change. Rectangles are a feature until then.
2. **Increment 1 already draws the number as `<text>` inside the tank group.** §13 calls the tank
   text safe zone the most fragile part of the asset contract — prove it on day two, not at
   increment 10.

## Where the target player enters

**After 4b.** That first unassisted session is the only real source for `t_answer`, and increment 9
is worthless without it. Watch, don't help, and note how long she stares before tapping.
