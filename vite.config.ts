import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* Node, not jsdom: a core module that reaches for the DOM fails its own tests.
       A jsdom project arrives with the first render test that needs one. */
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
