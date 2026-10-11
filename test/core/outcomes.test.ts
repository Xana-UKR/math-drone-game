import { describe, expect, it } from 'vitest';

import { runLog } from '../../src/core/outcomes';
import { createRng } from '../../src/core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../../src/core/step';
import type { Config, GameState, LiveProblem, ProblemRecord, Tank } from '../../src/core/types';
import { defaultConfig } from '../../src/core/types';

/**
 * Increment 8 (specs/08-outcome-logging.md). DESIGN.md §14: every problem shown gets a record in
 * `GameState.log` — opened by `ensureProblem`, its taps added by `selectTank`, closed by `step` —
 * and `runLog` wraps a finished run's records with the facts needed to read them later.
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
  tAnswerSeconds: 5,
  mistakeAnswers: 'traps',
  mistakeKinds: ['offByOne', 'forgottenCarry'],
};

const DT = 1 / 60;

const PLAIN = { a: 8, op: '+', b: 7, answer: 15 } as const;
const PROBLEM: LiveProblem = { ...PLAIN, targetId: 1 };

function openRecord(overrides: Partial<ProblemRecord> = {}): ProblemRecord {
  return { problem: { ...PLAIN }, shownAt: 1, taps: [], result: 'open', ...overrides };
}

/**
 * Tank 1 carries the answer 15; tanks 2 and 3 carry distractors 14 and 12. The problem is live
 * and its record open, shown at t = 1; the clock stands at t = 3.5.
 */
function board(overrides: Partial<GameState> = {}): GameState {
  const tanks: Tank[] = [
    { id: 1, lane: 0, x: 0.2, number: 15 },
    { id: 2, lane: 1, x: 0.3, number: 14 },
    { id: 3, lane: 2, x: 0.4, number: 12 },
  ];
  return {
    time: 3.5,
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
    log: [openRecord()],
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

/** Steps until `done` holds or the run ends. */
function stepUntil(state: GameState, done: (s: GameState) => boolean, limit = 60 * 60): GameState {
  let current = state;
  for (let i = 0; i < limit && !done(current) && current.outcome === 'playing'; i += 1) {
    current = step(current, DT, config);
  }
  return current;
}

/**
 * A whole seeded run, in `main.ts`'s order per fixed step: tap, `step`, `ensureProblem`. The
 * player answers 5 s after each problem appears, and every fourth answer taps a wrong tank.
 */
function playRun(seed: number): GameState {
  const rng = createRng(seed);
  let state = ensureProblem(createGameState(config, rng), rng, config);
  let answers = 0;
  let waited = 0;
  for (let i = 0; i < 60 * 300 && state.outcome === 'playing'; i += 1) {
    const { problem } = state;
    if (problem !== null && state.drone === null) {
      waited += 1;
      if (waited >= Math.round(5 / DT)) {
        answers += 1;
        const wrong = state.tanks.find((tank) => tank.id !== problem.targetId);
        const tankId = answers % 4 === 0 && wrong !== undefined ? wrong.id : problem.targetId;
        state = selectTank(state, tankId);
        waited = 0;
      }
    }
    state = step(state, DT, config);
    state = ensureProblem(state, rng, config);
  }
  return state;
}

describe('createGameState — the log', () => {
  it('starts a run with an empty log', () => {
    expect(createGameState(config, createRng(1)).log).toEqual([]);
  });
});

describe('ensureProblem — opening a record', () => {
  it('appends an open record holding the plain problem, without the target tank id', () => {
    const rng = createRng(7);
    const state = ensureProblem(createGameState(config, rng), rng, config);
    const { problem } = state;
    if (problem === null) throw new Error('expected a live problem');
    const { a, op, b, answer } = problem;
    expect(state.log).toEqual([
      { problem: { a, op, b, answer }, shownAt: 0, taps: [], result: 'open' },
    ]);
  });

  it('stamps the record with the game time the problem was shown at', () => {
    const rng = createRng(7);
    const state = ensureProblem({ ...createGameState(config, rng), time: 12.25 }, rng, config);
    expect(state.log[0]?.shownAt).toBe(12.25);
  });

  it('appends nothing when a problem is already live', () => {
    const state = board();
    expect(ensureProblem(state, createRng(1), config).log).toBe(state.log);
  });

  it('appends nothing when the board is empty', () => {
    const empty = board({ tanks: [], problem: null, log: [] });
    expect(ensureProblem(empty, createRng(1), config).log).toEqual([]);
  });

  it('appends nothing once the run is over', () => {
    const over = board({ problem: null, log: [], outcome: 'lost' });
    expect(ensureProblem(over, createRng(1), config).log).toEqual([]);
  });

  it('appends a new record after earlier closed ones, keeping them unchanged', () => {
    const closed = openRecord({ result: 'correct', taps: [{ chosen: 15, seconds: 2 }] });
    const state = ensureProblem(board({ problem: null, log: [closed] }), createRng(3), config);
    expect(state.log).toHaveLength(2);
    expect(state.log[0]).toEqual(closed);
    expect(state.log[1]?.result).toBe('open');
  });
});

describe('selectTank — logging taps', () => {
  it('adds a correct tap to the open record, timed from when the problem was shown', () => {
    expect(selectTank(board(), 1).log).toEqual([
      openRecord({ taps: [{ chosen: 15, seconds: 2.5 }] }),
    ]);
  });

  it('adds a wrong tap with the tapped tank number', () => {
    expect(selectTank(board(), 2).log).toEqual([
      openRecord({ taps: [{ chosen: 14, seconds: 2.5 }] }),
    ]);
  });

  it('adds every tap on one problem in tap order, wrong then correct', () => {
    const afterWrong = land(selectTank(board(), 2));
    const afterRight = selectTank(afterWrong, 1);
    expect(afterRight.log[0]?.taps.map((tap) => tap.chosen)).toEqual([14, 15]);
  });

  it('times a later tap from when the problem was shown, not from the previous tap', () => {
    const afterWrong = land(selectTank(board(), 2));
    const [, second] = selectTank(afterWrong, 1).log[0]?.taps ?? [];
    expect(second?.seconds).toBeCloseTo(afterWrong.time - 1, 9);
  });

  it('logs nothing for a tap refused while a drone is in flight', () => {
    const inFlight = selectTank(board(), 1);
    expect(selectTank(inFlight, 2).log).toBe(inFlight.log);
  });

  it('logs nothing for a tap refused on a tank not on the board', () => {
    const state = board();
    expect(selectTank(state, 99).log).toBe(state.log);
  });

  it('logs nothing for a tap refused with the drone pool empty', () => {
    const state = board({ drones: 0 });
    expect(selectTank(state, 2).log).toBe(state.log);
  });

  it('logs nothing for a tap refused once the run is over', () => {
    const state = board({ outcome: 'lost' });
    expect(selectTank(state, 2).log).toBe(state.log);
  });

  it('logs nothing for a launched tap when no record is open (a hand-built state)', () => {
    expect(selectTank(board({ log: [] }), 2).log).toEqual([]);
  });

  it('does not mutate the state it was given, nor its log or records', () => {
    const before = board();
    const snapshot = JSON.parse(JSON.stringify(before)) as GameState;
    selectTank(before, 2);
    expect(before).toEqual(snapshot);
  });
});

describe('step — closing a record', () => {
  it('leaves the record open while the drone is in flight', () => {
    const launched = selectTank(board(), 1);
    expect(step(launched, DT, config).log[0]?.result).toBe('open');
  });

  it("closes the record as correct on its drone's impact", () => {
    expect(land(selectTank(board(), 1)).log[0]?.result).toBe('correct');
  });

  it('leaves the record open after a wrong drone leaves the board', () => {
    expect(land(selectTank(board(), 2)).log[0]?.result).toBe('open');
  });

  it('closes the record as breached when its tank reaches the wall', () => {
    const state = board({
      tanks: [
        { id: 1, lane: 0, x: 0.999, number: 15 },
        { id: 2, lane: 1, x: 0.3, number: 14 },
      ],
    });
    const after = stepUntil(state, (s) => s.problem === null);
    expect(after.outcome).toBe('playing');
    expect(after.log[0]?.result).toBe('breached');
  });

  it('closes the record as breached after a wrong tap, keeping the tap', () => {
    const state = board({
      tanks: [
        { id: 1, lane: 0, x: 0.97, number: 15 },
        { id: 2, lane: 1, x: 0.3, number: 14 },
      ],
    });
    const after = stepUntil(selectTank(state, 2), (s) => s.problem === null);
    expect(after.log[0]).toEqual(openRecord({ taps: [{ chosen: 14, seconds: 2.5 }], result: 'breached' }));
  });

  it('closes a live record as runEnded when another tank takes the last heart', () => {
    const state = board({
      hearts: 1,
      tanks: [
        { id: 1, lane: 0, x: 0.2, number: 15 },
        { id: 2, lane: 1, x: 0.999, number: 14 },
      ],
    });
    const after = stepUntil(state, () => false);
    expect(after.outcome).toBe('lost');
    expect(after.log[0]?.result).toBe('runEnded');
  });

  it('closes the record as breached, not runEnded, when its own tank takes the last heart', () => {
    const state = board({
      hearts: 1,
      tanks: [
        { id: 1, lane: 0, x: 0.999, number: 15 },
        { id: 2, lane: 1, x: 0.3, number: 14 },
      ],
    });
    const after = stepUntil(state, () => false);
    expect(after.outcome).toBe('lost');
    expect(after.log[0]?.result).toBe('breached');
  });

  it('leaves no open record when the run is won', () => {
    const lastTank = board({ tanks: [{ id: 1, lane: 0, x: 0.2, number: 15 }] });
    const after = land(selectTank(lastTank, 1));
    expect(after.outcome).toBe('won');
    expect(after.log).toEqual([openRecord({ taps: [{ chosen: 15, seconds: 2.5 }], result: 'correct' })]);
  });

  it('leaves earlier closed records untouched', () => {
    const closed = openRecord({ result: 'breached', shownAt: 0 });
    const after = land(selectTank(board({ log: [closed, openRecord()] }), 1));
    expect(after.log[0]).toEqual(closed);
  });

  it('changes nothing in the log when no record is open (a hand-built state)', () => {
    const launched = selectTank(board({ log: [] }), 1);
    expect(land(launched).log).toEqual([]);
  });
});

describe('runLog — the whole run', () => {
  const finished = board({
    outcome: 'lost',
    time: 42.5,
    log: [openRecord({ result: 'correct' }), openRecord({ shownAt: 9, result: 'runEnded' })],
  });

  it('carries the seed, the mistake level and the active mistake kinds', () => {
    const log = runLog(finished, config, 1234);
    expect(log.seed).toBe(1234);
    expect(log.mistakeAnswers).toBe('traps');
    expect(log.mistakeKinds).toEqual(['offByOne', 'forgottenCarry']);
  });

  it("carries the run's outcome and its length in game seconds", () => {
    const log = runLog(finished, config, 1234);
    expect(log.outcome).toBe('lost');
    expect(log.seconds).toBe(42.5);
  });

  it("lists the run's problem records in the order they were shown", () => {
    expect(runLog(finished, config, 1234).problems).toEqual(finished.log);
  });

  it('serialises to JSON and back unchanged', () => {
    const log = runLog(finished, config, 1234);
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  });
});

describe('a whole seeded run', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('ends with every record closed', () => {
    for (const seed of seeds) {
      const state = playRun(seed);
      expect(state.outcome).not.toBe('playing');
      expect(state.log.filter((record) => record.result === 'open')).toEqual([]);
    }
  });

  it('logs one correct record per correct answer landed', () => {
    for (const seed of seeds) {
      const state = playRun(seed);
      expect(state.log.filter((record) => record.result === 'correct')).toHaveLength(state.correct);
    }
  });

  it('logs the same wrong taps as wrongAnswers, in the same order', () => {
    for (const seed of seeds) {
      const state = playRun(seed);
      const wrongTaps = state.log.flatMap((record) =>
        record.taps
          .filter((tap) => tap.chosen !== record.problem.answer)
          .map((tap) => ({ problem: record.problem, chosen: tap.chosen })),
      );
      expect(wrongTaps).toEqual(state.wrongAnswers);
    }
  });

  it('times every tap at or after the moment its problem was shown', () => {
    for (const seed of seeds) {
      for (const record of playRun(seed).log) {
        for (const tap of record.taps) expect(tap.seconds).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('produces the same log for the same seed', () => {
    expect(playRun(4).log).toEqual(playRun(4).log);
  });
});
