import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Browser globals that must never appear in src/core/. This list is the readable half of the
 * guard; tsconfig.core.json is the exhaustive half (core compiles without the DOM lib at all).
 */
const BROWSER_GLOBALS = [
  'document',
  'window',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'fetch',
  'alert',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance',
  'HTMLElement',
  'SVGElement',
  'CustomEvent',
  'Image',
  'Audio',
];

const CORE_IS_PURE =
  'src/core/ is pure TypeScript: no DOM, no imports from render/ or app/. See CLAUDE.md.';

const CORE_HAS_NO_CLOCK =
  'Time is injected as dt; a clock in core silently destroys same-seed reproducibility.';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    // All randomness goes through the injected seeded RNG — the headless simulation
    // (DESIGN.md §14) depends on same-seed-same-output.
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the injected seeded RNG. Math.random() breaks reproducible runs.',
        },
      ],
    },
  },

  {
    files: ['src/core/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    // Inline `eslint-disable` is ignored inside core. The boundary is not negotiable per call
    // site, and the Math.random ban in particular has no typecheck layer standing behind it.
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-restricted-globals': [
        'error',
        ...BROWSER_GLOBALS.map((name) => ({ name, message: CORE_IS_PURE })),
        // Not a browser global, so it is listed here rather than in BROWSER_GLOBALS. Banning the
        // binding itself is what covers the forms the property and syntax rules below miss:
        // `Date()` called plainly, `const D = Date`, and a bare `Date` reference.
        { name: 'Date', message: CORE_HAS_NO_CLOCK },
        // The escape hatch past both guards at once: `globalThis.Date` and `globalThis.document`
        // are member accesses, so neither the banned-name list nor the syntax selectors see them.
        { name: 'globalThis', message: CORE_IS_PURE },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render', '**/render/**', '**/app', '**/app/**'],
              message: CORE_IS_PURE,
            },
          ],
        },
      ],
      // A rule redefined in a later config object replaces rather than merges with an earlier
      // one, so this override must restate the project-wide Math.random ban alongside the
      // Date.now ban, or the former silently stops applying inside src/core/**.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the injected seeded RNG. Math.random() breaks reproducible runs.',
        },
        {
          object: 'Date',
          property: 'now',
          message: CORE_HAS_NO_CLOCK,
        },
      ],
      // no-restricted-imports only inspects static import/export declarations, so a dynamic
      // import() walks straight past it — and past tsconfig.core.json too, whenever the module
      // it pulls in happens to be DOM-free. Only a literal specifier can be caught here.
      // `Date` is plain JavaScript, not DOM, so it also needs a syntax-level catch: it survives
      // both the DOM-free tsconfig.core.json and the browser-globals list above.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/(^|\\/)(render|app)(\\/|$)/]',
          message: CORE_IS_PURE,
        },
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: CORE_HAS_NO_CLOCK,
        },
      ],
    },
  },

  {
    files: ['src/render/**/*.{ts,tsx,mts,cts}', 'src/app/**/*.{ts,tsx,mts,cts}'],
    languageOptions: { globals: globals.browser },
  },
);
