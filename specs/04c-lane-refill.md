# Increment 4c — One tank per lane, lane refill

Decided by the author after 4b's play session (PLAN.md): with 4b's empty-board floor a fast player
often faces a single tank, and one tank is an obvious answer. The fixed spawn schedule, the floor
and `spawnIntervalSeconds` retire; every lane holds one tank until the wave runs out.

## In scope

- **`src/core/types.ts`**
  - `PendingSpawn` is deleted. `GameState.pending` becomes **`number[]`** — the wave's
    not-yet-released tank numbers, in release order. Lanes are no longer drawn up front: a refill
    takes the lane that just emptied.
  - `Config.spawnIntervalSeconds` is deleted. **`Config.openingStagger: 0.05`** is added: the
    opening tank in the i-th position of a shuffled lane order starts at `x = (i + 0.5) × 0.05` —
    0.025 / 0.075 / 0.125 / 0.175 at 4 lanes. *(Revised from 0.1 after review, decided with the
    author: at 0.1 the first breach came at ~22 s, asking ~5.5 s per answer from the start; 0.05
    gives ~28 s and keeps ~1.7 s between arrivals. 0.01 was rejected — ~0.3 s apart is §6's
    "all critical at once".)* A field, not a constant, so increment 9 can tune it.
- **`src/core/step.ts`**
  - `createGameState`: draws all `waveSize` numbers **distinct** up front (one `rng.int` index into
    the numbers still allowed, as now); shuffles the lanes (Fisher–Yates on the seeded rng); places
    the first `min(lanes, waveSize)` numbers on the board at their staggered depths; queues the
    rest in `pending`. **Ids go front-most first** (deepest tank = id 1), so the placeholder
    target — lowest id — is still the tank nearest the wall, as before. Throws, naming `waveSize`
    and the answer range, when the range holds fewer numbers than the wave (13 of 21 fit today).
  - `step`: every lane whose tank left this step — **killed by a drone or breached** — gets
    `pending[0]` at `x = 0` in that same step, ascending lane order when several empty at once.
    A refilled tank does not move on its entry step (the existing release convention). No
    refill once `pending` is empty. Draws no rng. The floor and the time-based release are deleted.
  - Winning is unchanged in meaning: board goes empty with nothing pending, loss checked first.
- **`src/render/scene.ts`**
  - A **"Tanks left 13"** counter on the console, between the hearts and the problem, from
    `tanks.length + pending.length`.
  - **Entry fix (PLAN's play-session finding):** remap core `x = 0` so a tank's tail sits on the
    left edge instead of fully off-screen — its number is readable the moment it enters, not ~1.1 s
    later. Render-only: `x = 1` still puts the nose on the wall; the hit drone shares the mapping
    so impacts stay aligned; travel shrinks by one tank width (1360 → 1270 px), so tanks *look*
    ~7% faster on screen. Nothing in core changes for it.
- **Tests:** new `test/core/refill.test.ts`, plus the fixture changes below.

## Fixture and test changes to existing files — need your approval

1. **Mechanical, all four files:** drop `spawnIntervalSeconds`, add `openingStagger`; `pending`
   literals become number arrays; `drone.test.ts`'s `waveSize: 60` (and matching `hearts: 60`)
   → 21, the most the answer range can hold distinct.
2. **Deleted — they test the retired schedule:** `step.test.ts` "starts with … an empty board",
   "schedules the first spawn immediately …", "assigns every spawn a lane …", "uses more than one
   lane …", "holds a spawn back until the clock …", "releases every due spawn …", "never lets two
   tanks on screen at once show the same number, at any traverse/interval ratio", "says which dial
   is wrong …", "uses most of the answer range across a long schedule"; `wave.test.ts`'s whole
   "board is never left empty (§6 floor)" and "fast-cleared run, where the floor fires" blocks.
   Each is replaced by a refill-era test in `refill.test.ts` where the intent survives.
3. **Rewritten:** `step.test.ts` "queues exactly waveSize spawns" → `waveSize − lanes`;
   "releases a spawned tank at the start of its lane" and "drops a released spawn …" → move to
   refill tests. `wave.test.ts` "does not win while spawns are still pending" keeps its intent
   with a number-array fixture.

## Out of scope

- §6's spawn governor and anything that stops two refills reaching the wall together (6) — see
  Concerns: a breach in two lanes at once refills both at `x = 0` side by side.
- §5 urgency targeting (5); end-of-run summary (4d); an entry animation for refills (10).
- `main.ts` — no change expected.

## Done when

`npm run check` passes. In `npm run dev` (a real browser, not VS Code's preview): the run opens
with four tanks at visibly different depths, numbers readable at once; every kill or breach puts a
new tank in that lane immediately; "Tanks left" counts down from 13; the last four tanks drain
lane by lane to "You won!".

## Concerns for the author

- Refills enter at `x = 0` whenever a tank leaves, so after a few kills the stagger is whatever
  the player's timing made it. Two lanes emptied in the same step (two breaches, or a kill and a
  breach) re-enter side by side and reach the wall together. Accepting that until increment 6 is my proposal.
- The front opening tank (`x = 0.175` at 0.05) reaches the wall in ~28 s, so the first breach of
  an idle run comes earlier than 4b's 34 s.
