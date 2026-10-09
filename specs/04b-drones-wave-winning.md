# Increment 4b — Drones, wave and winning

The end of Milestone 1: a complete, ugly, winnable game. DESIGN.md §4, §6 (the empty-board floor)
and §7: a finite wave of N tanks, a drone pool that every answer spends, resupply on correct
answers, and a win once the wave is exhausted with hearts left.

## In scope

- **`src/core/types.ts`**
  - `Config.spawnCount` → **`Config.waveSize`** (N). PLAN retires `spawnCount` here; the field is
    now the wave. Default **13** (decided below).
  - `Config.resupplyEvery: 4` (M).
  - `GameState.drones: number` (the pool), `GameState.correct: number` (correct answers landed,
    i.e. tanks destroyed by a drone — drives resupply, and is the score), `outcome` gains `'won'`.
- **`src/core/step.ts`**
  - `createGameState`: `drones: config.waveSize` (§7: "the pool starts at N" — derived, not its
    own field, so the two cannot drift), `correct: 0`.
  - `selectTank`: refuses (returns `state`, draws nothing) when `drones === 0`; otherwise every
    launch, hit or miss, costs one drone.
  - `step`, on a **hit's impact**: `correct + 1`, and `+1` drone whenever `correct` reaches a
    multiple of M. Counted on impact, not at the tap — §4.4 orders "destroys the tank, score
    increases" after the hit. An orphaned hit (target already gone) earns nothing.
  - **Empty-board floor (§6).** In the step where the board *goes* empty — tanks before, none
    after, nothing due — the next pending spawn is released at once and every later spawn moves
    forward by the same amount. Triggered by the board *becoming* empty, as §6 words it, not by
    *being* empty — so the run's start and spawn tests on empty boards are untouched. A uniform
    shift with nothing on the board preserves every on-screen overlap, so tank numbers stay
    distinct without touching `createGameState`'s exclusion. Draws no rng.
  - **Winning.** `outcome: 'won'` in the step the last tank of the wave is resolved (board goes
    empty with nothing pending), by drone or by breach. **Loss checked first:** hearts at 0 is
    `'lost'` even if that same step emptied the wave. A won run is frozen exactly like a lost one
    — `step`, `selectTank`, `ensureProblem` already return `state` for any non-`'playing'` outcome.
- **`src/render/scene.ts`** — two counters on the console as `<text>`: **drones left**
  ("Drones 9") and **tanks destroyed** ("Destroyed 4", from `correct` — drone kills only, not
  breaches); the drone count greys at 0, so a refused tap reads as "I'm out". The overlay shows
  for `'won'` too, with "You won! Tap to play again"; same 0.75 s debounce.
- **Tests:** new `test/core/wave.test.ts`. Fixture-only changes elsewhere (see below).

## Fixture changes to existing tests — need your approval

1. **Mechanical, all three files:** `spawnCount` → `waveSize` in pinned configs; `drones`,
   `correct` in `GameState` literals; `resupplyEvery` pinned. Test name
   `'queues exactly spawnCount spawns up front'` → `'... waveSize ...'`.
   Pools need no extra pin: each file's pool starts at its own wave size (20 / 60), and
   `drone.test.ts`'s 120 s script spends ~24 answers at most.
2. **One real one — `hearts.test.ts` "stays playing while one heart remains".** Its board is one
   tank, nothing pending; that tank breaching with a heart left *is* a won wave under §7, so the
   assertion `outcome === 'playing'` becomes wrong. Fix: add a second tank far from the wall to the
   fixture, so the wave isn't over. Intent of the test unchanged. *(Approved.)*

## Decided — DESIGN §7's error budget was off by one

§7 said a run tolerates `floor(N/M)` wrong answers. It tolerates **`floor((N−1)/M)`**: the
resupply drone earned by the *last* correct answer arrives after the last tank is gone, so it can
never be spent. Order of mistakes doesn't matter — the binding moment is always the last shot.
**Decided with the author: N = 13, M = 4** → budget `floor(12/4)` = **3 mistakes**; run ≈ 78 s,
inside §2's 60–90 s. Step 5 corrects the formula in DESIGN §7 and the PLAN ladder row and config
table.

## Out of scope

- Drone-pool and score animations, a "dry" warning effect, win fanfare, sound (10+).
- A wave progress indicator ("tanks left in the wave") — not asked for.
- §5 urgency targeting (5); §6 state-dependent governor — only its floor lands here (6).
- The near-wall "no drone drawn" tap and the wall bang on breach (10).
- `main.ts` — no change expected: the restart callback already accepts any non-`'playing'`
  outcome, and a refused tap at 0 drones is dropped by `selectTank`.

## Done when

`npm run check` passes; `wave.test.ts` proves the budget (exactly `floor((N−1)/M)` mistakes still
destroys every tank; one more leaves the last tank unanswerable). In `npm run dev` you play a run
to **"You won!"**, watch the drone count fall per tap and rise every third hit, see the next tank
arrive the moment you clear the board, and run the pool dry to see taps refused.
