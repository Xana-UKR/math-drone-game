# Increment 6 — Fairness invariant and spawn governor

DESIGN §6's promise, made true of the code: **a player who answers every problem correctly within
`t_answer` never loses a tank.** Today it is false. In a headless simulation (session scratchpad, not
in the repo) of a player who answers correctly every 5 s, a tank is lost in 5.1% of runs at the
shipped config. At `t_answer` 7 s that becomes 35%, and at 9 s every run loses one.

## Decide first — where the fix goes (proposed: the picker, with the governor as a cap)

With one tank per lane (4c), the board never holds more than `lanes` tanks. At 4 lanes, a 34 s lane
and 5 s answers, a player can clear up to 6, so **no spawn ever needs holding back at the shipped
config.** The losses come from **order** instead. In seed 24, at 15.9 s the alert tier offered a
tank that had just entered, while #4 (12.2 s from the wall) and #2 (15.6 s) waited. At 21.2 s both
were critical and the pick took #2. #4 was offered with 1.8 s left and breached.

- **Rejected — fix it with spawns alone.** That needs every two tanks ≥ `t_answer + flight` (5.4 s)
  apart. It works, but a 3 s player then picks among 1.9 tanks on average and faces a single tank on
  48% of problems (today 3.5 tanks and 8%), and the opening must spread over half the lane.
- **Proposed — fix the order in §5's critical tier.** The governor only caps the board when
  `t_answer` outgrows the lanes. In simulation this loses no tank at 5, 7, 9 and 12 s, at 4 and
  6 lanes, and at a 20 s traverse. The shipped board does not change.

## The rule — one derivation, three uses

**Savable:** time left `(1 − x) × T` > `t_answer`. This is §6's own `d > v_tank × t_answer`.

**Place in line `k`:** 1 + the other tanks at least as close to the wall that will still be
answered. Those are the savable ones, plus the live target wherever it is. Answering most-urgent
first, the tank's turn comes at `k·t_answer + (k−1)·flight`, where flight is the worst case,
`droneTraverseSeconds`.

**Clearable:** the tank's time left exceeds that turn. For `k = 1`, clearable is the same as
savable.

## In scope

- **New `src/core/fairness.ts`**
  - `isSavable(tank, config)`.
  - `isClearable(tank, tanks, liveTargetId, config)`.
  - `unclearableEntries(state, sinceId, config)`: the tanks with `id ≥ sinceId` that are not
    clearable on `state`'s board. The live target is `state.problem`'s.
- **`src/core/targeting.ts`** — §5 acts on savable tanks only (the item carried from 5).
  - `criticalThreshold(config, place = 1)` = `1 − ((place+1)·t_answer + place·flight) / T`. Place 1 is
    increment 5's 0.694, unchanged.
  - `candidatePool`, critical tier: the savable tank in place `k` is critical at
    `x ≥ criticalThreshold(config, k)`. It must be offered now, or a tank ahead of it must. If any
    tank is critical, the pool is every savable tank from the front up to and including the first
    critical one.
  - `candidatePool`, otherwise: the alert and relaxed tiers work as today, applied to the savable
    tanks only.
  - **No savable tank at all** (late in a slowly played wave): the pool is the single tank with the
    most time left, the likeliest save. *DESIGN doesn't cover this case.*
- **`src/core/step.ts`**
  - **Governor**, replacing "refill the lanes emptied this step". Every step, each lane with no tank
    takes the next tank of the wave at `x = 0`, in ascending lane order. It does so only if the
    newcomer is clearable on the board it joins, or if the board is empty, so that a run can never
    stall. The first refusal ends entry for that step, and a lane held back retries every step. No
    rng is drawn.
  - **Opening**, built by the same rule. Positions are tried front-most first. Each one places its
    tank only if that tank is clearable among those already placed; the front one is always placed.
    A refused position's lane starts empty, and its number joins the head of the queue. The rng
    draws are unchanged.
  - At the shipped config all four opening tanks are placed. At `t_answer` 9 the rearmost position
    stays empty.
- **`src/app/main.ts`** — the §6 assertion, in dev builds only (`import.meta.env.DEV`).
  - It runs after `createGameState`, and after every `step` before `ensureProblem`.
  - It reports each `unclearableEntries` tank with one `console.error`. It is **not** fatal: the
    loop keeps running.
  - The frame comment that anticipates a thrown assertion is updated to match.
  - With the governor in place it can fire only for a tank the rules force in, which needs
    `t_answer` near the traverse time.
- **`src/core/types.ts`** — doc comments only: `tAnswerSeconds` now drives the governor, and
  `pending` and `openingStagger` describe governed entry. No new fields.
- **Tests:** new `test/core/fairness.test.ts`, which includes the guarantee itself. A scripted
  player answers correctly in exactly `t_answer` over many seeds, and loses no tank and never gets
  an unsavable target. This runs at the shipped config, at 7 s and 9 s, and at 6 lanes.

## Changes to existing tests — need your approval

1. **`targeting.test.ts`**, two tests. Both assert the behaviour this increment changes.
   - *"critical: offers only the tanks at or above the critical threshold"* → `[3]`, not `[3, 4]`.
     Its 0.9 tank has 3.4 s left, past the unsavable line.
   - *"critical wins when a huge t_answer…"* → `[3]`, not `[2, 3]`. Only the front critical tank is
     offered.
2. **`refill.test.ts`**, seven tests in *"step — lane refill"*. They build boards with empty lanes
   and numbers still queued, and those lanes now fill at once.
   - Each fixture gains a tank in every lane.
   - Three assertions look at the lane under test instead of the whole board.
   - Names and intent are unchanged.
3. **`step.test.ts`**: pin `tAnswerSeconds: 4`. At the inherited 5 s, its 20 s traverse can only
   open three tanks, which would break *"queues waveSize − lanes numbers…"*.
   - `hearts.test.ts` and `drone.test.ts` use the same traverse and now open with three tanks too.
     They still pass, so I'd leave them alone.

A prototype in the scratchpad passes all 244 tests with exactly these changes.

## Out of scope

- **A minimum gap between entries.** 4c's side-by-side refills are now fair, because the picker
  serves them in turn.
- **Asserting picks at runtime** — the tests prove them. **Counting no-savable picks** is 9's "no
  safe answer" metric; 9 can call `isSavable` itself.
- **Retuning anything.** `t_answer` stays 5 s (decided 2026-10-10), and so do `openingStagger`, the
  traverse, the tiers and the wave. Run length at a slow `t_answer` (≈118 s at 9 s, past §2's 60–90
  s) is 9's to tune.
- Render, which needs no change. Distractors (7), the outcome log (8) and the harness (9).

## Done when

- `npm run check` passes.
- Setting `tAnswerSeconds: 40` in `defaultConfig` makes the §6 assertion appear in the browser
  console at run start. Revert it afterwards.
- At the shipped config, in a real browser (not VS Code's preview), the board still opens with four
  tanks and refills at once. Only which tank carries the answer under pressure changes.

## At the record step

- **DESIGN §5:** the critical tier works per place in line; unsavable tanks are excluded; the
  fallback.
- **DESIGN §6:** the governor's form; the assertion; 4c's known gap is closed; and why one tank per
  lane already caps the board.
- **PLAN:** the status line and the placeholder table.
