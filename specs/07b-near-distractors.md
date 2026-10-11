# Increment 7b — `near` distractor level

DESIGN §9's third level. **Built ahead of 9 at the author's call, 2026-10-11:** she answers fast and
correctly, so `traps` is already too easy. `traps` can only choose *which problem* to ask, so it
cannot put an off-by-one or off-by-two on the board. `near` does that by choosing **which numbers
the wave holds and the order they enter in**.

**No `GameState` change, unlike PLAN's row.** The row assumed numbers drawn at entry, which means
rng in `step` and a reserve of unused numbers in state (variant B below). Two rng-free changes get
close to it.

## Simulation (session scratchpad: 300 seeds, correct answers every 5 s)

| Level | ±1 on the board | ±1 or ±2 on the board | Problem-dependent trap |
|---|---|---|---|
| `traps` (today) | 23% | 41% | 77% |
| `near`, one cluster per wave (first draft) | 54% | 74% (82% with 2+ other tanks) | 78% |
| B: numbers chosen at entry from the whole range | 65% | 78% | 80% |

"On the board" means on a tank other than the target, at the moment the problem appears. At 3 s
answers the first draft's figure is the same (73%); at 8 s it is 84%.

**Revised with the author after code review, 2026-10-11.** One cluster per wave narrows a run's
answers to a band of about 14 numbers, whatever the range (spans measured over 1,000 seeds). At
0–100 that is a quarter of the range. Starting a new cluster every few numbers restores the spread:

| Cluster size | 0–20: ±1/2 on board | 0–20: wave span | 0–100: ±1/2 on board | 0–100: wave span |
|---|---|---|---|---|
| `traps` | 41% | 19 | 9% | 89 |
| 13 (one cluster, first draft) | 74% | 13 | 72% | 14 |
| 6 | 70% | 17 | 62% | 55 |
| **4 (shipped)** | **67%** | **18** | **58%** | **68** |
| 3 | 65% | 18 | 54% | 73 |

Wave span is the median gap between the wave's smallest and largest number. 4 is one board's worth
of tanks at 4 lanes.

## In scope

- **`Config.mistakeAnswers: 'off' | 'traps' | 'near'`**. The shipped value stays `'traps'`; the
  author switches with `?mistakes=near`.
- **`Config.nearClusterSize`**, shipped as 4. Only `near` reads it.
- **"Neighbour" follows `mistakeKinds`.** A gap of 1 counts if `offByOne` is active, and a gap of
  2 if `offByTwo` is. With neither active, `near` behaves exactly as `traps`.
- **`src/core/problem.ts`:** `generateProblem` treats `'near'` as `'traps'`.
- **`src/core/step.ts`, `createGameState` (clustered draw):** under `'near'`, the wave is drawn in
  clusters of `nearClusterSize`.
  - The first number of each cluster (its draw index is divisible by the size) is drawn from all
    allowed numbers.
  - Every other number is drawn from the allowed numbers that neighbour a number already drawn
    **in the same cluster**. If none does, it is drawn from all allowed numbers.
  - A size of 1 draws exactly as `traps`.
  - Under `'near'`, a size that is not a whole number of at least 1 throws, naming the dial
    (approved by the author at implementation; no test).
  - Still one `rng.int` per number, and the numbers stay distinct (§9). The opening board takes the
    first numbers drawn, as it does today.
- **`src/core/step.ts`, `step` (entry pick):** under `'near'`, an entering tank takes the pending
  number with the highest neighbour score on the board it joins. A ±1 neighbour scores 2 and a ±2
  neighbour scores 1. Ties go to the earliest number in `pending`; with a score of 0 everywhere it
  takes `pending[0]`, as today. **No rng in `step`.** The governor is unaffected because
  clearability depends on position, not number.
- **`src/app/main.ts`:** `?mistakes=near` is accepted in dev builds.
- **Tests:** a new `test/core/near.test.ts`. Under `'off'` and `'traps'`, the same seed produces
  the same wave and the same entries as today. I expect no existing test to change; if one does, I
  stop and ask.
  - **Changed by the revision:** tests 1 and 2 check neighbours within a cluster, not across the
    whole wave. Test 17's threshold drops from 65% to 60% (67% measured).
  - **New:** a size of 1 draws exactly as `traps`; a size of 13 makes the whole wave one chain; at
    0–100, the median wave spans more than 40 numbers.

## Out of scope

- Variant B (needs a `GameState` field and rng in `step`). Revisit only if 67% proves too low in
  play.
- Making `near` the shipped default, or any preset or settings UI (10+). The 0–100 preset tunes
  `nearClusterSize` when it is built.
- Steering *which tank is the target* toward one with a neighbour on the board. That is §5's
  urgency pick, and fairness owns it.
- Logging changes: 8 already records the run's level.
- Code-review findings 1 and 7 (scoring against a tank whose drone is in flight; a number with no
  neighbours waits to the wave's end), left as they are with the author. They go to `JOURNAL.md`.

## Done when

- `npm run check` passes.
- In a real browser with `?mistakes=near`, the board usually shows close numbers (`11, 12, 14`
  rather than `3, 12, 19`), and successive runs still cover most of 0–20. `?mistakes=traps` and
  `?mistakes=off` play exactly as before.

## At the record step

- **DESIGN §9:** the `near` row describes the clustered draw and the entry pick, not "numbers
  drawn at entry", with the measured ~67% and the cluster-size trade-off above.
- **PLAN:** the status line goes back to 9; record that 7b was built ahead of 9 on the author's
  play observation; update the "Distractors" row and the `Config` field list.
