# Journal

Findings that belong in no other document. Newest first.

**Not read by default.** A session reads `CLAUDE.md`, `PLAN.md`'s status line, and the current
increment's row. This file is opened when someone asks *why is it like this?* — keep it short so it
stays cheap to consult.

**What goes here:** play-session observations, measurements, things that surprised us, approaches
tried and abandoned (the diff shows what was kept, never what was rejected).

**What does not:** what was built (git history), what was intended (`specs/NN-name.md`), where we are
(`PLAN.md`). And anything that contradicts or completes `DESIGN.md` or `PLAN.md` is **edited into
that document** instead — the spec stays authoritative rather than accumulating a trail of
corrections.

---

## Increment 1 — tanks move (2026-09-15)

**The first failing test was the test's own bug, and the subagent was right to stop.** The suite's
`simulate` helper drove the loop off a float accumulator — `for (let elapsed = 0; elapsed < seconds;
elapsed += dt)`. `1/60` is not exactly representable, so 360 additions land on
`5.999999999999984`, the condition still holds, and a 361st step runs. The tank finished at
`361/1200` instead of `0.3` — off by exactly one step, ~1600× the tolerance, and it would have
failed against *any* correct implementation. Fixed by computing the step count
(`Math.round(seconds / dt)`) instead of accumulating. **The game loop was never affected**: it
subtracts a consumed step (`while (accumulator >= FIXED_DT)`) rather than comparing a running sum
against a target, so it cannot over-run. Worth keeping because the two patterns look identical at a
glance and only one of them is correct.

**"Most tanks spawn in lanes 1 and 2" was the constant seed, not a biased RNG.** Measured: over
200k draws interleaved exactly as `createGameState` consumes them, lanes come out
24.90/25.02/25.02/25.06%. The seed in `main.ts` is a literal, so every reload replays one lopsided
sample — for `20260915` that is `6 7 5 2`, with lane 4 absent until the 13th spawn (~30 s in). And
20 draws over 4 lanes *is* clumpy: across 100k seeds, a gap of 4–5 between busiest and quietest lane
is the most common outcome, and a perfect 5/5/5/5 happens 1.1% of the time. **Fair dice look rigged
at n = 20** — which is exactly why DESIGN.md §6 makes spawning state-dependent rather than random.

**A code-review finding can be right in principle and wrong in its example.** The review said the
id-uniqueness test only inspected live tanks and would miss `nextId = state.tanks.length + 1`. The
principle held; the example did not — injecting that regression, the *old* assertion caught it
(live ids came out `6,7,8,9,9,9,9`). The regression it genuinely missed is one that recycles ids
only after a tank dies (`id: nextId % 16`): old assertion green, strengthened one red. **Verify the
failure scenario, not just the reasoning** — otherwise you harden a test against a case it already
covered and never learn which case it doesn't.

**The increment-0 vitest flake recurred, twice.** Both times `npm run check` reported
"3 failed / no tests" on the first run immediately after another process wrote source files, and
passed on re-run; five consecutive runs afterwards were clean. Same signature as increment 0's
`node_modules/.vite` flake. It matters more now than it did then, because the pre-commit hook runs
`npm run check` — a red commit gate that is not your code. **Recovery is still: re-run, then delete
`node_modules/.vite` if it persists.**

**Deferred from review, on purpose.** Spawns released inside one `step` all start at exactly
`x = 0`, so two in the same lane within one `dt` would be perfectly superimposed forever. It is
unreachable today (`at = i * 2.5` never collides inside a 1/60 s step) and the fix — offsetting by
`(time - spawn.at) / laneTraverseSeconds`, which would also remove the up-to-one-frame release lag
— contradicts the approved test asserting a tank is released at `x = 0`. **Increment 6 owns it**,
since its governor is what makes arbitrary spawn times reachable.

---

## Increment 0 — scaffold (2026-09-06)

**The first guards were all fail-open, and `/code-review` found it.** Every layer built in this
increment was checked by running it, and six holes were real. Fixed in the follow-up commit, each
re-verified by breaking it:

| Hole | Was | Now |
|---|---|---|
| dynamic `import()` | `no-restricted-imports` inspects only static declarations, so `await import('../render/x')` walked past all three layers | `no-restricted-syntax` on `ImportExpression` (literal specifiers only — a computed one is still uncatchable) |
| inline `eslint-disable` | one comment defeated the `Math.random` ban, which has no typecheck layer behind it | `linterOptions.noInlineConfig` on the core block; the attempt now also warns that it had no effect |
| co-located tests | a `.test.ts` under `src/` was silently skipped — vitest exited 0 without naming it | `src/**/*.test.ts` added to `test.include`, so it runs and fails |
| warnings | `eslint .` exits 0 on warnings, so the gate ignored them | `--max-warnings 0` |
| globs | `**/*.ts` matches neither `.mts` nor `.tsx`, so those files got no rules at all | `**/*.{ts,tsx,mts,cts,js,mjs,cjs}` |
| the guard test | probed 2 of the 20 banned globals, so 18 could be deleted with the suite green | reads the banned list out of the *effective* config via `calculateConfigForFile` and probes every entry — adding a global now puts it under test automatically |

**The lesson is the one `WORKFLOW.md` predicted**, and it is worth more than the fixes: every one of
these was a guard that passed its own happy path. Writing the rule proves nothing. The only thing
that proved anything was deliberately breaking each one — and four of the six survived a scaffold
built specifically to be careful about exactly this.

**Still open, deliberately.** The pre-commit hook runs `npm run check` over the **working tree, not
the index**, so `git add -p` plus an unstaged fix can land a red commit green; the `git stash
--keep-index` wrapper that would fix it can lose work when the check fails, which is worse. And
`npm run check` never runs `vite build`, so a broken `index.html` or an unresolvable asset import
passes the gate — `npm run dev` is still an author-side check, not a mechanical one.

**`npm run check` can fail with a message that names no cause.** During review it died four times in
a row with `TypeError: Cannot read properties of undefined (reading 'config')` and "(0 test)",
including on a file whose entire body was `expect(1 + 1).toBe(2)`. It self-healed once
`node_modules/.vite` regenerated and never reproduced. **Recovery: delete `node_modules/.vite`.**

**Two Windows-specific things bit during the scaffold.** `tsc` refuses a project with no input
files, which is the only reason `src/core/placeholder.ts` exists; and Git for Windows would check
the shell hook out as CRLF and break it, which is why `.gitattributes` pins LF.

**Versions are all at a current major** — ESLint 10, TypeScript 6, Vite 8, Vitest 5. Most examples
online target the previous majors, so suspect version skew before suspecting the code.

---

## Increment 2 — problem generation

**A tank outlives its own traverse time by one frame, and that decides the no-duplicates window.**
`createGameState` excludes the numbers of the spawns that can still be on screen, sized from
`laneTraverseSeconds / spawnIntervalSeconds`. The obvious formula, `ceil(ratio) - 1`, is wrong: a
tank is released without moving on its release frame, so it holds the board for `traverse + dt`.
On the 20 s / 2.5 s default that means **9 tanks share the board for one frame, not 8**. The
formula that works at every ratio is the plain `ceil(ratio)` — exact where the ratio sits at or
just below an integer (the cases where the extra frame decides it) and one spare exclusion
elsewhere. An epsilon-nudged `ceil(ratio + 1e-9) - 1` was tried first and looks right, because it
fixes the exactly-integer case that the default config happens to be; it still breaks at ratios a
hair *below* an integer, e.g. traverse 19.999999 with interval 2.5. Core cannot compute the frame
itself — it never sees `dt`. The regression test tables eight ratios for this reason; one ratio
cannot catch it, and increment 9 is going to retune `laneTraverseSeconds`.

**Banning a clock in core means banning the `Date` binding, not `Date.now`.** `no-restricted-properties`
on `{ object: 'Date', property: 'now' }` plus a `NewExpression` selector catches two of six forms.
`Date()` called plainly, `const D = Date; new D()`, and a bare `Date` reference all walk past both.
One `no-restricted-globals` entry for `Date` catches all of those — and `globalThis` needs the same
treatment, since `globalThis.Date` (and `globalThis.document`) is a member access that no
banned-name list or syntax selector sees. The narrower rules were kept for their specific messages.

**A test with a `continue` in it may be asserting nothing.** The first version of "never changes a
live problem" skipped frames where `targetId` differed — which is precisely the re-target it was
meant to catch, so it passed against an `ensureProblem` that re-picked a target every single
frame. The condition has to be "the old target is still on the board", not "the id still matches".
Same shape of mistake in a uniqueness test bounded at `> 5` distinct numbers when the exclusion
window alone forces 9. Both were found by `/code-review`, not by the suite.

**Tests that seed two rng streams do not exercise the wiring that ships.** `main.ts` threads one
stream from `createGameState` into `ensureProblem`; a test calling `createRng(seed)` twice is
equally deterministic and passes either way. `play()` now takes a seed and builds the state itself,
so it mirrors production — this matters at increment 4a, which re-seeds on restart.

---

## Increment 3 — tap to shoot (2026-10-03)

**A scripted test player that answers too fast tests nothing.** The first version of
`playWithTaps` answered every 0.5 s. At a 2.5 s spawn interval that clears each tank ~25 steps
after it spawns, so the board never holds a second tank — every wrong-tap checkpoint found only the
target, tapped nothing, and `misses` came out 0 while `hits` came out 24, exactly the number of
spawns. Three invariant tests sitting under it had been passing against a one-tank board. The
cadence is now PLAN's placeholder `t_answer` of 5 s, which crowds the board to 5-8 tanks and
breaches the oldest. Guard added: a test asserting the board exceeds 3 tanks during the run, because
the vacuousness was invisible without one.

**Comparing two moving positions needs both read at the same instant.** The impact test first
compared the drone's post-move `x` against the tank's pre-move `x`. That is a half-step mismatch,
and it holds only while the drone is faster than the tank: measured, interception starts failing at
`droneTraverseSeconds > laneTraverseSeconds` (one step from the wall at 20.5 s, four steps at
100 s). DESIGN.md §6 claims interception "for any drone speed whatsoever" and increment 9 sweeps
that value as a pure drama dial, so the mismatch would have surfaced as a fairness bug in a
simulation, not as a visible one here. Comparing both at the end of the step makes it
unconditional — verified from 0.4 s to 500 s per board.

**An "unreachable" branch is a claim, and the claim can be wrong.** The orphaned-hit-drone branch
was commented as unreachable under §6. It was — but only at the shipped config, for the reason
above. Writing "unreachable" costs nothing; writing *why*, in terms a future reader can re-derive,
is what makes it checkable.

**Floating-point arrival checks need a tolerance, and need it consistently.** Subtracting
`(1/60)/0.4` from 1.0 twenty-four times lands at 3.7e-16, not 0, so a bare `x <= 0` costs a
spurious step; the elapsed-time reformulation lands at 1.1e-16, so it is not an accumulation
artifact that reordering fixes. The tank's `x < 1` breach check has the same drift and is still
unguarded — `laneTraverseSeconds: 20` is one of only four plausible values out of 22 that lands
*above* 1, which is the only reason the drone needed an epsilon and the tank appeared not to.
Carried to 4a in PLAN.md, where a breach starts costing a heart.

**An input queue that defers taps answers problems the player never saw.** Taps were buffered and
drained one per fixed step. A double-tap — the ordinary behaviour of a 7-year-old — queued the
second tap, which then landed on the problem the first one had just caused to re-roll: a guaranteed
wrong answer, and from 4b a drone spent on it. Taps are now dropped while a drone is in flight, and
the queue is cleared when a tap launches one. The lesson generalises: input buffered across a state
change has to be revalidated against the new state or discarded, never replayed.

**`touch-action: manipulation` is load-bearing for a tap-only game.** DESIGN.md §17 claims a
`click` listener is "correct on touch and mouse with no hit-testing code". On a touch screen that
is not true without it: a quick second tap is read as double-tap-to-zoom and moves the board
instead of firing.

**Adding a required field to `GameState` edits the previous increment's test fixtures.** Five
literals in `step.test.ts` gained `drone: null`; increment 2 did the same when it added `problem`.
This is mechanical and semantically empty, but it is a file the spec did not name, so it belongs in
the spec's file list rather than passing unremarked. The alternative — making the field optional —
would be worse, since every consumer would then handle `undefined`.

**Deferred, with reasons, so they are not rediscovered:** the unused `label` element in
`scene.ts`'s `tankNodes` map and the duplicated centred-rect boilerplate between `createTankNode`
and `createDroneNode` both wait for increment 4a's hearts, which add the third rect that makes a
shared helper worth extracting. `problem.test.ts`'s "Every field is pinned" comment pins only the
five fields the generator reads — true in effect, wrong as written, and in a file this increment
had no reason to touch.

---

## Increment 4a — hearts and losing

**A run that can end changes what old long-run tests measure.** The first recommendation was to pin
`hearts: 3` in the pre-hearts test files and accept a shorter live window, on the claim that every
assertion would still pass. Reading them showed it would not: "gives every tank a distinct id"
needs every spawn released, and "shows a problem for most of the run" loses its problem at the
losing breach (the placeholder targets the front tank, which is the one that breaches). Check
claims about existing tests against their bodies before making them, not after approval.

**The project has no formatter.** `npx prettier` downloaded one and reformatted two test files
wholesale (double quotes, 80 columns); reverted. Format by hand to the existing style.

**Still deferred:** the shared centred-rect helper (increment 3's note) — 4a's hearts are `<text>`
glyphs and its overlay is one full-screen rect, so the third centred rect did not arrive.

---

## Increment 4b — drones, wave and winning

**DESIGN §7's error budget was off by one, caught while writing the spec, not in play.** Working
the pool through by hand — 12 drones, +1 per 3 hits — showed the resupply from the last hit always
arrives after the last tank, so the budget is `floor((N−1)/M)`. Then the test-writing pass caught a
second slip in my own claim: one mistake *over* the budget is not always one tank short — at
13 / 4 it is two, because the unaffordable shot also forfeits its resupply. Both were found by
doing the arithmetic, not by trusting the prose. Worth doing for every economy claim.

**Win and floor are both edge-triggered** ("the board *becomes* empty"), not level-triggered. That
is how §6 and §7 word them, and it is also what kept the 4a-era tests valid: a board that *starts*
empty (spawn tests, `boardOf([])`) neither wins nor pulls the schedule forward.

**Floor implementation note (implementer):** the due set is picked by equality with
`pending[0].at` *before* shifting, not by re-comparing shifted times against the clock —
`a − (a − t)` is not always bit-exact `t`, so a re-comparison could miss the release by 1e-15.

**Headless probe beats arguing about what the player saw.** The author reported long empty
stretches; a 30-line throwaway vitest file (deleted, never committed) measured the longest
no-visible-number gap at 1.13 s across seeds and answer speeds, and pinned the cause to tanks
releasing fully off-screen. Vitest only shows `console.log` from such a probe with
`--reporter=verbose`.

**Post-commit: the "empty field" report was VS Code's Simple Browser.** The author's first play of
4b was in VS Code's built-in preview, which left a lone moving tank unpainted until another node
was inserted — so each first tank "appeared late, already shifted right". Vivaldi and headless Edge
(driven over CDP with Node's built-in WebSocket, no new dependency) both drew it correctly. Lesson:
when play contradicts a headless probe, check the browser before the code.

---

## Increment 4c — one tank per lane, lane refill

**"Every number in the wave is distinct" caps the wave at the answer range.** 13 of 21 fits, but
`drone.test.ts` ran a 60-tank wave to stress the board; it dropped to 21 (hearts with it). If a
later preset wants a wave longer than its answer range, distinctness has to go back to "distinct
among tanks on screen" — with one tank per lane that window is just the lane count.

**The stagger was tuned by arithmetic, not play:** at 0.1 the four opening tanks must be cleared
in ~22 s (≈5.5 s each, right at the assumed `t_answer`); 0.05 gives ~28 s. Revisit with the
measured `t_answer` after increment 5.

---

## Increment 4d — end-of-run summary

**Wrong answers are recorded at the tap, not the impact** — DESIGN §16 already says a wrong answer
is committed when chosen, and the miss drone destroys nothing, so impact adds no information.
Recording in `selectTank` also keeps `step` free of the log.

**One entry per wrong tap, not per problem.** The problem stays live after a miss, so the list can
show the same problem twice with different choices; that keeps "Wrong answers: N" equal to the
line count, which a child can check by counting.

---

## Increment 5 — urgency targeting

**Why `2·t_answer + flight`, not `t_answer`:** the critical tier is the last problem a tank can be
offered on and still be savable. Skipped now, its next chance is after this answer and the drone's
flight, and then it needs one more `t_answer`. Wrong taps stretch that window further, and the
formula doesn't cover them — that is the player's time to spend, not the game's to guarantee.

**One `rng.next()` per pick, always** — even from a pool of one — so a seeded replay doesn't
change stream position depending on how crowded the board was. Exact draws are pinned by
`targeting.test.ts`.

**Weight `1 + u` is deliberately mild** (2 : 1 at most): the relaxed tier exists for variety, and
a steeper curve would rebuild the front-tank habit 5 was meant to break.
