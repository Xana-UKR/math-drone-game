import { describe, expect, it } from 'vitest';

import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import type { Config, Drone, GameState, LiveProblem, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 3. The player's tap is the only input, and it resolves through core: a correct answer
 * launches a kamikaze drone down the target's own lane (DESIGN.md §4), a wrong one launches a
 * drone that leaves the board and destroys nothing. Positions are fractions of a lane — core is
 * unitless, and the drone shares the tanks' axis: x = 1 at the wall it launches from, x = 0 at
 * the far edge.
 */

/** Every field pinned, so retuning `defaultConfig` cannot quietly change what these tests mean. */
const config: Config = {
  ...defaultConfig,
  lanes: 4,
  laneTraverseSeconds: 20,
  spawnIntervalSeconds: 2.5,
  spawnCount: 60,
  droneTraverseSeconds: 0.4,
  answerMin: 0,
  answerMax: 20,
  operandMin: 0,
  operandMax: 20,
  allowCarry: true,
};

const DT = 1 / 60;
/** Fractions of a lane covered in one fixed step, at the config above: 1/1200 and 1/24. */
const TANK_STEP = DT / config.laneTraverseSeconds;
const DRONE_STEP = DT / config.droneTraverseSeconds;

/**
 * How long the scripted player below takes to answer, in fixed steps: PLAN's placeholder
 * `t_answer` of 5 s. It has to be a realistic answer time, not a convenient one — at 0.5 s the
 * player clears every tank about 25 steps after it spawns, so the board never holds a second tank
 * and a wrong tap has nothing to land on.
 */
const TAP_EVERY_STEPS = Math.round(5 / DT);
/** One wrong answer in four — near DESIGN.md §14's 85%-accuracy player, inside §7's error budget. */
const WRONG_EVERY_NTH_ANSWER = 4;

function tankAt(x: number, overrides: Partial<Tank> = {}): Tank {
  return { id: 1, lane: 0, x, number: 12, ...overrides };
}

/** A board with no pending spawns and no drone, so a test is independent of the spawn schedule. */
function boardOf(tanks: Tank[], problem: LiveProblem | null = null): GameState {
  return { time: 0, tanks, pending: [], nextId: tanks.length + 1, problem, drone: null };
}

/** The answer 13 is on tank 1 in lane 2; tank 2 carries a distractor in another lane. */
function twoTanks(targetX = 0.2): GameState {
  return boardOf(
    [tankAt(targetX, { id: 1, lane: 2, number: 13 }), tankAt(0.5, { id: 2, lane: 0, number: 7 })],
    { a: 8, op: '+', b: 5, answer: 13, targetId: 1 },
  );
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function droneOf(state: GameState): Drone {
  const { drone } = state;
  if (drone === null) throw new Error('expected a drone in flight');
  return drone;
}

function problemOf(state: GameState): LiveProblem {
  const { problem } = state;
  if (problem === null) throw new Error('expected a live problem');
  return problem;
}

/** Steps at the fixed timestep until the drone is gone, reporting how many steps that took. */
function flyToEnd(state: GameState, limit = 200): { state: GameState; steps: number } {
  let current = state;
  for (let i = 1; i <= limit; i += 1) {
    current = step(current, DT, config);
    if (current.drone === null) return { state: current, steps: i };
  }
  throw new Error(`drone still in flight after ${limit} steps`);
}

describe('selectTank — a correct tap', () => {
  it('launches a hit drone from the wall in the target tank own lane', () => {
    expect(droneOf(selectTank(twoTanks(), 1))).toEqual({
      kind: 'hit',
      x: 1,
      lane: 2,
      targetId: 1,
    });
  });

  it('does not destroy the tapped tank at the moment of the tap — the kill happens on impact', () => {
    expect(selectTank(twoTanks(), 1).tanks).toEqual(twoTanks().tanks);
  });

  it('leaves the problem standing at the tap — DESIGN.md §4 re-rolls it on impact', () => {
    expect(selectTank(twoTanks(), 1).problem).toEqual(twoTanks().problem);
  });
});

describe('selectTank — a wrong tap', () => {
  it('launches a miss drone carrying no lane and no target', () => {
    expect(droneOf(selectTank(twoTanks(), 2))).toEqual({ kind: 'miss', x: 1 });
  });

  it('leaves the problem exactly as it was', () => {
    expect(selectTank(twoTanks(), 2).problem).toEqual(twoTanks().problem);
  });

  it('destroys nothing on the board', () => {
    expect(selectTank(twoTanks(), 2).tanks).toEqual(twoTanks().tanks);
  });
});

describe('selectTank — taps that are refused', () => {
  // `toBe`, not `toEqual`, throughout: the contract is that a refused tap returns *the same
  // state*, not a fresh copy of it. `main.ts` drains the queue once per fixed step, so a copy per
  // refusal would allocate a state per step and no deep-equality assertion would notice.
  it('ignores every tap while a drone is already in flight — one at a time, no retargeting', () => {
    const hitInFlight = selectTank(twoTanks(), 1);
    expect(selectTank(hitInFlight, 2)).toBe(hitInFlight);
    expect(selectTank(hitInFlight, 1)).toBe(hitInFlight);

    // Both kinds, because a miss is the longer flight — always the full traverse, against as
    // little as one step for a hit at the wall — and so the one a player actually taps during.
    const missInFlight = selectTank(twoTanks(), 2);
    expect(selectTank(missInFlight, 1)).toBe(missInFlight);
    expect(selectTank(missInFlight, 2)).toBe(missInFlight);
  });

  it('ignores a tap when no problem is live', () => {
    const noProblem = boardOf([tankAt(0.3, { id: 1, number: 13 })]);
    expect(selectTank(noProblem, 1)).toBe(noProblem);
  });

  it('rejects a tap naming a tank that is not on the board', () => {
    const state = twoTanks();
    expect(selectTank(state, 99)).toBe(state);
  });

  it('does not mutate the state it is given', () => {
    const state = twoTanks();
    const before = clone(state);
    selectTank(state, 1);
    expect(state).toEqual(before);
  });
});

describe('step — drone flight', () => {
  it('moves the drone toward the far edge at the speed droneTraverseSeconds implies', () => {
    const after = step(selectTank(twoTanks(0.1), 1), DT, config);
    expect(droneOf(after).x).toBeCloseTo(1 - DRONE_STEP, 10);
  });

  it('takes longer to reach a distant tank than a near one — flight is a speed, not a duration', () => {
    const near = flyToEnd(selectTank(twoTanks(0.9), 1)).steps;
    const far = flyToEnd(selectTank(twoTanks(0.1), 1)).steps;
    expect(near).toBeLessThan(far);
    // PLAN's "~0.4 s flight time" is the worst case — the wall to the far edge, not every shot.
    expect(far * DT).toBeLessThanOrEqual(config.droneTraverseSeconds + DT);
    expect(near * DT).toBeCloseTo(0.1 * config.droneTraverseSeconds, 1);
  });

  it('destroys the target tank on impact and clears the drone in the same step', () => {
    const { state } = flyToEnd(selectTank(twoTanks(0.5), 1));
    expect(state.drone).toBeNull();
    expect(state.tanks.map((tank) => tank.id)).toEqual([2]);
  });

  it('keeps the problem live all through the flight, and clears it on impact', () => {
    const launched = selectTank(twoTanks(0.2), 1);
    let midFlight = launched;
    for (let i = 0; i < 5; i += 1) midFlight = step(midFlight, DT, config);
    expect(midFlight.drone).not.toBeNull();
    expect(midFlight.problem).toEqual(launched.problem);
    expect(flyToEnd(midFlight).state.problem).toBeNull();
  });

  it('destroys only its own target, passing through other tanks in the same lane', () => {
    const shared = boardOf(
      [tankAt(0.2, { id: 1, lane: 2, number: 13 }), tankAt(0.7, { id: 2, lane: 2, number: 7 })],
      { a: 8, op: '+', b: 5, answer: 13, targetId: 1 },
    );
    expect(flyToEnd(selectTank(shared, 1)).state.tanks.map((tank) => tank.id)).toEqual([2]);
  });

  it('flies a miss drone the full board width and off the far edge, destroying nothing', () => {
    const board = twoTanks(0.3);
    const { state, steps } = flyToEnd(selectTank(board, 2));
    expect(steps * DT).toBeCloseTo(config.droneTraverseSeconds, 10);
    expect(state.tanks.map((tank) => tank.id)).toEqual([1, 2]);
    expect(state.problem).toEqual(board.problem);
  });

  it('lets the next problem be generated for another tank once the target is destroyed', () => {
    const { state } = flyToEnd(selectTank(twoTanks(0.5), 1));
    const next = problemOf(ensureProblem(state, createRng(9), config));
    expect(next.targetId).toBe(2);
    expect(next.answer).toBe(7);
  });

  it('does not mutate the state it is given while a drone is in flight', () => {
    const launched = selectTank(twoTanks(0.4), 1);
    const before = clone(launched);
    step(launched, DT, config);
    expect(launched).toEqual(before);
  });
});

describe('step — the drone resolves before the tanks move (DESIGN.md §6)', () => {
  const targetAt = (x: number): GameState =>
    boardOf([tankAt(x, { id: 1, lane: 1, number: 13 })], {
      a: 8,
      op: '+',
      b: 5,
      answer: 13,
      targetId: 1,
    });

  it('destroys a target one step from the wall instead of losing it to the breach', () => {
    // At this dt the tank crosses 1/1200 of a lane per step and the drone 1/24 — so a tank this
    // close breaches within the same step the drone is first moved. Moving the drone first is
    // what makes §6's "interception always happens before the breach" true of the code.
    const after = step(selectTank(targetAt(1 - TANK_STEP), 1), DT, config);
    expect(after.drone).toBeNull();
    expect(after.tanks).toEqual([]);
  });

  it('never lets a hit drone outlive its target, from any launch position', () => {
    for (let launchX = 0; launchX < 1; launchX += 0.005) {
      const label = `launched against a tank at x ${launchX.toFixed(3)}`;
      let current = selectTank(targetAt(launchX), 1);
      for (let i = 0; i < 200 && current.drone !== null; i += 1) {
        current = step(current, DT, config);
        const { drone } = current;
        if (drone === null || drone.kind !== 'hit') continue;
        expect(
          current.tanks.some((tank) => tank.id === drone.targetId),
          `${label}: the drone outlived its target`,
        ).toBe(true);
      }
      expect(current.drone, `${label}: the drone never resolved`).toBeNull();
      expect(current.tanks, `${label}: the target survived`).toEqual([]);
    }
  });
});

/**
 * A scripted run: the same tap decisions at the same step indices, taken from the board rather
 * than from the rng — the rng stream has to stay exactly the one `main.ts` shares between
 * spawning and problem generation, or this proves nothing about what ships. At most one tap per
 * fixed step, applied before `step`, as `main.ts` drains its queue.
 *
 * The player answers every `TAP_EVERY_STEPS` and gets every fourth answer wrong. Wrong answers
 * are counted in *answers*, not in step indices: a fixed `i % n` checkpoint drifts in and out of
 * phase with the spawn interval, and a checkpoint that lands on a board holding only the target
 * silently taps nothing at all.
 *
 * At a 5 s answer time against a 2.5 s spawn interval, tanks arrive faster than they are cleared,
 * so the board crowds and the oldest tanks start breaching the wall — which is the state the
 * invariants below are worth checking in. PLAN already predicts this queue growth at the
 * placeholder config.
 */
function playWithTaps(
  seconds: number,
  seed: number,
): { frames: GameState[]; hits: number; misses: number } {
  const rng = createRng(seed);
  let current = createGameState(config, rng);
  const frames: GameState[] = [];
  let hits = 0;
  let misses = 0;

  let answers = 0;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    const { problem } = current;
    if (problem !== null && current.drone === null && i % TAP_EVERY_STEPS === 0) {
      answers += 1;
      const wrong = answers % WRONG_EVERY_NTH_ANSWER === 0;
      const tapped = current.tanks.find((tank) =>
        wrong ? tank.id !== problem.targetId : tank.id === problem.targetId,
      );
      if (tapped !== undefined) current = selectTank(current, tapped.id);
    }

    const launched = current.drone;
    current = ensureProblem(step(current, DT, config), rng, config);
    if (launched !== null && current.drone === null) {
      if (launched.kind === 'hit') hits += 1;
      else misses += 1;
    }
    frames.push(current);
  }

  return { frames, hits, misses };
}

describe('a played run with taps', () => {
  const { frames, hits, misses } = playWithTaps(120, 55);

  it('lands hits and misses — the scripted run is not vacuous', () => {
    expect(hits).toBeGreaterThan(5);
    expect(misses).toBeGreaterThan(1);
  });

  it('crowds the board — the invariants below are not checked against a single tank', () => {
    expect(Math.max(...frames.map((frame) => frame.tanks.length))).toBeGreaterThan(3);
  });

  it('replays identically from the same seed and the same taps', () => {
    expect(playWithTaps(120, 55).frames).toEqual(frames);
  });

  it('never points the problem at a tank a drone has destroyed', () => {
    for (const frame of frames) {
      const { problem } = frame;
      if (problem === null) continue;
      expect(frame.tanks.some((tank) => tank.id === problem.targetId)).toBe(true);
    }
  });

  it('still has exactly one tank carrying the live answer after impacts', () => {
    for (const frame of frames) {
      const { problem } = frame;
      if (problem === null) continue;
      expect(frame.tanks.filter((tank) => tank.number === problem.answer)).toHaveLength(1);
    }
  });
});
