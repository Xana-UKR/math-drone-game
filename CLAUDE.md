# Math Drone Defense

A browser math game: the player defends a base by directing a kamikaze drone at the tank showing the
correct answer. Target player is a 7-year-old.

**`DESIGN.md` is the specification of record.** If code and DESIGN.md disagree, DESIGN.md is right —
raise it, don't silently diverge.
**`PLAN.md` holds the increment ladder.** Read the current increment's row before starting work.
`WORKFLOW.md` explains why these rules exist; read it only if a rule seems wrong.
`JOURNAL.md` holds findings with no other home — **do not read it by default**, only when asked why
something is the way it is.

## Commands

*(created in increment 0)*

| | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | unit tests |
| `npm run check` | typecheck + lint + tests — **the definition of done** |

## Hard rules

- **`src/core/` is pure TypeScript.** No DOM, no `window`, no `document`, no imports from `render/`
  or `app/`. Enforced by ESLint and by a core test suite running in the `node` environment.
- **All randomness goes through the injected seeded RNG.** Never `Math.random()` — the headless
  simulation (DESIGN.md §14) depends on reproducibility.
- **Core owns anything that changes the outcome of a run; render owns anything decorative.**
  The test for a borderline case: *if I deleted this, would the outcome of a run change?*
  Yes → core. No → render.
- **Gameplay motion is moved by the game loop, never by CSS.** CSS transitions and the Web Animations
  API run on the browser's clock: they don't pause when the game pauses and don't scale with the
  fixed timestep. Decorative effects (flashes, shake, score pops) may use them.
- **Never modify a test to make it pass.** If a test looks wrong, stop and say so.

## The increment loop

One increment = one session = one commit = a diff scannable in a few minutes.

**The loop has two hard stops. At each one, present the work, stop, and wait for the author's
reply. Do not continue past a stop, and do not create or modify any other file, until they answer.**

1. **Spec** — write `specs/NN-name.md` (~15 lines, including an explicit **out-of-scope** block).
   → **STOP. Present the spec and wait.** Expect to revise it — the discussion is the point of this
   step, and a wrong spec is cheapest to fix here. Nothing else may be created until it is approved.
2. **Tests** — from the *approved* spec, before implementation. For visual increments, instead state
   what the author will *look at* to judge it done.
   → **STOP. Present the test names and wait.** The author reviews the names, not the bodies; a
   vague name means a vague test.
3. **Implementation** — until `npm run check` passes. Delegate to the `implementer` subagent once
   the spec and tests exist.
4. **Verification** — the author runs `npm run check`, checks `git diff --stat` against the files the
   spec named, plays it if visual, and runs `/code-review`.
5. **Commit + record.** One commit naming the increment and its spec file. Then:
   - update **`PLAN.md`'s status line** to the next increment — it is the handoff to the next session;
   - write any finding that contradicts or completes `DESIGN.md` / `PLAN.md` **into that document**,
     rather than noting elsewhere that it is wrong;
   - append anything else worth keeping to **`JOURNAL.md`** (short — it is not read by default);
   - give the author the report below.

**Never touch files the increment's spec didn't name.** If the work seems to require it, stop and say
so.

## Ask before acting when

- the spec is ambiguous and two readings would produce materially different code;
- the work seems to require touching files the spec didn't name;
- a design decision is needed that DESIGN.md doesn't cover;
- something in DESIGN.md looks wrong, contradictory, or unimplementable.

Do **not** ask permission to do work already specified, or confirm routine judgment calls (naming,
file layout, obvious helper extraction). State safe assumptions inline and continue.

**The two stops in the loop are not covered by that.** They are required halts, not requests for
permission, and they apply even when the next step is obvious and the spec looks finished — work is
"already specified" only *after* the author has approved the spec.

## Report at the end of every increment

```
## Increment N — <name>

**Done:** what now works that didn't before.
**Decisions:** judgment calls made, and why.
**Not done:** what was deliberately left out of scope, and where it went in the ladder.
**Concerns:** anything that looks wrong in DESIGN.md, or worth flagging for later.
**Your next steps:** exactly what the author should do now — what to play, what to review,
what to decide.
```

## Models

The session runs on Opus. Implementation is delegated to the `implementer` subagent (Sonnet), which
starts cold and is briefed by the spec and the tests.

**`/code-review` runs on Opus only.** If asked to review while on a smaller model, say so and stop —
a review that misses things is worse than no review, because it manufactures confidence.
