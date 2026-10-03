# Increment 3 — Tap to shoot

The first playable moment. The player's tap is the only input, and it resolves through core:
DESIGN.md §4 — a correct answer sends a kamikaze drone down the target's own lane; a wrong one
sends a drone diagonally off-screen and leaves the problem standing. One drone in flight, no
retargeting (§16). Still no stakes: drones are free and a breach costs nothing.

## In scope

- **`src/core/types.ts`** — `Drone = { kind: 'hit'; x; lane; targetId } | { kind: 'miss'; x }`,
  `GameState.drone: Drone | null`, and `Config.droneTraverseSeconds: 0.4`. That is encoded as a
  **speed** — a full board width in 0.4 s — not a fixed per-shot duration: §6's fairness argument
  is that the gap closes at `v_drone + v_tank`, which requires a near tank to die sooner than a
  far one. PLAN's "~0.4 s flight time" is therefore the worst case, from the wall to `x = 0`.
- **`src/core/step.ts`** — `selectTank(state, tankId)`, the single entry point for a player
  decision (§8: recall mode resolves a typed number to the same tank id). It returns `state`
  unchanged when a drone is already in flight (§4 one at a time; §16 no retargeting), when no
  problem is live, or when `tankId` is not on the board (§8: a number no tank carries is
  rejected). Otherwise it launches at `x = 1`: `hit` in the target's lane when
  `tankId === problem.targetId`, else `miss`. It draws no rng, and **leaves the problem live
  through the flight** — §4 generates the next one *on impact*, and a blank console mid-flight
  would read as a bug.
- **`step` resolves the drone before it moves the tanks.** The drone advances
  `dt / droneTraverseSeconds` leftward; a `hit` impacts when its new `x` reaches where the target
  will be at the **end** of the step (`target.x + advance`), destroying that tank and clearing the
  drone; a `miss` is removed at `x <= 0`. *(Amended after `/code-review`: this said `x <= target.x`,
  comparing the drone's new position against the tank's old one. That is a half-step mismatch which
  holds only while the drone is faster than the tank, and §6 claims interception "for any drone
  speed whatsoever" — which increment 9 relies on when it sweeps `droneTraverseSeconds` as a pure
  drama dial. Reading both positions at the same instant makes the guarantee unconditional, and the
  orphaned-drone branch genuinely unreachable.)* The order is not incidental:
  at `dt = 1/60` a tank one step from the wall would breach before a drone moving 50× faster got
  checked against it, so resolving the drone first is what makes §6's "interception always happens
  before the breach" true of the code and not just of the geometry. A `hit` collides only with its
  own `targetId` (§16 rejects wrong targets clearing the board). Increment 2's "target gone →
  clear the problem" clause then re-rolls on impact for free.
- **`src/render/scene.ts`** — `createScene(config, onSelectTank)` adds a `click` listener to each
  tank `<g>` (§17: tap targeting is a click listener on the node, correct on touch and mouse) and
  draws one `<g>` for the drone in a layer above the tanks: `hit` horizontally in its lane, `miss`
  from the top-right corner to the bottom-left. Core owns the drone's one scalar; the diagonal is
  derived from it in render, because deleting the diagonal would not change a run's outcome.
- **`src/app/main.ts`** — buffers taps and applies at most one per fixed step, before `step`, for
  the same reason `ensureProblem` sits inside that loop: increment 9 replays a run as a pure
  function of the seed plus inputs at step indices, which a tap applied per rAF frame would break.
- **`spawnCount: 20 → 60`** in the placeholder table. Tanks now die as fast as they are tapped, so
  20 empties the board long before PLAN's "playable endlessly" bar can be judged. One placeholder
  number, still retired by increment 4b's wave.
- **`index.html` — `touch-action: manipulation` on the SVG.** *(Added after `/code-review`; the
  file was not in this list originally.)* The entire increment is tapping, and on a tablet a quick
  second tap is otherwise read as double-tap-to-zoom: the board moves instead of the drone firing.
  One line, and §17's claim that a `click` listener is "correct on touch and mouse" is not true on
  a touch screen without it.
- **`test/core/step.test.ts` — fixtures only.** *(Also not in this list originally.)* `drone: null`
  in five `GameState` literals, forced by the new required field, plus `droneTraverseSeconds` added
  to its pinned config so that config's "every field pinned" comment stays true. No assertion
  changed. Increment 2 set the precedent when it added `problem`.

## Out of scope

- Hearts, a breach costing anything, restart (4a); the drone pool, resupply, score, win and loss
  (4b) — every drone here is free, and running dry is not yet possible.
- §5 urgency tiers and the weighted pick (5) — the placeholder still hands the answer to the front
  tank, which is exactly why PLAN holds the target player's first session for 5.
- Explosions, sprite sheets, drone art, rotor animation, screen shake, sound (10+) — the drone is a
  rectangle, and its motion comes from the game loop, never from CSS (CLAUDE.md).
- Recall-mode typing (§8) and practice mode's "tanks advance only while a drone is in flight"
  (§12) — this increment creates the state that mode needs, but not the mode.
- The §6 assertion and the spawn governor (6); distractor strategies (7); outcome logging, incl.
  elapsed answer time (8).
- jsdom tests for `render/`; responsive layout; styling beyond a legible rectangle.

## Done when

`npm run check` passes, and the author opens `npm run dev` and: taps the tank whose number matches
the problem, watching a drone fly down that lane, destroy it, and a new problem appear; taps a
wrong tank, watching a drone cross diagonally off-screen with the problem unchanged; and finds a
tap during a flight does nothing at all.

Tests: a correct tap launches a `hit` in the target's lane; a wrong tap launches a `miss` and
leaves the problem identical; a tap while a drone is in flight, with no problem live, or naming an
id not on the board changes nothing; a `hit` passes through non-target tanks in its own lane and
destroys only its target; a target one step from the wall dies to the drone rather than to the
breach; impact removes the tank and clears the drone, and the following `ensureProblem` yields a
problem for a different tank; a `miss` leaves the board and destroys nothing; `step` and
`selectTank` never mutate the state passed to them; the same seed and the same taps replay
identically.
