import type { Config, GameState, ProblemRecord } from './types';

/**
 * A finished run, ready to print (increment 8, DESIGN.md §14). `mistakeKinds` is stored so an old
 * log stays readable after the active kinds are narrowed; the distractor kind of a tap is not —
 * `mistakesFor` computes it later.
 */
export interface RunLog {
  seed: number;
  mistakeAnswers: Config['mistakeAnswers'];
  mistakeKinds: Config['mistakeKinds'];
  outcome: GameState['outcome'];
  /** The run's length in game seconds. */
  seconds: number;
  problems: ProblemRecord[];
}

/** Wraps a run's `log` with what is needed to read it later. Pure; the app prints it. */
export function runLog(state: GameState, config: Config, seed: number): RunLog {
  return {
    seed,
    mistakeAnswers: config.mistakeAnswers,
    mistakeKinds: config.mistakeKinds,
    outcome: state.outcome,
    seconds: state.time,
    problems: state.log,
  };
}
