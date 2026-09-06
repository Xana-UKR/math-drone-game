# Journal

Findings that belong in no other document. Newest first.

**Not read by default.** A session reads `CLAUDE.md`, `PLAN.md`'s status line, and the current
increment's row. This file is opened when someone asks *why is it like this?* — keep it short so it
stays cheap to consult.

**What goes here:** play-session observations, measurements, things that surprised us, approaches
tried and abandoned (the diff shows what was kept, never what was rejected).

**What does not:** what was built (git history), what was intended (`specs/NN-name.md`), where we are
(`PLAN.md`). And anything that contradicts or completes `DESIGN.md` or `PLAN.md` is **edited into
that document** instead — the spec stays authoritative rather than accumulating a trail of
corrections.

---

## Increment 0 — scaffold (2026-09-06)

**The guards ship with known holes.** `/code-review` found, and verified by execution, that
increment 0's core-boundary enforcement fails open in four ways. None was fixed — the scaffold was
committed as reviewed — so they are live:

| Hole | Effect |
|---|---|
| `no-restricted-imports` ignores dynamic `import()` | a DOM-free `render/` module can be pulled into core past all three layers |
| no `noInlineConfig` | one `// eslint-disable-next-line` defeats the `Math.random` ban, which has no tsconfig layer behind it |
| `test.include` is `test/**` only | a `.test.ts` co-located under `src/` is silently skipped; vitest exits 0 without naming it |
| `eslint .` without `--max-warnings 0` | warnings never fail `npm run check` — including the unused-disable-directive warning that would reveal the hole above |

Also: the globs are `**/*.ts`, so `.mts`/`.tsx` get no rules at all; `boundary.test.ts` probes only
2 of the 20 banned globals; and `npm run check` never runs `vite build`, so `index.html` breakage
passes the gate.

**The pre-commit hook checks the working tree, not the index.** So `git add -p` plus an unstaged fix
can land a red commit green. A real gap, not something the hook's own comment supports.

**`npm run check` can fail with a message that names no cause.** During review it died four times in
a row with `TypeError: Cannot read properties of undefined (reading 'config')` and "(0 test)",
including on a file whose entire body was `expect(1 + 1).toBe(2)`. It self-healed once
`node_modules/.vite` regenerated and never reproduced. **Recovery: delete `node_modules/.vite`.**

**Two Windows-specific things bit during the scaffold.** `tsc` refuses a project with no input
files, which is the only reason `src/core/placeholder.ts` exists; and Git for Windows would check
the shell hook out as CRLF and break it, which is why `.gitattributes` pins LF.

**Versions are all at a current major** — ESLint 10, TypeScript 6, Vite 8, Vitest 5. Most examples
online target the previous majors, so suspect version skew before suspecting the code.

---
