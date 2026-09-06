/* Increment 0 placeholder: proves the dev server, the module graph and the TypeScript
   pipeline are wired. Increment 1 replaces this with the fixed-timestep loop. */
const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) throw new Error('#app not found');
app.textContent = 'Math Drone Defense — increment 0: scaffold';
