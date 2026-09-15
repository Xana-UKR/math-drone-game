import { createRng } from '../core/rng';
import { createGameState, step } from '../core/step';
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
const scene = createScene(config);
app.appendChild(scene.svg);

let state: GameState = createGameState(config, createRng(SEED));

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
    state = step(state, FIXED_DT, config);
    accumulator -= FIXED_DT;
  }

  scene.sync(state);
}

requestAnimationFrame(frame);
