# Increment 1 — Tanks move

The first vertical slice: tanks spawn, drive right, and vanish at the wall. No problem, no drone,
no stakes — just the loop, the clock and the coordinate space all three layers agree on.

## In scope

- **Coordinate space.** Core is unitless: a tank's `x` runs `0` at spawn to `1` at the wall, so
  DESIGN.md §5's urgency *is* `x` and core stays geometry-independent. Render owns pixels.
- **`src/core/types.ts`** — `Tank { id, lane, x, number }`, `GameState { time, tanks, pending,
  nextId }`, and a `Config` object (PLAN.md's Milestone 1 placeholder table; DESIGN.md §17a.2
  leaves the real values open): `lanes: 4`,
  `laneTraverseSeconds: 20`, `spawnIntervalSeconds: 2.5`, `spawnCount: 20`. Only fields this
  increment uses — hearts, drones and wave size arrive with the increments that need them.
- **`src/core/rng.ts`** — seeded, reproducible `createRng(seed): Rng` with `next(): number` in
  `[0,1)` and `int(min, maxExclusive)`. Nothing else; no general utility belt (DESIGN.md §17).
- **`src/core/step.ts`** — `createGameState(config, rng)` builds a **fixed** spawn list up front
  (lane and number drawn from the rng, `number` a placeholder integer for now), so `step` itself
  consumes no randomness and is pure. `step(state, dt, config)` advances time, releases due
  spawns, moves each tank right by `dt / laneTraverseSeconds`, and removes any tank at `x >= 1`.
  **Time is injected as `dt`, never read** — `Date.now()` is reachable from core and no config can
  exclude it (PLAN.md).
- **Position is stored and advanced, not derived from a spawn timestamp**, because practice mode
  (DESIGN.md §12) stops tanks while the clock keeps running.
- **`src/render/scene.ts`** — builds the SVG (`viewBox`, lane bands, base wall on the right) and a
  `sync(state)` that creates, moves and removes one `<g>` per tank, keyed by `id`: a `<rect>` hull
  with the tank's number as a `<text>` child. The §13 text safe zone is proven on day two.
- **`src/app/main.ts`** — fixed-timestep rAF loop: accumulator, fixed `dt = 1/60`, frame delta
  clamped so a backgrounded tab cannot spiral. Owns the clock and a constant seed. Gameplay motion
  is moved by this loop, never by CSS (CLAUDE.md).
- **Delete `src/core/placeholder.ts`**; `index.html` loses the increment-0 marker styling and gives
  the SVG the full viewport.

## Out of scope

- Problem generation, numbers that mean anything, no-duplicate-number constraints (increment 2).
- Tapping, drones, hit detection (3); hearts, breach consequences, win/loss, score (4a/4b).
- Urgency tiers and target selection (5); the state-dependent spawn governor and the §6 assertion
  (6) — the fixed spawn list is exactly what 6 replaces.
- Real art, explosions, responsive lane count, interpolated rendering, jsdom tests for `render/`.

## Done when

`npm run check` passes, and the author opens `npm run dev` and watches tanks cross four lanes and
disappear at the wall, each carrying a legible number, at a speed that reads as ~20 s a lane.
Tests: a tank spawned at `x = 0` is at mid-lane after 10 s simulated and gone after 20 s; the same
seed produces an identical run twice; `step` never mutates the state passed to it.
