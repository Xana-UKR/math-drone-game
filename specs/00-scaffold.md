# Increment 0 — Scaffold

Stand up the toolchain and the mechanical guards. No game behaviour.

## In scope

- **Project**: Vite + TypeScript (`strict`) + Vitest. `index.html` and a placeholder
  `src/app/main.ts` that mounts a "increment 0" marker, so `npm run dev` visibly serves.
- **Layout**: `src/core/`, `src/render/`, `src/app/`, `src/assets/`, `test/core/`.
  `src/core/placeholder.ts` exists only so the core TypeScript project has inputs — increment 1
  deletes it.
- **Scripts**: `npm run dev`, `npm test`, and `npm run check` = typecheck + lint + tests.
- **Core-boundary enforcement**, three layers:
  1. `tsconfig.core.json` — compiles `src/core/**` with **no `DOM` lib**, so `document`, `window`
     and friends are type errors. Run by `check` alongside the main typecheck.
  2. ESLint override on `src/core/**` — `no-restricted-globals` for browser globals,
     `no-restricted-imports` for `render/` and `app/`.
  3. Project-wide ESLint ban on `Math.random` (CLAUDE.md hard rule; the seeded RNG arrives in
     increment 1).
- **`test/core/boundary.test.ts`** — lints probe sources through the ESLint API and asserts each
  violation is actually reported, so the guard cannot silently stop matching `src/core/**`. Also
  asserts the core suite runs with no `document`/`window` in scope.
- **Pre-commit hook** (`.githooks/pre-commit` + `core.hooksPath` set by `npm install`) running
  `npm run check`. `.gitattributes` pins LF so the hook survives checkout on Windows.

## Out of scope

- Any game type, constant or `Config` object — `core/types.ts` belongs to increment 1.
- Any rendering: lanes, tanks, SVG, CSS beyond what makes the page not look broken.
- The seeded RNG itself, the game loop, jsdom, CI, Howler, PWA.
- Type-aware ESLint rules (non-type-checked `recommended` only), and `Date.now` restrictions.

## Done when

`npm run dev` serves the page; `npm run check` passes; a deliberate `document` reference added to a
file in `src/core/` makes `npm run check` fail (verified once by hand, and permanently by
`boundary.test.ts`).
