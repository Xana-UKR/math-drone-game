# Workflow — how we work with the agent, and why

Background for the author. The agent doesn't need this file; the operative rules are in `CLAUDE.md`
and the ladder is in `PLAN.md`. This is here so settled questions aren't re-argued in three months.

A stated goal of this project (DESIGN.md §19) is learning to direct an AI coding agent, not just
receiving a finished game. These are the decisions that goal produced.

---

## The governing principle

> **Prefer mechanical enforcement over agent instruction.** An instruction is a probability; a lint
> rule is a guarantee.

The same instinct that reaches for `static_assert` over a comment. It has two halves:

- **Mechanical enforcement** — constraints that are *checked*, not trusted: the ESLint core-boundary
  rule, the node-environment core test suite, `strict` tsconfig, the §6 invariant assertion,
  same-seed-same-output tests.
- **Mechanical execution** — steps that *run* rather than being remembered: `npm run check`, a
  pre-commit hook that blocks a failing commit.

Rule of thumb: **if the author would ever have to *remember* to do it, make it a script or a hook. If
the agent would ever have to *choose* to respect it, make it a lint rule or a test.**

---

## Why the author reviews steps 1, 2 and 4 — not step 3

The author is an experienced C++ developer with no TypeScript. Reviewing implementations would be
slow and low-yield. Reviewing the spec and the **test names** is neither.

`rejects a problem whose answer matches a second tank` is readable English and is the actual
contract. A missing test is invisible in the implementation and expensive later; a vague test name
means a vague test — say so.

In C++ terms: review the header and the unit tests, and trust the `.cpp` because the tests hold it.

**The author's per-increment checklist:**

1. Own the spec's **out-of-scope** block. It's the difference between "add distractor strategies" and
   "add distractor strategies, and also multiplication, because it seemed helpful."
2. Read the test names.
3. `git diff --stat` — did this touch only what the spec named? Is a test file in the diff that
   shouldn't be?
4. `/code-review` before committing. Beyond the bugs, watching *what it catches* is how you learn
   where the agent is unreliable — information available no other way.
5. Review `core/types.ts` like a header file. Wrong types mean wrong code, and that's judgeable on
   day one.
6. Ask for a C++-terms explanation of any file. That's a legitimate use of the session.

---

## Model selection

> **Match the model to the verification signal, not to the difficulty.** A strongly verified task
> tolerates a cheaper model, because errors get caught mechanically. A task with no verification
> signal needs the strongest model, because errors survive.

Implementation against existing failing tests is strongly verified — they pass or they don't.
Reviewing a diff is verified by nothing, which is why review stays on Opus: a cheap reviewer that
misses things is worse than no reviewer, because it manufactures confidence.

### Why we delegate instead of switching models mid-session

Caches are **model-scoped** and a model switch has no escape hatch — the new model re-reads the whole
conversation as fresh input. Pricing per MTok: Opus 5 $5 in / $25 out; Sonnet 5 $2 / $10;
Haiku 4.5 $1 / $5. Cache reads cost ~0.1× base input; cache writes 1.25× (5-min TTL) or 2× (1-hour).

For a ~50K-token session and ~30 implementation requests generating ~50K output:

| | Switch to Sonnet in-session | Stay on Opus |
|---|---|---|
| First read after switch (write, 2×) | $0.20 | — |
| ~30 reads | $0.30 | $0.75 |
| Output | $0.50 | $1.25 |
| Switch back (re-read new turns) | ~$0.30 | — |
| **Total** | **~$1.30** | **~$2.00** |

A third saved — far less than the 2.5× headline ratio, because the double cache miss eats most of it,
and the saving is almost entirely in *output* tokens.

**A subagent avoids the miss entirely.** It starts cold with ~10K tokens of brief and files instead
of 50K of conversation, runs on Sonnet, and never disturbs the Opus session's cache. So in-session
`/model` switching is the worst option — the ceremony of delegation without the benefit.

---

## Why exactly one subagent

> A subagent earns a definition file when the task **recurs**, is **self-contained enough to brief
> cold**, and has a **mechanical definition of done**. Fail any of the three and it's cheaper
> in-session.

| Candidate | Recurs | Briefable cold | Mechanical done | |
|---|---|---|---|---|
| Implementation against tests | every increment | yes — the tests *are* the brief | `npm run check` | ✅ |
| Scaffolding | once | yes | no | ❌ |
| Writing tests | every increment | no — needs the spec discussion, and the author reviews them | no | ❌ |
| Spec drafting | every increment | no — it *is* the conversation | no | ❌ |

**The tests-first discipline is what makes delegation possible at all.** A subagent handed "implement
problem generation" would guess; one handed "make `test/problems.test.ts` pass without modifying it"
has an unambiguous target and a mechanical definition of done.

### Why scaffolding is *not* Haiku work, despite feeling mechanical

By the heuristic above, a `tsconfig.json` has no verification signal — no test goes red if it's
wrong. The scaffold is also exactly where the mechanical guards live: if the ESLint boundary rule is
subtly written so it never matches `src/core/**`, nothing fails, and you discover six increments
later that core has been importing the DOM the whole time. Low-verification, high-consequence work
wearing mechanical clothing. Do it in-session, on Opus, and verify it by **deliberately breaking it**
— put `document` in a core file and confirm the build fails.

Haiku is for high-volume, repetitive, strongly-verified work — bulk transformations across hundreds
of files. This project tops out at a few thousand lines; that shape never arrives. If a genuinely
mechanical bulk chore ever appears, a one-off delegation can name the model inline — no definition
file, no maintenance.

**A menagerie of agents has a real cost:** each brief duplicates rules that also live in `CLAUDE.md`,
and duplicated rules drift. Three agents means three places to update and two that will be stale
within a month.

---

## Rejected — do not re-litigate

| Rejected | Why |
|---|---|
| **An orchestrator** | Orchestration earns its keep on parallel independent work; this ladder is strictly sequential. And the author *is* the orchestrator — automating that removes the exact skill DESIGN.md §19 exists to build. |
| **Skills written up front** | Skills are **extracted, not designed**. Write one when you notice yourself typing the same instructions a third time — probably `new-increment` after a few increments. You don't know the right template until you've written the concrete thing several times. |
| **A custom code-review agent** | The project-specific rules (core purity, no `Math.random`, scope creep) are better as lint rules and `git diff --stat`. Revisit only if a *judgment-level* problem recurs that lint cannot express. |
| **In-session `/model` switching** | See the table above — pays the cache miss without avoiding it. |
| **A Haiku subagent** | No task on this project passes the three-part test. |
| **Duplicating rules across documents** | One home per fact. `CLAUDE.md` points at `DESIGN.md` and `PLAN.md` rather than copying them, for the same reason. |

---

## Failure modes to watch for

- **Quiet scope drift** — the increment that helpfully does three things. Guard: the out-of-scope
  block, and `git diff --stat` before accepting.
- **A failing test made to pass by weakening the test.** Guard: `CLAUDE.md` and the `implementer`
  brief both forbid modifying tests; a test file appearing in the diff is a five-second check.
- **Subagents pushing through ambiguity** rather than stopping, even when told to stop. Guard:
  explicit stop conditions in the brief, and verify the diff rather than trusting the report.
- **A runaway implement-test loop** burning the budget without converging. No frontmatter field caps
  a subagent's iterations, so this is instruction-level: the brief uses a progress rule (same failure
  twice → stop) plus a hard ceiling of five `npm run check` runs. The real control is increment size
  — a long flail is a symptom of a spec too vague or an increment too big to have been one increment.
  When the implementer stops, read *why* before re-dispatching; a second identical attempt is the
  most expensive possible response.
- **Drift toward a hand-rolled game engine** — building a general system one helper at a time. Guard:
  build the specific thing the game needs; if a helper grows options nothing uses, stop.
