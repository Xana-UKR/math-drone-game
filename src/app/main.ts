import { unclearableEntries } from '../core/fairness';
import { createRng } from '../core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../core/step';
import type { GameState } from '../core/types';
import { defaultConfig } from '../core/types';
import { createScene } from '../render/scene';
import type { Scene } from '../render/scene';

const FIXED_DT = 1 / 60;
/** A backgrounded tab must not spiral into hundreds of catch-up steps on return. */
const MAX_FRAME_SECONDS = 0.25;

const appSlot = document.querySelector<HTMLDivElement>('#app');
if (appSlot === null) throw new Error('#app not found');
// Reassigned to its own narrowed type so later closures (`startRun`, defined once but called on
// every restart) see `HTMLDivElement`, not the nullable type `querySelector` returns.
const app: HTMLDivElement = appSlot;

const config = defaultConfig;

// Filled by the scene's click listeners, drained at most one per fixed step, inside the loop
// below and before `step` — the same reason `ensureProblem` sits there: increment 9 replays a run
// as a pure function of the seed plus the inputs at each step index, which a tap applied once per
// rAF frame (rather than once per simulated step) would not reproduce.
const tapQueue: number[] = [];

let state: GameState;
let rng: ReturnType<typeof createRng>;
let scene: Scene;
let accumulator = 0;
let lastTime: number | null = null;
/** Dev-build §6 assertion: tanks with an id from here on have not been checked yet. */
let checkedFromId = 1;

/**
 * DESIGN.md §6's fairness assertion (increment 6), dev builds only: reports each tank at or past
 * `checkedFromId` that no perfect player could clear. Non-fatal — a `console.error`, never a
 * throw, so the loop keeps running. With the governor it can only fire for a tank the rules force
 * in, which needs `tAnswerSeconds` near the traverse time.
 */
function checkFairness(): void {
  if (!import.meta.env.DEV) return;
  for (const tank of unclearableEntries(state, checkedFromId, config)) {
    console.error(
      `DESIGN §6 fairness assertion failed: tank #${tank.id} (number ${tank.number}, ` +
        `lane ${tank.lane}, x ${tank.x}) entered unclearable at tAnswerSeconds ` +
        `${config.tAnswerSeconds}`,
    );
  }
  checkedFromId = state.nextId;
}

/**
 * Seeds, creates the state and builds a fresh scene — called once at load and again on every
 * restart. The app seeds each run (core never creates its own, DESIGN.md §14); increment 9's
 * harness injects one instead. `crypto.getRandomValues`, not `Math.random` (ESLint-banned
 * everywhere, but this is also just the better source), logged via `console.info` so a run worth
 * replaying can be, from the seed alone.
 *
 * Builds a new scene rather than reusing the old one: `scene.sync` keys its tank `<g>` nodes by
 * id, and a fresh run's ids restart at 1 — reusing the scene would hand the new tank 1 the dead
 * tank 1's node and its stale number.
 */
function startRun(): void {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error('crypto.getRandomValues produced no seed');
  console.info(`Math Drone Defense: seed ${seed}`);

  rng = createRng(seed);
  state = createGameState(config, rng);
  tapQueue.length = 0;
  accumulator = 0;
  checkedFromId = 1;
  checkFairness();

  if (scene !== undefined) scene.svg.remove();
  scene = createScene(
    config,
    (tankId) => {
      // Dropped rather than queued while a drone is in flight, or once the run is no longer
      // playing. DESIGN.md §4 generates the next problem on impact, so a tap taken now and drained
      // later would answer a problem that no longer exists — a guaranteed wrong answer the player
      // never aimed at anything, and from increment 4b a drone spent on it. A child double-tapping
      // is the ordinary case, not the exotic one.
      if (state.outcome !== 'playing' || state.drone !== null) return;
      tapQueue.push(tankId);
    },
    () => {
      if (state.outcome !== 'playing') startRun();
    },
  );
  app.appendChild(scene.svg);
}

startRun();

function frame(now: number): void {
  // Schedule the next frame first: one bad frame (any thrown error) must not permanently
  // freeze the loop. The error still propagates to the console. Increment 6's §6 assertion is not
  // one: it only logs.
  requestAnimationFrame(frame);

  if (lastTime === null) lastTime = now;
  const frameSeconds = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = now;
  accumulator += frameSeconds;

  while (accumulator >= FIXED_DT) {
    const tankId = tapQueue.shift();
    if (tankId !== undefined) {
      state = selectTank(state, tankId);
      // The guard above cannot catch taps that arrived in the same frame as this one, before any
      // of them had been acted on. Once one has launched, the rest were aimed at the problem it
      // just answered, so they are discarded for the same reason.
      if (state.drone !== null) tapQueue.length = 0;
    }

    state = step(state, FIXED_DT, config);
    checkFairness();
    // Inside the fixed-timestep loop, not once per rAF frame: that would tie rng consumption to
    // the browser's frame rate and destroy same-seed reproducibility.
    state = ensureProblem(state, rng, config);
    accumulator -= FIXED_DT;
  }

  scene.sync(state);
}

requestAnimationFrame(frame);
