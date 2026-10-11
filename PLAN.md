# Build Plan

**Status: increment 6 complete. Next: increment 7 — distractor strategies.** *(The target player's
first unassisted session can run any time; it is where `t_answer` gets measured.)*

- **6 landed (specs/06-fairness-governor.md):** DESIGN §6's guarantee now holds in the code — a
  player answering correctly in exactly `t_answer` never loses a tank (tested over 100 seeds at
  5 s, 7 s, 9 s and 6 lanes; before, 5.1% of runs lost one at 5 s and 35% at 7 s). **The fix was in
  the picker, not the spawns** — decided with the author after simulation: one tank per lane already
  caps the board, so the losses came from §5 offering a newcomer while two older tanks drifted in
  together. New `src/core/fairness.ts` (`isSavable`, `isClearable`, `liveTarget`,
  `unclearableEntries`); §5's critical tier is now per place in line (`criticalThreshold(config,
  place)`), unsavable tanks are never offered, and with none savable the tank with the most time
  left is. The governor gates every entry, including the opening board; it is inert at the shipped
  config and caps the board at 3 tanks for a 9 s player. Dev builds log a §6 assertion per
  unclearable entry (`tAnswerSeconds: 40` fires it). No `Config` or `GameState` fields added.
  **Carried to 9:** run length grows at slow `t_answer` (≈118 s at 9 s, past §2's 60–90 s); the
  clearability check assumes a full 0.4 s flight per answer, so at 8 s the opening holds 3 tanks
  where 4 would have survived in play; the governor still counts the live target during the drone's
  flight (deliberate, ≤ 0.4 s late per refill). **Carried to 9:** count "no savable tank" picks with
  `isSavable` for the harness's "no safe answer" metric. **Note for the session:** a perfectly
  steady player slower than `t_answer` does worse under deadline order (steady 7 s vs the 5 s model:
  47% of runs won, was 60%); realistic noisy players do not (22% vs 19%) — measuring `t_answer` is
  the cure.

- **5b landed (specs/05b-round-duration.md):** the end overlay shows `Time: N seconds` under
  "Wrong answers" — render only, from `state.time` (game time: frozen at the run's end, background
  tab time excluded by the frame cap). Average answer time was proposed and **dropped by the
  author**; per-problem timing stays in increment 8.
- **`t_answer` stays at 5 s for increment 6 — decided by the author 2026-10-10.** `tAnswerSeconds`
  is unchanged; increment 9 still replaces it with a measured value.

- **5 landed (specs/05-urgency-targeting.md):** `src/core/targeting.ts` — `criticalThreshold`,
  `candidatePool`, `pickTarget`; `ensureProblem` uses them. **The critical threshold was
  re-derived with the author:** "must be offered now", `1 − (2·t_answer + drone flight) / T` ≈
  0.694, not §6.1's unsavable line (≈ 0.853), which would have made the critical pool hold only
  lost tanks. DESIGN §5 and §6.1 now say this. `Config` gains `tAnswerSeconds` (5),
  `alertThreshold` (0.5), `alertPoolSize` (3); the pick is weighted `1 + u`, one `rng.next()` per
  pick. Opening tank ids no longer run front-most first — nothing reads their order now.
  **Carried to 6:** the critical pool can still hold a tank past the unsavable line (≈ 0.853), and
  `1 + u` slightly favours it — excluding it is §6's job. **The session is now unblocked:** the
  answer is no longer always the front tank. Its measured `t_answer` moves `u_crit` automatically.


- **4d landed (specs/04d-end-of-run-summary.md):** `GameState.wrongAnswers` records each wrong
  tap at the `miss` launch (plain problem + chosen number), one entry per tap, so a problem
  missed twice appears twice. The end overlay shows "You won!" / "Out of hearts", tanks
  destroyed, wrong answers and the list. **Carried to 8:** `wrongAnswers` is the first slice of
  the outcome log — extend it, don't build a parallel one. **Carried to 9:** the overlay fits at
  most 7 rows per column; the list's ceiling is `waveSize + floor(correct/M) − correct` ≤
  `waveSize`, so a preset with `waveSize > 14` can push the list into the footer. Cap or
  paginate the list if 9 raises N. Saving missed facts across games still needs §15 storage and
  a DESIGN decision.

- **4c landed (specs/04c-lane-refill.md):** one tank per lane, refilled in the same lane on a kill
  or a breach; the fixed spawn schedule, `spawnIntervalSeconds` and 4b's floor are gone, and
  DESIGN §6 now describes lane refill. **`openingStagger` ships at 0.05**, revised from the
  spec's 0.1 after review, with the author: 0.1 put the first breach at ~22 s (~5.5 s per answer
  from the start, at the edge of the assumed `t_answer`); 0.05 gives ~28 s and keeps ~1.7 s
  between arrivals; 0.01 was rejected (~0.3 s apart is §6's "all critical at once"). **Carried to
  increment 9:** nothing guards `openingStagger` — `(lanes − 0.5) × openingStagger ≥ 1` would
  open a tank at or past the wall, costing a heart before the first tap. Add a throw naming the
  dial when 9 starts sweeping it. **Carried to 6:** two lanes emptied in one step refill side by
  side and reach the wall together.

Decided by the author in 4b's play session (2026-10-09) — the 4d item below has now landed:

- **4d — end-of-run summary.** The win/lose screen shows tanks destroyed, **wrong answers** (the
  author's meaning of "missed"), and the list of wrongly answered problems (e.g. "8 + 7 = 15 —
  you chose 14"), kept in memory only. Core records each wrong answer — a first slice of
  increment 8's outcome log. Saving them and bringing those facts back next game is later: it
  needs §15 storage and a DESIGN decision on how missed facts return.
- **Play-session finding — resolved: the "empty field for ~6 s, then two tanks" was VS Code's
  built-in browser, not the game.** It did not repaint a lone moving tank until a new node was
  added; the same build plays correctly in Vivaldi and in headless Edge (DOM sampled every second,
  screenshots at three window sizes). **Play-test in a real browser, never VS Code's preview.**
  Separately and real: a tank released fully off-screen, so its number needed ~1.1 s to appear —
  **fixed in 4c** in render only: core `x = 0` now puts the tank's tail on the left edge.
- **Carried from 4a, still open:** the near-wall tap that shows no drone, and the bang at the wall
  on a breach — both increment 10. `Drone.lane` is redundant, kept on purpose (delete it if
  increment 6 or 9 ever has to keep it consistent with the tank).

Still carried, from earlier increments:

- **Resolved by 5 — the session can run now.** *(Original note:)* Hold the target player's first session until increment 5 is in — but do not reorder the ladder.
  5 follows 4c and 4d directly, so this only moves the session, not the work. With increment
  2's placeholder targeting the answer is always on the tank nearest the wall (every tank moves at
  one speed and the placeholder picks the oldest), which is learnable: tap the front tank, skip the
  arithmetic. A `t_answer` measured from a session played that way is measured from a child not
  doing the math, and increment 9 tunes everything against that number. **What 5 does not fix:** on
  a crowded board §5 picks its pool from `u_max`, so the critical tier fires and hands you the same
  front tank the placeholder does. Excluding tanks that are already unsavable is §6's job, in
  increment 6. 5 buys variety early in a wave, when the relaxed tier lets any tank be the answer —
  which is the variation this game wants, and reason enough to keep 5 where it is rather than
  hurrying it forward.
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
| **4b** | **Drones, wave and winning.** Pool starts at N; every answer costs one; +1 per M correct; wave of N; win = wave exhausted with hearts remaining; **loss checked first** on simultaneous impact | vertical | You complete a run to a **win**; a test proves the `floor((N−1)/M)` error budget |
| **4c** | **One tank per lane, lane refill.** Start with a staggered tank in every lane; a tank leaving the board (kill or breach) is replaced in its lane at once until the wave runs out; "Tanks left" counter | vertical | The board always holds one tank per lane until the wave's tail; you never face a lone obvious answer mid-wave |
| **4d** | **End-of-run summary.** Win/lose screen: tanks destroyed, wrong answers, and the list of wrongly answered problems (in memory) | vertical | After a run you can read back every problem you got wrong |
| | *— end of Milestone 1: a complete, ugly, winnable game —* | | |
| **5** | **Urgency targeting.** §5 tiers and weighted pick; critical threshold **derived** as `1 − (2·t_answer + flight) / traverse_time` ("must be offered now"), never a typed-in feel number | core | A test per tier; the answer never changes mid-problem |
| **5b** | **Round duration.** End overlay shows `Time: N seconds` (game time), under "Wrong answers" — added at the author's request | vertical | The time on the end screen matches a phone stopwatch, win or lose |
| **6** | **Fairness invariant + spawn governor.** §6 assertion in dev builds; state-dependent spawning replaces 4c's lane refill | core | Setting `t_answer` absurdly high makes the assertion fire |
| **7** | **Distractor strategies.** Adjacent times-table fact, off-by-one/carry, operand confusion, digit reversal — named, per-tier | core | A test per strategy; age-7 tier yields well-separated distractors |
| **8** | **Outcome logging.** Per problem: the problem, chosen answer, which distractor, elapsed time | core | A run dumps records; nothing consumes them yet |
| **9** | **Simulation harness.** Headless; player modelled as `(t_answer, accuracy)`; 1000 runs per preset; report run length, win rate, breach rate, "no safe answer available" count. **Then tune.** | core | Win rates per preset; DESIGN.md §17a.1 and §17a.2 closed |
| **10+** | Practice mode → real assets (§13 manifest, named SVG groups, sprite sheets, dev asset page) → presets UI → audio (Howler) → recall mode → profiles/stats → PWA + offline | mixed | per DESIGN.md §18 priority |

**Effort:** leave at the Claude Code default (`xhigh`) throughout, except increments **6** and **9** —
set `max` when opening those sessions. Set it at session start, never mid-session (`WORKFLOW.md`).

Increments 1, 3 and 4a–4d are **vertical** slices (core + render). 2 and 5–9 are pure core, added
underneath a game that already runs — so nothing is ever un-playable, and the "all the logic first"
trap is avoided.

## Placeholder config for Milestone 1

A `Config` object in `core/types.ts`, not scattered constants. Increment 9 replaces these with
measured values.

| Setting | Value | Source |
|---|---|---|
| Lanes | 4 | §3 (3–6; responsive later) |
| Lane traverse time | 34 s | slow tier per §12 — **was 20 s; see the note below** |
| ~~Spawn interval~~ | ~~6 s~~ | **retired in 4c** — lane refill feeds the board; see the note below |
| Opening stagger | 0.05 | 4c — opening tanks at 0.025 / 0.075 / 0.125 / 0.175 of the lane |
| `t_answer` assumption | 5 s | §17a.1 placeholder — to be measured, not trusted (`tAnswerSeconds`) |
| **Critical urgency threshold** | **~0.69 / 0.54 / 0.38** | *derived* per place in line `k`: `1 − ((k+1)·t_answer + k·flight) / traverse`; place 1 = 1 − 10.4/34 (§5, increments 5–6). §6.1's unsavable line `1 − t_answer / traverse` ≈ 0.85 is a different number |
| Alert threshold | 0.5 | §5 placeholder; alert pool = the 3 most urgent (`alertPoolSize`) |
| Drone flight time | ~0.4 s | §4 — drama dial, not fairness |
| Hearts | 3 | §7 |
| Drones | start N, +1 per M=4 correct | §7 — **M = 4 decided 2026-10-09** |
| Wave size N | 13 | §7 — `floor((N−1)/M)` = a 3-mistake error budget; ~65 s at a 5 s answer (4c) |
| Problems | add/sub within 20, carrying and borrowing allowed | §2 default preset |
| Distractors | well-separated, not near-misses | §9, for age 7 |

The critical threshold is **computed** from `t_answer` and traverse time, never typed in — §6 is
explicit that this is the one threshold that must be derived. Encode it as a function so changing
`t_answer` *or the traverse time* moves it automatically. This table previously read 0.75 against a
20 s traverse; the traverse moved and the threshold moved with it, which is exactly why increment 5
must not type the number in.

**Spawn interval 6 s and traverse 34 s, decided together — applied in 4a.** They are one decision
because they trade off against each other:

- **Winnability** needs `spawnInterval > t_answer + flight` (≈ 5.4 s). At the old 2.5 s a tank
  arrived every 2.5 s while the player cleared one every ~5.4 s, so 54% of tanks breached whatever
  the player did: with 4a's three hearts the run is lost around t = 44 s, every time, regardless of
  skill. That is a treadmill, not a difficulty curve.
- **Board crowding** is `laneTraverse / spawnInterval`, and it *is* the number of answers the child
  chooses between. Raising the interval alone drops the board to ~3 tanks, which guts §9's
  distractors — three choices is a coin flip, not arithmetic. So the traverse rises with it:
  34 / 6 ≈ 5.7 tanks on screen, against 8 at the old pair.
- **Run length** lands at 13 × 6 ≈ 78 s, inside §2's 60–90 s.

Both are still placeholders built on an *assumed* 5 s `t_answer`. The measurement that replaces
them comes from the session after increment 5.

**Increment 4c retired the spawn interval** (earlier than the increment-6 retirement this note
originally planned). With one tank per lane, refilled on every kill or breach, board crowding is
simply the lane count (4), and run length is set by the player's own pace — 13 answers at ~5 s
≈ 65 s, still inside §2's 60–90 s. The winnability argument above becomes a per-lane one: a
refill enters at `x = 0` and has the full 34 s traverse, far above `t_answer + flight`. The 34 s
traverse stays. Increment 6's governor now replaces lane refill, not a fixed interval.

**`allowCarry` ships `true`, reversing this table's original "no borrowing".** `4+3` and `8+7` are
both "under 20" and wildly different (§10), and the second is the one worth putting in front of a
7-year-old — increment 9 should tune against the problems she will actually see. It is a `Config`
knob, so `false` stays available as the easier preset for a younger player.

**`Config` does not hold this whole table yet, deliberately.** Each increment adds the fields it
uses, so an unused constant can never drift out of sync with the increment that defines its
meaning. As of increment 5 it holds `lanes`, `laneTraverseSeconds`, `openingStagger`,
`waveSize`, `answerMin`, `answerMax`, `operandMin`, `operandMax`, `allowCarry`,
`droneTraverseSeconds`, `hearts`, `resupplyEvery`, `tAnswerSeconds`, `alertThreshold` and
`alertPoolSize`.

**`droneTraverseSeconds` is a speed, not a flight duration.** It is the time to cross the full
board width, wall to far edge, so a near tank dies sooner than a distant one. The table's
"~0.4 s flight time" is therefore the worst case, not every shot. This matters beyond feel: §6's
fairness argument is that the gap closes at `v_drone + v_tank`, which a fixed per-shot duration
does not express.

**`spawnCount` became `waveSize` in increment 4b** — the fixed 60-tank list is now the real wave
of N = 13, and the drone pool starts at it.

## Two disciplines

1. **Don't make it pretty before increment 9.** Real art before the simulation has tuned `t_answer`
   means re-tuning against assets that are expensive to change. Rectangles are a feature until then.
2. **Increment 1 already draws the number as `<text>` inside the tank group.** §13 calls the tank
   text safe zone the most fragile part of the asset contract — prove it on day two, not at
   increment 10.

## Where the target player enters

**Now — 5 has landed.** That first unassisted session is the only real source for `t_answer`, and
increment 9 is worthless without it. The answer is no longer always on the front tank, so the
child has to do the arithmetic. Watch, don't help, and note how long she stares before tapping.
Setting `tAnswerSeconds` to the measured value moves the critical threshold with it.
