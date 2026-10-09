# Increment 5 — Urgency targeting

Replaces increment 2's placeholder target pick (lowest id = front tank, learnable without doing
the arithmetic) with DESIGN §5's tiers and weighted pick. Pure core; nothing on screen changes
except *which* tank carries the answer.

## Decided — where the critical threshold sits (option B, with the author)

DESIGN §6.1 puts it "exactly at `v_tank × t_answer`" (`1 − t_answer / T` = 0.853), but that is
the **unsavable** line: §5's critical pool would then hold only unsavable tanks, and be empty
once increment 6 excludes them. Instead, critical means **"must be offered now"**: a tank not
chosen for this problem next gets a chance after this answer plus the drone's flight, and then
needs another `t_answer`. So `u_crit = 1 − (2·t_answer + droneTraverseSeconds) / T`
= 1 − 10.4/34 ≈ **0.694**. Derived, never typed in. DESIGN §5/§6.1 and PLAN's two wordings get
this at the record step.

## In scope

- **`src/core/types.ts`** — `Config` gains `tAnswerSeconds: 5` (§17a.1 placeholder),
  `alertThreshold: 0.5`, `alertPoolSize: 3` (§5's "2–3 most urgent"; 3 at 4 lanes still drops
  the furthest-back tank).
- **New `src/core/targeting.ts`** — urgency is the tank's `x` (already 0 at spawn, 1 at the wall).
  - `criticalThreshold(config)`: the formula above.
  - `candidatePool(tanks, config)`: `u_max ≥ critical` → every tank at/above it; else
    `u_max ≥ alertThreshold` → the `alertPoolSize` highest-`x` tanks; else all tanks. Critical is
    checked first, so a threshold derived below 0.5 (huge `t_answer`) just makes critical win.
  - `pickTarget(pool, rng)`: weighted pick, weight `1 + u` — a tank at the wall is twice as
    likely as one just spawned, so the relaxed tier keeps real variety. **Exactly one
    `rng.next()` per pick**, even for a pool of one, so seeded replays don't depend on pool size.
- **`src/core/step.ts`** — `ensureProblem` uses `pickTarget(candidatePool(...))` instead of the
  lowest id; every guard (live problem, empty board, run over → no rng drawn) unchanged.
- **Tests:** new `test/core/targeting.test.ts`.

## Change to an existing test (approved)

`step.test.ts` › *"targets the earliest-spawned tank … (placeholder for §5)"* asserts exactly the
behaviour this increment removes. I'd delete it; the tier tests replace it. No other existing
assertion should change — if a seeded-run test breaks, I stop and report rather than edit it.

## Out of scope

- Excluding already-unsavable tanks from the pool, the dev-build §6 assertion, the spawn
  governor — increment 6. (Under (B) the critical pool can still contain a tank past 0.853, and
  the weighting slightly favours it.)
- Distractors (7), logging which tier fired (8), tuning any of these numbers (9).
- `render/`, `app/` — no change expected.

## Done when

`npm run check` passes; a test per tier; a played run shows the `targetId` never changes while its
problem is live. In the browser, early in a wave the answer is visibly *not* always the front tank.
