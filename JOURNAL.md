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

**The first guards were all fail-open, and `/code-review` found it.** Every layer built in this
increment was checked by running it, and six holes were real. Fixed in the follow-up commit, each
re-verified by breaking it:

| Hole | Was | Now |
|---|---|---|
| dynamic `import()` | `no-restricted-imports` inspects only static declarations, so `await import('../render/x')` walked past all three layers | `no-restricted-syntax` on `ImportExpression` (literal specifiers only — a computed one is still uncatchable) |
| inline `eslint-disable` | one comment defeated the `Math.random` ban, which has no typecheck layer behind it | `linterOptions.noInlineConfig` on the core block; the attempt now also warns that it had no effect |
| co-located tests | a `.test.ts` under `src/` was silently skipped — vitest exited 0 without naming it | `src/**/*.test.ts` added to `test.include`, so it runs and fails |
| warnings | `eslint .` exits 0 on warnings, so the gate ignored them | `--max-warnings 0` |
| globs | `**/*.ts` matches neither `.mts` nor `.tsx`, so those files got no rules at all | `**/*.{ts,tsx,mts,cts,js,mjs,cjs}` |
| the guard test | probed 2 of the 20 banned globals, so 18 could be deleted with the suite green | reads the banned list out of the *effective* config via `calculateConfigForFile` and probes every entry — adding a global now puts it under test automatically |

**The lesson is the one `WORKFLOW.md` predicted**, and it is worth more than the fixes: every one of
these was a guard that passed its own happy path. Writing the rule proves nothing. The only thing
that proved anything was deliberately breaking each one — and four of the six survived a scaffold
built specifically to be careful about exactly this.

**Still open, deliberately.** The pre-commit hook runs `npm run check` over the **working tree, not
the index**, so `git add -p` plus an unstaged fix can land a red commit green; the `git stash
--keep-index` wrapper that would fix it can lose work when the check fails, which is worse. And
`npm run check` never runs `vite build`, so a broken `index.html` or an unresolvable asset import
passes the gate — `npm run dev` is still an author-side check, not a mechanical one.

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
