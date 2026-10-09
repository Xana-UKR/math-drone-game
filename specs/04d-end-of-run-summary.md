# Increment 4d — End-of-run summary

Decided by the author in 4b's play session (PLAN.md): the win/lose screen shows tanks destroyed,
wrong answers ("missed", in the author's meaning), and every wrongly answered problem, e.g.
"8 + 7 = 15 — you chose 14". Memory only. Core records the wrong answers: a first slice of
increment 8's outcome log.

## In scope

- **`src/core/types.ts`**
  - New `WrongAnswer = { problem: Problem; chosen: number }`. `problem` is the plain `Problem`
    with no `targetId`, and `chosen` is the tapped tank's number.
  - `GameState.wrongAnswers: WrongAnswer[]`, in the order they were tapped.
- **`src/core/step.ts`**
  - `createGameState` starts it as `[]`.
  - `selectTank` appends one entry **when it launches a `miss` drone**. That is the tap where the
    wrong answer is committed (DESIGN §16: wrong answers don't wait for impact). A refused tap
    records nothing: no live problem, drone in flight, run over, unknown tank, or empty pool.
    A hit records nothing. Draws no rng. Stays pure.
  - Every wrong tap is its own entry. The problem stays live after a miss, so one problem
    answered wrongly twice appears twice, once per choice. If the same wrong tank is tapped twice,
    the identical entry also appears twice.
- **`src/render/scene.ts`**: the end overlay gets a title line: "You won!", or "Out of hearts"
  on a loss (new, because a loss shows no title today). Below it, the overlay adds "Tanks destroyed: {correct}", "Wrong answers: {wrongAnswers.length}", then one line per
  entry ("8 + 7 = 15 — you chose 14"), or "No wrong answers!" when the list is empty. The worst
  case is 13 entries (every shot wrong), so all of them must fit at 1600×900. Two columns are
  allowed. Nothing is cut off. "Tap to play again" stays.
- **Tests:** a new `test/core/summary.test.ts`.

## Fixture change to existing files (needs your approval)

The GameState literals in `drone`, `hearts`, `refill`, `step` and `wave` tests each gain
`wrongAnswers: []`. That is the only change to them, and no assertion changes.

## Out of scope

- Saving to storage, or bringing missed facts back next game. That needs §15 and a DESIGN
  decision.
- The rest of increment 8's log: which distractor was chosen, elapsed time, and correct answers.
- Breach count, hearts lost and time played on the summary.
- `main.ts` (no change expected) and any styling beyond legible text.

## Done when

`npm run check` passes. In a real browser, after answering a few wrong and then winning or losing,
the overlay lists every wrong tap with the problem, the right answer and the number chosen, and
both counts match what happened.
