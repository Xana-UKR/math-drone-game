# Increment 4a — Hearts and losing

The first stakes. DESIGN.md §4.6–7 and §7: a tank reaching the wall costs one heart and is
destroyed; zero hearts ends the run; a full-screen tap starts a new run on a fresh seed (§2: "instant
restart, no menu between attempts"). Drones are still free — the pool is 4b.

## In scope

- **`src/core/types.ts`** — `GameState.hearts: number`, `GameState.outcome: 'playing' | 'lost'`
  (4b adds `'won'`), `Config.hearts: 3`. `defaultConfig` gets **`laneTraverseSeconds: 34`,
  `spawnIntervalSeconds: 6`** (PLAN.md, decided 2026-10-03).
- **`src/core/step.ts`**
  - `createGameState` starts at `hearts: config.hearts`, `outcome: 'playing'`.
  - `step`: every tank removed at the wall costs one heart; hearts clamp at 0 (two tanks can breach
    in one step). Reaching 0 sets `outcome: 'lost'` in that same step.
  - **Breach drift fix (PLAN carried item):** the breach filter gets the same tolerance as the
    drone's arrival (`x >= 1 - ε`), one shared constant, so a tank breaches on its nominal step at
    every traverse time and not one step late. Chosen over deriving positions from the clock: it
    is a one-line change, and the clock rewrite would touch every movement path for no new
    behaviour.
  - Once `outcome !== 'playing'`, **`step`, `selectTank` and `ensureProblem` all return `state`
    unchanged** (and draw no rng). The board freezes as it was at the moment of loss — remaining
    tanks, problem, spent hearts — and the headless harness gets a run that ends instead of one it
    must remember to stop. *(Amended after `/code-review`: this said the child "can see the tank
    that got through", but that tank is destroyed on impact like every breach (§4.6, §7). Agreed
    with the author: a bang at the wall in increment 10 shows that moment, not a core exception.)*
- **`src/app/main.ts`** — seeds each run from `crypto.getRandomValues` (app, never core) and logs
  the seed with `console.info`, so a run worth replaying can be. On restart: new seed, new rng, new
  state, cleared tap queue, **and a new scene** — ids restart at 1, and the scene's id-keyed tank
  nodes would otherwise reuse a dead tank's node and its stale number.
- **`src/render/scene.ts`** — `createScene(config, onSelectTank, onRestart)`. Hearts drawn on the
  console above the problem: one `<text>` ♥ per `config.hearts`, spent ones greyed. When
  `outcome === 'lost'`, a full-screen overlay `<g>` above everything (dim rect + "Tap to play
  again") whose `click` calls `onRestart`. It ignores clicks for its first **0.75 s**, wall clock,
  so a child already mid-tap on a tank does not restart past the loss before seeing it.
- **`index.html` + `scene.ts` — no text selection, honest cursor.** *(Amended after play, approved
  by the author; `index.html` was not in this list originally.)* `user-select: none` (and
  `-webkit-`) on the SVG, so tank numbers can't be selected/highlighted and a long press on a
  tablet doesn't raise the copy callout; `cursor: default` across the board, `pointer` on tank
  groups and on the restart overlay — the cursor says what is tappable.
- **Tests:** new `test/core/hearts.test.ts`; fixtures only in `step.test.ts` / `drone.test.ts`
  (`hearts`, `outcome` in `GameState` literals; `hearts` in the pinned configs).

## Out of scope

- Drone pool, resupply, wave of N, winning, loss-checked-first precedence (4b). `spawnCount` stays.
- Explosions, breach effects, screen shake, heart animations, sound (10+).
- A loss screen with stats, score, or a menu — §2 forbids the menu; score is 4b.
- The near-wall "no drone drawn" tap (PLAN: increment 10).

## Decided: pre-hearts test files pin `hearts` to their `spawnCount`

`step.test.ts` pins `hearts: 20` and `drone.test.ts` pins `hearts: 60` — each equal to its own
`spawnCount`, so no run in those files can end, which is the game they were written against.
At `hearts: 3` they would freeze at ~25 s and at least two assertions would fail ("gives every
tank a distinct id" needs every spawn released; "shows a problem for most of the run" loses its
problem at the losing breach). Losing is tested in `hearts.test.ts` at `hearts: 3`.
*(First recommendation was `hearts: 3`, on the wrong claim that every assertion would still pass;
revised and approved by the author.)*

## Done when

`npm run check` passes, and in `npm run dev` you: watch three hearts on the console; let a tank
through and see one go grey and the tank vanish; let two more through and see the board freeze
under "Tap to play again"; tap and get a new run whose lanes and numbers differ from the last.
