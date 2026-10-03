import { createRng } from '../core/rng';
import { createGameState, ensureProblem, selectTank, step } from '../core/step';
import type { GameState } from '../core/types';
import { defaultConfig } from '../core/types';
import { createScene } from '../render/scene';

/** Constant so runs are reproducible (DESIGN.md §14); increment 9's harness will vary it. */
const SEED = 20260915;

const FIXED_DT = 1 / 60;
/** A backgrounded tab must not spiral into hundreds of catch-up steps on return. */
const MAX_FRAME_SECONDS = 0.25;

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) throw new Error('#app not found');

const config = defaultConfig;

// Kept so `ensureProblem` below can keep drawing from the same stream `createGameState` started.
const rng = createRng(SEED);
let state: GameState = createGameState(config, rng);

// Filled by the scene's click listeners, drained at most one per fixed step, inside the loop
// below and before `step` — the same reason `ensureProblem` sits there: increment 9 replays a run
// as a pure function of the seed plus the inputs at each step index, which a tap applied once per
// rAF frame (rather than once per simulated step) would not reproduce.
const tapQueue: number[] = [];
const scene = createScene(config, (tankId) => {
  // Dropped rather than queued while a drone is in flight. DESIGN.md §4 generates the next problem
  // on impact, so a tap taken now and drained later would answer a problem that no longer exists —
  // a guaranteed wrong answer the player never aimed at anything, and from increment 4b a drone
  // spent on it. A child double-tapping is the ordinary case, not the exotic one.
  if (state.drone !== null) return;
  tapQueue.push(tankId);
});
app.appendChild(scene.svg);

let accumulator = 0;
let lastTime: number | null = null;

function frame(now: number): void {
  // Schedule the next frame first: one bad frame (a thrown assertion, increment 6) must not
  // permanently freeze the loop. The error still propagates to the console.
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
    // Inside the fixed-timestep loop, not once per rAF frame: that would tie rng consumption to
    // the browser's frame rate and destroy same-seed reproducibility.
    state = ensureProblem(state, rng, config);
    accumulator -= FIXED_DT;
  }

  scene.sync(state);
}

requestAnimationFrame(frame);
