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
      // no-restricted-imports only inspects static import/export declarations, so a dynamic
      // import() walks straight past it — and past tsconfig.core.json too, whenever the module
      // it pulls in happens to be DOM-free. Only a literal specifier can be caught here.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/(^|\\/)(render|app)(\\/|$)/]',
          message: CORE_IS_PURE,
        },
      ],
    },
  },

  {
    files: ['src/render/**/*.{ts,tsx,mts,cts}', 'src/app/**/*.{ts,tsx,mts,cts}'],
    languageOptions: { globals: globals.browser },
  },
);
