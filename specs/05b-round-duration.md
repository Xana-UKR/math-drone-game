# Increment 5b — Round duration on the end screen

Asked for by the author after 5: the win/lose overlay shows how long the round took. Render only:
core already has the number. `state.time` is game time, it freezes when the run ends (`step`
returns a finished state unchanged), and it excludes background-tab time because `main.ts` caps each
frame at `MAX_FRAME_SECONDS`.

## In scope

- **`src/render/scene.ts`**
  - A new overlay line, **"Time: N seconds"** (e.g. `Time: 65 seconds`), from `state.time`,
    with whole seconds rounded down (seconds only, decided by the author). It reads "1 second" when
    N is 1. It sits directly under "Wrong answers", in the same style as the two counts. It is set
    on the `playing` → ended edge like the other lines, not per frame.
  - The list and anything below it may move down to make room. At 1600×900, nothing overlaps or
    is cut off, even in the worst case of 13 wrong answers (two columns of 7 and 6).
- **Tests:** none. This is a visual increment, and the formatter is a one-liner in render. What
  you look at is under "Done when".

## Out of scope

- The average answer time, which was dropped by the author. Per-problem timing stays in increment
  8's outcome log.
- Any change to `src/core/` or `main.ts`, or a wall-clock or pause-aware timer that differs from
  game time.
- Showing the time during play.

## Done when

`npm run check` passes. In a real browser (not VS Code's preview):

- a run timed roughly with a phone shows a matching `Time:` on both the win and the lose screen;
- a run with many wrong answers still fits;
- a restart shows the new run's time, not the old one's.
