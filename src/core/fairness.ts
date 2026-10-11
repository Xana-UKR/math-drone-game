import type { Config, GameState, LiveProblem, Tank } from './types';

/**
 * The id of the tank being answered right now — `problem`'s target, provided it is still among
 * `tanks` — else null. The one definition the governor (`step`) and the dev-build assertion
 * (`unclearableEntries`) share, so they can never disagree about who is ahead in line.
 */
export function liveTarget(problem: LiveProblem | null, tanks: readonly Tank[]): number | null {
  if (problem === null) return null;
  return tanks.some((tank) => tank.id === problem.targetId) ? problem.targetId : null;
}

/**
 * DESIGN.md §6's fairness promise (increment 6): a player who answers every problem correctly
 * within `t_answer` never loses a tank. One derivation, three users — the picker
 * (`targeting.ts`), the spawn governor and the opening board (`step.ts`), and the dev-build
 * assertion (`main.ts`).
 */

/**
 * A tank is savable when its time left, `(1 − x) × laneTraverseSeconds`, is strictly more than
 * `tAnswerSeconds` — §6's own `d > v_tank × t_answer`. Past that line even an instant answer to it
 * comes too late.
 */
export function isSavable(tank: Tank, config: Config): boolean {
  return (1 - tank.x) * config.laneTraverseSeconds > config.tAnswerSeconds;
}

/**
 * A tank is clearable when answering the board most-urgent first reaches it in time. Its place in
 * line `k` is 1 + the *other* tanks at least as close to the wall (ties count as ahead) that will
 * still be answered: the savable ones, plus the live target (`liveTargetId`) wherever it is, since
 * it is being answered even after crossing the unsavable line. Its turn then comes at
 * `k × t_answer + (k − 1) × droneTraverseSeconds` — the flight taken at its worst case, the full
 * traverse — and it is clearable when its time left is strictly more than that. For `k = 1` this is
 * exactly `isSavable`. `tanks` may or may not contain `tank` itself; it is skipped by id.
 */
export function isClearable(
  tank: Tank,
  tanks: readonly Tank[],
  liveTargetId: number | null,
  config: Config,
): boolean {
  let place = 1;
  for (const other of tanks) {
    if (other.id === tank.id) continue;
    // The live target is being answered now, so it is ahead in line wherever it is on the board.
    if (other.id === liveTargetId) place += 1;
    else if (other.x >= tank.x && isSavable(other, config)) place += 1;
  }

  const timeLeft = (1 - tank.x) * config.laneTraverseSeconds;
  return (
    timeLeft > place * config.tAnswerSeconds + (place - 1) * config.droneTraverseSeconds
  );
}

/**
 * The tanks on `state.tanks` with `id >= sinceId` that are not clearable on that board — what the
 * dev-build §6 assertion reports. The live target is `state.problem`'s when that tank is on the
 * board, else none. With the governor in place a tank can only show up here when the rules force it
 * in: the first tank onto an empty board, or the front opening tank, whatever `t_answer` is.
 */
export function unclearableEntries(state: GameState, sinceId: number, config: Config): Tank[] {
  const liveTargetId = liveTarget(state.problem, state.tanks);
  return state.tanks.filter(
    (tank) => tank.id >= sinceId && !isClearable(tank, state.tanks, liveTargetId, config),
  );
}
