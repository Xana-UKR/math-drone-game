import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* Node, not jsdom: a core module that reaches for the DOM fails its own tests.
       A jsdom project arrives with the first render test that needs one. */
    environment: 'node',
    /* src/ is included so a test file co-located there runs and fails loudly, rather than
       being silently skipped while vitest still reports success. */
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
