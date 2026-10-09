import { generateProblem } from './problem';
import type { Rng } from './rng';
import type { Config, Drone, GameState, LiveProblem, Tank } from './types';

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
 * Builds the whole wave and the opening board up front — the only place randomness is consumed
 * for either. `step` itself is pure and reads no rng.
 *
 * A tank's number is the answer it will eventually be asked for (DESIGN.md §9), so no two tanks
 * of the same wave may ever show the same number — increment 4c's lane refill means any tank of
 * the wave can in principle end up on screen with any other, not merely the ones a fixed schedule
 * used to overlap. Every one of `config.waveSize` numbers is therefore drawn distinct, up front,
 * from the answer range with every number already drawn excluded. Drawing an index into the list
 * of numbers still allowed (one `rng.int` call) keeps this deterministic, instead of re-rolling
 * until a collision-free number turns up. Checked before a single number is drawn — naming both
 * `waveSize` and the answer range — when the range cannot hold that many distinct numbers; the
 * raw `rng.int(0, 0)` error the first draw would otherwise hit says nothing about why.
 *
 * The lane each opening tank occupies is then decided by a Fisher–Yates shuffle of the lanes, on
 * the same rng stream. The first `min(config.lanes, config.waveSize)` numbers drawn open on the
 * board, one per lane, at the position its lane landed in the shuffle: position `i` sits at
 * `x = (i + 0.5) × config.openingStagger`, so the opening board shows tanks at visibly different
 * depths instead of a wall of them arriving together. Ids go front-most first — the deepest
 * opening tank (largest `x`, the last position) gets id 1, rising away from the wall — so the
 * placeholder target (lowest id, increment 2) is still the tank nearest the wall, as it always
 * was. Every remaining number queues in `pending`, in the order it was drawn — the order lane
 * refill (`step`) releases them in.
 *
 * `config.waveSize` (DESIGN.md §7's N) is the whole run: exactly that many tanks, no more ever
 * drawn. `drones` starts at the same N — the pool and the wave share one number by construction,
 * not by a second field that could drift from it — and `correct` starts at zero.
 */
export function createGameState(config: Config, rng: Rng): GameState {
  const rangeSize = config.answerMax - config.answerMin + 1;
  if (rangeSize < config.waveSize) {
    throw new Error(
      `createGameState: the answer range [${config.answerMin}, ${config.answerMax}] holds only ` +
        `${rangeSize} number(s), too few for a waveSize of ${config.waveSize} distinct tanks`,
    );
  }

  const numbers: number[] = [];
  const drawn = new Set<number>();
  for (let i = 0; i < config.waveSize; i += 1) {
    const allowed: number[] = [];
    for (let n = config.answerMin; n <= config.answerMax; n += 1) {
      if (!drawn.has(n)) allowed.push(n);
    }

    const number = allowed[rng.int(0, allowed.length)];
    // Unreachable given the range check above: `allowed.length` is `rangeSize - i`, at least
    // `config.waveSize - i`, which is positive for every i below config.waveSize.
    if (number === undefined) throw new Error('createGameState: no number left to draw');

    drawn.add(number);
    numbers.push(number);
  }

  const laneOrder: number[] = Array.from({ length: config.lanes }, (_, lane) => lane);
  for (let i = laneOrder.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i + 1);
    const atI = laneOrder[i];
    const atJ = laneOrder[j];
    // Unreachable: i and j are always valid indices into laneOrder, whose length never changes.
    if (atI === undefined || atJ === undefined) {
      throw new Error('createGameState: internal error shuffling lanes');
    }
    laneOrder[i] = atJ;
    laneOrder[j] = atI;
  }

  const boardCount = Math.min(config.lanes, config.waveSize);
  const tanks: Tank[] = [];
  for (let i = 0; i < boardCount; i += 1) {
    const lane = laneOrder[i];
    const number = numbers[i];
    // Unreachable: i ranges over [0, boardCount) and both arrays are at least that long.
    if (lane === undefined || number === undefined) {
      throw new Error('createGameState: internal error placing the opening board');
    }
    tanks.push({ id: boardCount - i, lane, x: (i + 0.5) * config.openingStagger, number });
  }

  return {
    time: 0,
    tanks,
    pending: numbers.slice(boardCount),
    nextId: boardCount + 1,
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
 * Moves each surviving tank right by `dt / laneTraverseSeconds`, and retires any tank that reached
 * the wall — using the same `ARRIVAL_EPSILON` tolerance as the drone, so a tank breaches on its
 * nominal step rather than surviving one step too long on the traverse times PLAN.md measured
 * drifting the other way (see `ARRIVAL_EPSILON`'s comment). Each tank retired this way, as opposed
 * to one the drone already removed above, costs one heart (DESIGN.md §4.6–7); hearts clamp at zero
 * even when more tanks breach in the same step than hearts remain, and reaching zero sets
 * `outcome: 'lost'` in this same step. Also clears `state.problem` when its target tank is no
 * longer on the board — DESIGN.md §5: the answer re-rolls the moment its tank is gone, and never
 * changes otherwise. That one clause also covers a drone's impact for free, since the target is
 * already gone from `tanks` by the time it runs. `ensureProblem` is the only function that sets a
 * new problem, so `step` still consumes no randomness. Pure: never mutates `state`, its tanks, or
 * its drone.
 *
 * A hit's impact (above) also counts the answer: `correct + 1`, and — the instant `correct`
 * reaches a multiple of `config.resupplyEvery` — one drone back in the pool (DESIGN.md §7). Both
 * are counted on impact, not at the tap: §4.4 orders "destroys the tank, score increases" after
 * the hit, and an orphaned hit (its target already gone, handled above) earns neither. A breach
 * earns nothing either — it costs a heart, not a correct answer.
 *
 * **Lane refill (increment 4c).** `createGameState` no longer schedules spawns against the clock;
 * every lane holds exactly one tank until the wave runs out. So: every lane that carried a tank at
 * the *start* of this step but carries none of the survivors above — its tank destroyed by the
 * drone's impact, or breached at the wall — takes `pending[0]` next, at `x = 0`, a fresh id from
 * `nextId`. A refilled tank does not move on its own entry step, the same release convention the
 * fixed schedule used. When several lanes empty in the same step (two breaches, or a kill and a
 * breach together) they are refilled in ascending lane order, each taking the next number off the
 * queue — so which lane gets which of the queue's next few numbers is decided by lane number, not
 * by which one emptied first. Refilling stops the moment `pending` runs dry; a lane can end the
 * step empty with the wave not yet over, if nothing is left to put in it. Draws no rng: refill only
 * ever hands out numbers `createGameState` already drew.
 *
 * **Winning.** Checked after refill has had its chance to fill the board, so a wave that still has
 * tanks queued is never mistaken for one that is over. `outcome` becomes `'won'` the step the board
 * and the pending list are *both* empty — the wave fully resolved, by drone or by breach — provided
 * hearts are still above zero; **loss is checked first**, so the tank that spends the last heart
 * wins nothing even if it was also the wave's last tank. A board that was already empty before this
 * step (nothing to resolve) cannot win here either, by the same "goes, not is" reasoning as refill
 * above — DESIGN.md §7 makes winning the wave's own event, not a fact about standing still on an
 * empty one.
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

  const movedTanks = tanks
    .map((tank) => ({ ...tank, x: tank.x + advance }))
    .filter((tank) => tank.x < 1 - ARRIVAL_EPSILON);

  // Every tank that moved but did not survive the filter above breached the wall this step —
  // a tank the drone already destroyed never reaches this point, so it costs nothing.
  const breaches = tanks.length - movedTanks.length;
  const hearts = Math.max(0, state.hearts - breaches);

  // Lane refill (see the doc comment above). A lane started this step with a tank — recorded from
  // `state.tanks`, before the drone or the breach filter touched anything — and lost it if that
  // lane has no survivor among `movedTanks`. Ascending lane order, one pending number each, until
  // the queue runs dry.
  const startingLanes = new Set(state.tanks.map((tank) => tank.lane));
  const survivingLanes = new Set(movedTanks.map((tank) => tank.lane));
  const emptiedLanes = [...startingLanes]
    .filter((lane) => !survivingLanes.has(lane))
    .sort((a, b) => a - b);

  let pending = state.pending;
  let nextId = state.nextId;
  const refilledTanks: Tank[] = [];
  for (const lane of emptiedLanes) {
    const [number] = pending;
    if (number === undefined) break;
    pending = pending.slice(1);
    refilledTanks.push({ id: nextId, lane, x: 0, number });
    nextId += 1;
  }

  const nextTanks = [...movedTanks, ...refilledTanks];

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
