# Build Plan

**Status: increment 3 complete. Next: increment 4a — hearts and losing.**

Carried into increment 4a:

- **Fix the tank-breach float drift when breaching starts costing something.** `step` guards the
  drone's arrival with `DRONE_ARRIVAL_EPSILON` but the tank's `x < 1` breach filter four lines
  below accumulates the same drift unguarded. Measured: summing `dt / laneTraverseSeconds` at
  `dt = 1/60` lands *below* 1 at the nominal breach step for 18 of 22 plausible traverse times
  (5, 6, 7, 8, 11, 12, 13, 14, 15, 17, 18, 21, 22, 24, 30, 40, 45, 50 — residues 3e-15 to 5e-14),
  so the tank survives one extra step. `laneTraverseSeconds: 20` is one of the four that lands
  above 1, which is the only reason the drone needed the epsilon and the tank appeared not to.
  Harmless while a breach is free; from 4a it is the check that spends a heart, and §17a schedules
  a retune of exactly this value. Apply the same tolerance, or derive both positions from the
  clock instead of accumulating.
- **A near-wall tap shows no drone at all — deliberately left for increment 10's polish pass.**
  A target in the last ~4% of its lane is destroyed in the same fixed step the drone launches, so
  `scene.sync` never sees a drone and the tank simply vanishes. That is 0.8 s of a 20 s traverse,
  and it is the dramatic save. The robust fix is a minimum flight duration, which §4 calls a drama
  dial to be tuned by feel — so it waits for art to feel it against. Reordering the tap drain in
  `main.ts` would buy one drawn frame, but only when the accumulator runs a single step that frame,
  so it is not a fix.
- **`Drone.lane` is redundant, kept on purpose.** Core never branches on it and it is always
  `tanks.find(t => t.id === targetId).lane`, so by CLAUDE.md's own test ("would deleting it change
  a run's outcome?") it belongs to render. It stays because the approved spec and tests encode it,
  and removing it would churn both to change nothing. If increment 6's assertions or increment 9's
  replay ever have to keep it consistent with the tank, delete it then.

Still carried, from earlier increments:

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
- **Apply `spawnIntervalSeconds: 6` and `laneTraverseSeconds: 34` in 4a** — decided 2026-10-03,
  reasoning in the placeholder-config note below. 4a's spec must name `src/core/types.ts` for it.
  No test pins `defaultConfig`, so nothing breaks mechanically: every test fixture pins its own
  config, which is what those "every field pinned" comments are for. The derived critical urgency
  threshold moves from 0.75 to ~0.85 as a consequence — increment 5 computes it, never types it.
- **The original note, kept because it is the measurement:** at the placeholder config tanks
  arrive every 2.5 s and cross in 20 s, so at the assumed 5 s answer time the queue grows whatever
  you target: tanks 8 onward breach and the run is lost around the tenth. That is a spawn-rate
  problem, not a targeting one. Increment 9 replaces the value with a measured one; until then it
  is the dial to turn to see a win at all. **Increment 3 measured this**: a scripted player
  answering every 5 s settles the board at 5–8 tanks with the oldest breaching, which is the
  prediction above holding exactly. The same script answering every 0.5 s never lets a second tank
  onto the board at all — so any tuning judged against fast answers is measuring nothing.
- **The clock is banned inside `src/core/**`** — this was increment 2's carried item and it is
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
| Lane traverse time | 34 s | slow tier per §12 — **was 20 s; see the note below** |
| Spawn interval | 6 s | **decided 2026-10-03**; see the note below |
| `t_answer` assumption | 5 s | §17a.1 placeholder — to be measured, not trusted |
| **Critical urgency threshold** | **~0.85** | *derived*: `1 − t_answer / traverse` = 1 − 5/34 (§6.1) |
| Alert threshold | 0.5 | §5 placeholder |
| Drone flight time | ~0.4 s | §4 — drama dial, not fairness |
| Hearts | 3 | §7 |
| Drones | start N, +1 per M=3 correct | §7 |
| Wave size N | 12 | §7 — gives a 4-mistake error budget |
| Problems | add/sub within 20, carrying and borrowing allowed | §2 default preset |
| Distractors | well-separated, not near-misses | §9, for age 7 |

The critical threshold is **computed** from `t_answer` and traverse time, never typed in — §6 is
explicit that this is the one threshold that must be derived. Encode it as a function so changing
`t_answer` *or the traverse time* moves it automatically. This table previously read 0.75 against a
20 s traverse; the traverse moved and the threshold moved with it, which is exactly why increment 5
must not type the number in.

**Spawn interval 6 s and traverse 34 s, decided together — 4a applies them.** They are one decision
because they trade off against each other:

- **Winnability** needs `spawnInterval > t_answer + flight` (≈ 5.4 s). At the old 2.5 s a tank
  arrived every 2.5 s while the player cleared one every ~5.4 s, so 54% of tanks breached whatever
  the player did: with 4a's three hearts the run is lost around t = 44 s, every time, regardless of
  skill. That is a treadmill, not a difficulty curve.
- **Board crowding** is `laneTraverse / spawnInterval`, and it *is* the number of answers the child
  chooses between. Raising the interval alone drops the board to ~3 tanks, which guts §9's
  distractors — three choices is a coin flip, not arithmetic. So the traverse rises with it:
  34 / 6 ≈ 5.7 tanks on screen, against 8 at the old pair.
- **Run length** lands at 12 × 6 ≈ 72–80 s, inside §2's 60–90 s.

Both are still placeholders built on an *assumed* 5 s `t_answer`. The measurement that replaces
them comes from the session after increment 5, and increment 6 retires the fixed interval
altogether for §6's state-dependent governor.

**`allowCarry` ships `true`, reversing this table's original "no borrowing".** `4+3` and `8+7` are
both "under 20" and wildly different (§10), and the second is the one worth putting in front of a
7-year-old — increment 9 should tune against the problems she will actually see. It is a `Config`
knob, so `false` stays available as the easier preset for a younger player.

**`Config` does not hold this whole table yet, deliberately.** Each increment adds the fields it
uses, so an unused constant can never drift out of sync with the increment that defines its
meaning. As of increment 3 it holds `lanes`, `laneTraverseSeconds`, `spawnIntervalSeconds`,
`spawnCount`, `answerMin`, `answerMax`, `operandMin`, `operandMax`, `allowCarry` and
`droneTraverseSeconds`.

**`droneTraverseSeconds` is a speed, not a flight duration.** It is the time to cross the full
board width, wall to far edge, so a near tank dies sooner than a distant one. The table's
"~0.4 s flight time" is therefore the worst case, not every shot. This matters beyond feel: §6's
fairness argument is that the gap closes at `v_drone + v_tank`, which a fixed per-shot duration
does not express.

**`spawnCount` is `60` as of increment 3, not the `20` increment 1 shipped and not the wave size
N = 12 above.** It is a fixed pre-wave spawn list that claims no wave semantics — hence the name.
20 was long enough to watch tanks cross, but once tanks die as fast as they are tapped it empties
the board in under a minute, which is too short to judge anything. Increment 4b introduces the
real wave of N = 12 and retires it; increment 6's governor retires the fixed list itself.

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
