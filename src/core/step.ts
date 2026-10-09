import { generateProblem } from './problem';
import type { Rng } from './rng';
import type { Config, Drone, GameState, LiveProblem, PendingSpawn, Tank } from './types';

/**
 * Both the drone's and a tank's `x` accumulate by repeatedly adding or subtracting a fraction of
 * a second — `dt / droneTraverseSeconds` or `dt / laneTraverseSeconds` — that (like most of them)
 * has no exact binary representation. Over enough steps that rounding drifts, an arrival check of
 * exactly `<= 0` (for the drone) or `>= 1` (for a tank's breach) can miss by one whole step: e.g.
 * at the drone's defaults, 24 steps of a 1/60 s `dt` land a few `1e-16` *above* an arrival that is
 * mathematically exact at 0, and PLAN.md measured that summing `dt / laneTraverseSeconds` lands a
 * few `1e-15` to `5e-14` *below* 1 at the nominal breach step for most plausible traverse times —
 * both directions let the thing outlive the step it should resolve on. The tolerance absorbs
 * either drift; it is many orders of magnitude below the smallest single-step advance the game can
 * produce, so it never changes which step a drone arrives or a tank breaches on.
 */
const ARRIVAL_EPSILON = 1e-9;

/**
 * Builds the entire fixed spawn list up front — the only place randomness is consumed by spawn
 * scheduling. `step` itself is pure and reads no rng.
 *
 * A tank's number is the answer it will eventually be asked for (DESIGN.md §9), so no two tanks
 * that can be on screen at the same time may show the same number. Each spawn's number is
 * therefore drawn from the answer range with the numbers of every spawn still on screen excluded.
 * Drawing an index into the list of numbers still allowed (one `rng.int` call) keeps this
 * deterministic, instead of re-rolling until a collision-free number turns up.
 *
 * `config.waveSize` (DESIGN.md §7's N) is the whole run: exactly that many spawns, no more ever
 * queued. `drones` starts at the same N — the pool and the wave share one number by construction,
 * not by a second field that could drift from it — and `correct` starts at zero.
 */
export function createGameState(config: Config, rng: Rng): GameState {
  const pending: PendingSpawn[] = [];

  // Spawn `i + k` overlaps spawn `i` while `k * spawnIntervalSeconds` is less than the time spawn
  // `i` spends on the board. That time is `laneTraverseSeconds + dt`, not `laneTraverseSeconds`:
  // a tank is released without moving on its release frame, so it outlives its own traverse time
  // by one step — on increment 1's 20 s / 2.5 s pair, 9 tanks shared the board for a frame, not
  // 8. Core does not know `dt` and so cannot size that extra frame. Taking the plain `ceil` of the ratio
  // covers it at every ratio: it is exact when the ratio sits at or just below an integer — the
  // cases where that extra frame decides the overlap — and errs by one spare exclusion elsewhere.
  const overlapCount = Math.max(
    0,
    Math.ceil(config.laneTraverseSeconds / config.spawnIntervalSeconds),
  );
  const onScreen: number[] = [];

  for (let i = 0; i < config.waveSize; i += 1) {
    const lane = rng.int(0, config.lanes);

    const taken = new Set(onScreen);
    const allowed: number[] = [];
    for (let n = config.answerMin; n <= config.answerMax; n += 1) {
      if (!taken.has(n)) allowed.push(n);
    }

    // Tested before the draw rather than after it: `rng.int(0, 0)` would throw its own opaque
    // range error first, hiding the one thing the caller needs to know.
    const number = allowed.length === 0 ? undefined : allowed[rng.int(0, allowed.length)];
    if (number === undefined) {
      throw new Error(
        `createGameState: the answer range [${config.answerMin}, ${config.answerMax}] is too ` +
          `small to keep ${overlapCount + 1} tanks on screen distinct — spawn ${i} has no ` +
          'number left',
      );
    }

    pending.push({ at: i * config.spawnIntervalSeconds, lane, number });

    onScreen.push(number);
    if (onScreen.length > overlapCount) onScreen.shift();
  }

  return {
    time: 0,
    tanks: [],
    pending,
    nextId: 1,
    problem: null,
    drone: null,
    hearts: config.hearts,
    drones: config.waveSize,
    correct: 0,
    outcome: 'playing',
  };
}

/**
 * Advances the clock by `dt`. **Resolves the drone before moving a single tank** — at `dt = 1/60`
 * a tank one step from the wall would otherwise breach in the same step a drone moving ~50×
 * faster (the default `droneTraverseSeconds` against `laneTraverseSeconds`) was first checked
 * against it. Resolving the drone first — before the wall-breach filter below ever runs — is what
 * makes DESIGN.md §6's "interception always happens before the breach" true of the code and not
 * merely of the geometry.
 *
 * A `hit` drone advances toward `x = 0` and impacts — destroying its target and clearing the
 * drone — the moment its new `x` reaches where the target will be at the **end** of this step,
 * `target.x + advance`. Both positions have to be read at the same instant or the comparison is a
 * half-step out: §6's geometry is that the gap closes at `v_drone + v_tank`, which the drone's new
 * `x` against the tank's old `x` only approximates. That mismatch is invisible while the drone is
 * much faster than the tank, and becomes a missed interception once it isn't — a drone slower than
 * a tank would fail to catch a target in its last step before the wall. Comparing both at the end
 * of the step makes interception beat the breach at *any* drone speed, which is what §6 claims and
 * what lets increment 9 sweep `droneTraverseSeconds` as the pure drama dial §6 says it is.
 *
 * It collides only with its own `targetId`; every other tank, including ones sharing its lane, is
 * passed through untouched (DESIGN.md §16: a wrongly-targeted tank must never be cleared for
 * free). If its target is no longer on the board the drone is cleared with no other effect — with
 * the end-of-step comparison above this is unreachable at any drone speed, since `selectTank` only
 * ever launches at a tank that is on the board and the closing gap is strictly faster than the
 * tank's own approach to the wall. It is still handled, because a hit drone is otherwise only ever
 * removed on impact: an orphaned one would fly past the far edge forever while `selectTank` keeps
 * refusing every tap, soft-locking the game. (Increment 6 turns the §6 invariant into a real
 * dev-build assertion.) A `miss` drone is simply removed once its new `x` reaches 0.
 *
 * Releases every pending spawn whose time has come, moves each surviving tank right by
 * `dt / laneTraverseSeconds`, and retires any tank that reached the wall — using the same
 * `ARRIVAL_EPSILON` tolerance as the drone, so a tank breaches on its nominal step rather than
 * surviving one step too long on the traverse times PLAN.md measured drifting the other way
 * (see `ARRIVAL_EPSILON`'s comment). Each tank retired this way, as opposed to one the drone
 * already removed above, costs one heart (DESIGN.md §4.6–7); hearts clamp at zero even when more
 * tanks breach in the same step than hearts remain, and reaching zero sets `outcome: 'lost'` in
 * this same step. Also clears `state.problem` when its target tank is no longer on the board —
 * DESIGN.md §5: the answer re-rolls the moment its tank is gone, and never changes otherwise. That
 * one clause also covers a drone's impact for free, since the target is already gone from `tanks`
 * by the time it runs. `ensureProblem` is the only function that sets a new problem, so `step`
 * still consumes no randomness. Pure: never mutates `state`, its tanks, or its drone.
 *
 * A hit's impact (above) also counts the answer: `correct + 1`, and — the instant `correct`
 * reaches a multiple of `config.resupplyEvery` — one drone back in the pool (DESIGN.md §7). Both
 * are counted on impact, not at the tap: §4.4 orders "destroys the tank, score increases" after
 * the hit, and an orphaned hit (its target already gone, handled above) earns neither. A breach
 * earns nothing either — it costs a heart, not a correct answer.
 *
 * **The empty-board floor (DESIGN.md §6).** A wave is fixed-size, so the schedule above, built
 * once in `createGameState` from a fixed interval, can legitimately leave a gap: the player can
 * clear tanks faster than the schedule refills them, especially right after `createGameState`'s
 * collision exclusion forces a slower run of spawns. Left alone that gap would show the player an
 * empty board while tanks they haven't seen yet sit queued seconds away — indistinguishable from
 * the wave having ended early. So: in the step where the board *goes* empty — `state.tanks.length`
 * was positive, no moved tank survived the wall-breach filter above, and nothing was already due
 * this step — the earliest remaining pending spawn (`pending[0]`, the list stays sorted by `at`)
 * is released immediately, at `x = 0`, and every pending spawn shifts earlier by the same amount
 * (`pending[0].at - time`) so the schedule's own spacing survives intact — which is what keeps
 * `createGameState`'s on-screen-number exclusion valid without it having to know this happened.
 * Any other spawn that shared `pending[0]`'s exact `at` is released alongside it, for the same
 * reason two spawns can share a slot in the first place: `createGameState` stacks them deliberately
 * when the interval is tight. Triggered by the board *becoming* empty, not by *being* empty, so a
 * board that starts a step already empty (nothing to clear, hence no "gap" to close) is untouched
 * — that is what keeps `createGameState`'s own empty start, and the ordinary spawn tests built on
 * it, out of this path. Draws no rng: the floor only ever reschedules spawns `createGameState`
 * already drew.
 *
 * **Winning.** Checked after the floor has had its chance to refill the board, so a wave that
 * still has tanks queued is never mistaken for one that is over. `outcome` becomes `'won'` the
 * step the board and the pending list are *both* empty — the wave fully resolved, by drone or by
 * breach — provided hearts are still above zero; **loss is checked first**, so the tank that spends
 * the last heart wins nothing even if it was also the wave's last tank. A board that was already
 * empty before this step (nothing to resolve) cannot win here either, by the same "goes, not is"
 * reasoning as the floor above — DESIGN.md §7 makes winning the wave's own event, not a fact about
 * standing still on an empty one.
 *
 * Once a run is lost or won, `step` returns `state` itself — same reference, no rng drawn — so the
 * board freezes exactly as it stood at the moment the run ended — the remaining tanks, the problem
 * and the spent hearts — and the headless harness gets a run that stops on its own instead of one
 * it must remember to halt. The tank that took the last heart is *not* on it: like every breaching
 * tank it is destroyed on impact (DESIGN.md §4.6, §7). Showing that moment is a render effect at
 * the wall (increment 10), not a special case here.
 */
export function step(state: GameState, dt: number, config: Config): GameState {
  if (state.outcome !== 'playing') return state;

  const time = state.time + dt;
  const advance = dt / config.laneTraverseSeconds;

  let tanks = state.tanks;
  let drone = state.drone;
  let correct = state.correct;
  let drones = state.drones;

  if (drone !== null) {
    const x = drone.x - dt / config.droneTraverseSeconds;

    if (drone.kind === 'miss') {
      drone = x <= ARRIVAL_EPSILON ? null : { kind: 'miss', x };
    } else {
      const { targetId, lane } = drone;
      const target = tanks.find((tank) => tank.id === targetId);
      if (target === undefined) {
        drone = null;
      } else if (x <= target.x + advance + ARRIVAL_EPSILON) {
        tanks = tanks.filter((tank) => tank.id !== targetId);
        drone = null;
        correct += 1;
        if (correct % config.resupplyEvery === 0) drones += 1;
      } else {
        drone = { kind: 'hit', x, lane, targetId };
      }
    }
  }

  let pending: PendingSpawn[] = [];
  const due: PendingSpawn[] = [];
  for (const spawn of state.pending) {
    if (spawn.at <= time) due.push(spawn);
    else pending.push(spawn);
  }

  const movedTanks = tanks
    .map((tank) => ({ ...tank, x: tank.x + advance }))
    .filter((tank) => tank.x < 1 - ARRIVAL_EPSILON);

  // Every tank that moved but did not survive the filter above breached the wall this step —
  // a tank the drone already destroyed never reaches this point, so it costs nothing.
  const breaches = tanks.length - movedTanks.length;
  const hearts = Math.max(0, state.hearts - breaches);

  // The empty-board floor (DESIGN.md §6) — see the doc comment above. `first` is `pending[0]`:
  // the earliest spawn left, since `pending` stays sorted by `at` through every step.
  const floorReleases: PendingSpawn[] = [];
  const [first] = pending;
  if (state.tanks.length > 0 && movedTanks.length === 0 && due.length === 0 && first !== undefined) {
    const shift = first.at - time;
    const stillPending: PendingSpawn[] = [];
    for (const spawn of pending) {
      if (spawn.at === first.at) floorReleases.push(spawn);
      else stillPending.push({ ...spawn, at: spawn.at - shift });
    }
    pending = stillPending;
  }

  let nextId = state.nextId;
  const releasedTanks: Tank[] = [...due, ...floorReleases].map((spawn) => {
    const tank: Tank = { id: nextId, lane: spawn.lane, x: 0, number: spawn.number };
    nextId += 1;
    return tank;
  });

  const nextTanks = [...movedTanks, ...releasedTanks];

  const { problem } = state;
  const nextProblem: LiveProblem | null =
    problem !== null && !nextTanks.some((tank) => tank.id === problem.targetId) ? null : problem;

  const outcome =
    hearts <= 0
      ? 'lost'
      : state.tanks.length > 0 && nextTanks.length === 0 && pending.length === 0
        ? 'won'
        : 'playing';

  return {
    time,
    tanks: nextTanks,
    pending,
    nextId,
    problem: nextProblem,
    drone,
    hearts,
    drones,
    correct,
    outcome,
  };
}

/**
 * The single entry point for a player decision (DESIGN.md §8: recall mode resolves a typed number
 * to the same tank id this handles). Returns `state` unchanged, and draws no rng, when the run is
 * no longer `'playing'` (a lost or won run takes no more taps), when a drone is already in flight
 * (§4: one at a time; §16: no retargeting), when no problem is live, when `tankId` names no tank
 * currently on the board (§8: a number no tank carries is rejected outright), or — DESIGN.md §7 —
 * when the drone pool is empty: a tap with nothing left to launch is refused exactly like any
 * other, so running the pool dry reads as "no more taps land", not as a crash.
 *
 * Otherwise launches a drone at `x = 1`, the wall: `hit` in the tapped tank's own lane when it
 * carries the live answer, `miss` (no lane, no target) otherwise. Does **not** destroy the tapped
 * tank and does **not** touch `state.problem` — §4 generates the next problem *on impact*, not at
 * the tap, and a blank console mid-flight would read as a bug. Every launch, hit or miss alike,
 * spends one drone from the pool — §7 counts the shot, not the outcome; `step` is what hands one
 * back on a correct answer. Pure: never mutates `state`.
 */
export function selectTank(state: GameState, tankId: number): GameState {
  if (state.outcome !== 'playing') return state;
  if (state.drone !== null) return state;
  const { problem } = state;
  if (problem === null) return state;

  const target = state.tanks.find((tank) => tank.id === tankId);
  if (target === undefined) return state;

  if (state.drones <= 0) return state;

  const drone: Drone =
    tankId === problem.targetId
      ? { kind: 'hit', x: 1, lane: target.lane, targetId: tankId }
      : { kind: 'miss', x: 1 };

  return { ...state, drone, drones: state.drones - 1 };
}

/**
 * Sets a new live problem when there is none and tanks exist to ask about. Returns `state`
 * unchanged — and draws no rng — when the run is no longer `'playing'` (a lost or won run sets no
 * more problems), when a problem is already live (§5: the answer never changes under the player's
 * finger), or the board is empty.
 *
 * The target pick here — the earliest-spawned tank still on the board (lowest `id`) — is a
 * **placeholder**. Increment 5 replaces it with DESIGN.md §5's urgency tiers and weighted pick;
 * nothing here should be mistaken for that.
 */
export function ensureProblem(state: GameState, rng: Rng, config: Config): GameState {
  if (state.outcome !== 'playing') return state;
  if (state.problem !== null || state.tanks.length === 0) return state;

  const target = state.tanks.reduce((earliest, tank) => (tank.id < earliest.id ? tank : earliest));

  const generated = generateProblem(target.number, rng, config);
  return { ...state, problem: { ...generated, targetId: target.id } };
}
