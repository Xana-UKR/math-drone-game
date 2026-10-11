import { describe, expect, it } from 'vitest';

import { createRng } from '../../src/core/rng';
import { createGameState, selectTank, step } from '../../src/core/step';
import type { Config, GameState, LiveProblem, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 4d (specs/04d-end-of-run-summary.md). Core records every wrong answer at the tap that
 * commits it — the `miss` launch, DESIGN.md §16 — so the end-of-run screen can read them back.
 * Nothing else records: a hit, or any tap `selectTank` refuses.
 */

/** Every field pinned, so retuning `defaultConfig` cannot quietly change what these tests mean. */
const config: Config = {
  ...defaultConfig,
  lanes: 4,
  laneTraverseSeconds: 34,
  openingStagger: 0.05,
  waveSize: 13,
  resupplyEvery: 4,
  droneTraverseSeconds: 0.4,
  hearts: 3,
};

const DT = 1 / 60;

const PROBLEM: LiveProblem = { a: 8, op: '+', b: 7, answer: 15, targetId: 1 };

/** Tank 1 carries the answer 15; tanks 2 and 3 carry distractors 14 and 12. */
function board(overrides: Partial<GameState> = {}): GameState {
  const tanks: Tank[] = [
    { id: 1, lane: 0, x: 0.2, number: 15 },
    { id: 2, lane: 1, x: 0.3, number: 14 },
    { id: 3, lane: 2, x: 0.4, number: 12 },
  ];
  return {
    time: 0,
    tanks,
    pending: [],
    nextId: 4,
    problem: PROBLEM,
    drone: null,
    hearts: config.hearts,
    drones: config.waveSize,
    correct: 0,
    outcome: 'playing',
    wrongAnswers: [],
    log: [],
    ...overrides,
  };
}

/** Steps until the drone is gone. */
function land(state: GameState, limit = 200): GameState {
  let current = state;
  for (let i = 0; i < limit; i += 1) {
    current = step(current, DT, config);
    if (current.drone === null) return current;
  }
  throw new Error(`drone still in flight after ${limit} steps`);
}

describe('createGameState — wrong answers', () => {
  it('starts a run with no wrong answers recorded', () => {
    expect(createGameState(config, createRng(1)).wrongAnswers).toEqual([]);
  });
});

describe('selectTank — recording a wrong answer', () => {
  it('records the problem and the tapped tank number when a wrong tap launches a miss drone', () => {
    expect(selectTank(board(), 2).wrongAnswers).toEqual([
      { problem: { a: 8, op: '+', b: 7, answer: 15 }, chosen: 14 },
    ]);
  });

  it('records the plain problem without the target tank id', () => {
    const [entry] = selectTank(board(), 2).wrongAnswers;
    expect(entry?.problem).not.toHaveProperty('targetId');
  });

  it('records nothing for a correct tap', () => {
    expect(selectTank(board(), 1).wrongAnswers).toEqual([]);
  });

  it('records nothing for a correct tap, through to impact', () => {
    expect(land(selectTank(board(), 1)).wrongAnswers).toEqual([]);
  });

  it('records nothing for a tap refused while a drone is in flight', () => {
    const inFlight = selectTank(board(), 1);
    expect(selectTank(inFlight, 2).wrongAnswers).toEqual([]);
  });

  it('records nothing for a tap refused with no live problem', () => {
    expect(selectTank(board({ problem: null }), 2).wrongAnswers).toEqual([]);
  });

  it('records nothing for a tap refused on a tank not on the board', () => {
    expect(selectTank(board(), 99).wrongAnswers).toEqual([]);
  });

  it('records nothing for a tap refused with the drone pool empty', () => {
    expect(selectTank(board({ drones: 0 }), 2).wrongAnswers).toEqual([]);
  });

  it('records nothing for a tap refused once the run is lost', () => {
    expect(selectTank(board({ outcome: 'lost' }), 2).wrongAnswers).toEqual([]);
  });

  it('records nothing for a tap refused once the run is won', () => {
    expect(selectTank(board({ outcome: 'won' }), 2).wrongAnswers).toEqual([]);
  });

  it('does not mutate the state it was given, nor its wrong-answer list', () => {
    const before = board();
    const snapshot = JSON.parse(JSON.stringify(before)) as GameState;
    const listBefore = before.wrongAnswers;
    selectTank(before, 2);
    expect(before).toEqual(snapshot);
    expect(listBefore).toEqual([]);
  });
});

describe('selectTank — several wrong answers', () => {
  it('records the same problem once per wrong choice, in tap order', () => {
    const afterFirst = land(selectTank(board(), 2));
    const afterSecond = selectTank(afterFirst, 3);
    expect(afterSecond.wrongAnswers.map((entry) => entry.chosen)).toEqual([14, 12]);
    expect(afterSecond.wrongAnswers.every((entry) => entry.problem.answer === 15)).toBe(true);
  });

  it('records the same wrong tank tapped twice as two identical entries', () => {
    const twice = selectTank(land(selectTank(board(), 2)), 2);
    expect(twice.wrongAnswers).toEqual([
      { problem: { a: 8, op: '+', b: 7, answer: 15 }, chosen: 14 },
      { problem: { a: 8, op: '+', b: 7, answer: 15 }, chosen: 14 },
    ]);
  });

  it('keeps earlier entries when a later tap is correct', () => {
    const afterHit = land(selectTank(land(selectTank(board(), 2)), 1));
    expect(afterHit.wrongAnswers).toHaveLength(1);
  });
});

describe('step — wrong answers survive the run', () => {
  it('keeps every recorded wrong answer on the frozen state once the run ends', () => {
    const recorded = land(selectTank(board({ hearts: 1 }), 2));
    // Let every tank breach: with one heart the run is lost and the board freezes.
    let state = recorded;
    for (let i = 0; i < 60 * 40 && state.outcome === 'playing'; i += 1) {
      state = step(state, DT, config);
    }
    expect(state.outcome).toBe('lost');
    expect(state.wrongAnswers).toEqual(recorded.wrongAnswers);
  });
});
