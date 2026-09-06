# Math Drone Defense — Design Specification

**Status:** Design complete. Stack chosen (§17). No code written.

**How to use this document:** Start a new session with this file. It contains every decision made
so far, the reasoning behind the non-obvious ones, what was explicitly rejected (so it doesn't get
re-litigated), and what is still open. It is sufficient to either continue planning or begin
implementation.

---

## 1. Concept

A browser-based educational math game. The player defends a base from tanks by directing an
FPV kamikaze drone at the tank whose number is the correct answer to a displayed math problem.

Top-down view. The base is a vertical wall along the right edge of the screen. Tanks drive from
left to right along parallel lanes toward the wall. The current math problem is displayed on the
base. The player selects the tank showing the correct answer; a drone launches from the wall and
destroys it.

---

## 2. Target player

**Primary:** the author's 7-year-old daughter. This sets the defaults, not just one preset among many.

At 7, the relevant math is addition and subtraction within 20 (stretching to 100), and the
beginnings of the 2s, 5s and 10s times tables. Division is effectively not yet taught.

Consequences that are already baked into the design below:

- The **default preset is addition/subtraction within 20** — not all four operations.
- **Tapping is the default input.** Typing at 7 is slow enough to dominate answer time and would
  make the game about thumbs rather than math.
- **Runs are short (60–90 seconds) with instant restart.** No menu between attempts. The single
  biggest determinant of whether a 7-year-old plays a second round is how fast they can get back in.
- **Explosion quality matters more than pedagogical cleverness** at this age. She will play for
  the explosion. Budget real effort for it.

The wider supported range is roughly ages 5–12; full four-operation play with larger numbers is
for who she'll be at 10.

---

## 3. Layout and geometry

```
      ██>    ██>              ██>     │
   ██>            ██>                 │
        ██>   ██>       ██>           │  BASE WALL
  ██>                                 │  ┌────────┐
      ██>          ██>                │  │ 7 × 8 =│
   ██>       ██>                      │  └────────┘
```

- **Top-down camera.** Matches what FPV drone footage actually looks like, so the viewpoint is
  diegetic rather than arbitrary.
- **Base is a vertical line spanning the full right edge.** Every lane terminates on it.
- **3–6 horizontal lanes.** Lane count varies with screen size and difficulty (3 on a phone, up to
  6 on tablet/desktop). Lanes solve tank occlusion and make threat ordering readable at a glance.
- **Tanks spawn off-screen left and drive right.** They never change lanes.
- **Orientation is landscape.** Portrait is not supported for v1.

**Because the base is a straight wall, urgency is literally the tank's x coordinate.** The scale is
identical in every lane, directly comparable, and readable by a child with no mental math: further
right = more dangerous.

---

## 4. Core loop
 At start a user has definite number hearts and definite number of drones.
1. A problem is displayed on the base console (e.g. `7 × 8 = ?`).
2. Exactly one tank on screen carries the correct answer as its number. All other tanks carry
   distractors.
3. The player taps that tank (or, in recall mode, types the number). Retargeting is forbidden.
4. **Correct:** a drone launches from the wall *in that tank's lane*, flies straight down the lane,
  and destroys the tank on impact. The drone is a kamikadze drone - it does not return back. 
  Number of drones decreases by 1. Score increases. A new problem is generated.
5. **Wrong:** a drone is launched from the top right corner and flies diagonally and dissapperas 
  at the left bottom corner 
  side of screen. One drone lost. Score remains the same. Problem stay the same.
6. A tank reaching the wall costs one heart and is destroyed on impact.
7. The run ends at zero hearts (loss) or when the wave is exhausted with hearts remaining (win). See §7.

### Drone flight

- **Launches from the wall in the target's own lane.** Flight is purely horizontal — a head-on dive
  down the lane, which is also the best-looking shot available.
- **No retargeting.** Once launched, the drone commits. This keeps the flight model a simple
  straight line (no velocity/turn-rate physics needed) and makes the fairness guarantee in §6
  absolute.
- **One drone in flight at a time.** The next problem appears on impact.
- Flight should be **short** — it is a reward animation, not a decision window.

## 5. Target selection (the urgency rule)

This is the mechanism that keeps the game solvable. It is borrowed from falling-block math shooters
and is **entirely geometry-independent** — it operates on a single scalar per tank.

Each tank has an urgency `u ∈ [0,1]`: `0` at spawn, `1` at the wall.

When a new problem is needed:

```
u_max = highest urgency currently on the board

u_max < 0.5    →  candidate pool = all tanks              (relaxed: any tank may be the answer)
0.5 ≤ u < 0.8  →  candidate pool = the 2–3 most urgent    (alert: narrowing)
u_max ≥ 0.8    →  candidate pool = tanks above 0.8 only   (critical: usually exactly one)

pick a target from the pool, weighted toward higher urgency
build a problem whose answer is that tank's existing number
```

Result: when everything has time, any tank can be the answer; when things get tight, the game is
forced to offer the tank that is about to kill you. The "not always the closest" nuance falls out
of the weighted pick and the pool size.

**Threshold values (0.5 / 0.8) are placeholders.** The critical threshold in particular must be
derived from §6, not chosen by feel.

### Edge cases

- If a tank breaches the wall and it was the current answer, the problem must re-roll immediately.
- A tank must never be added to the candidate pool while a problem is live. **The answer never
  changes under the player's finger.**

---

## 6. The fairness invariant

Because the drone launches from the wall in the target's own lane, the geometry collapses to one
result.

Let a tank be at distance `d` from the wall, moving at `v_tank`, with the player taking `t_answer`
seconds to decide.

After the player decides, the gap between drone and tank closes at `v_drone + v_tank` — strictly
faster than the tank closes on the wall. **So interception always happens before the breach, for any
drone speed whatsoever.** The only failure mode is the tank arriving while the player is still
thinking. The entire condition is:

```
d  >  v_tank × t_answer
```

Three things follow:

1. **The critical urgency threshold is not a feel number.** It sits exactly at
   `v_tank × t_answer`. Anything closer to the wall than that is already unsavable and must never
   be offered as the answer.
2. **Drone speed is a drama dial, not a fairness dial.** A slower drone doesn't make tanks
   unsavable — it just means the explosion happens closer to the wall. Tune it purely for feel;
   late saves look terrifying and are still guaranteed.
3. `t_answer` per age tier is the one number the whole system depends on. It should be **measured
   from real play**, not guessed. See §14 (simulation) and §16 (open questions).

### Spawn governor

With 3–6 lanes, multiple tanks can approach critical simultaneously in different lanes and one of
them becomes unsavable no matter how well the child plays. A fixed spawn timer will produce these
situations by accident and they will feel like the game cheated.

**Spawn rate must be a function of live board state, not a constant:**

> Never spawn a tank if doing so would put more tanks into the danger band than the player can
> physically clear — where "can clear" is derived from `t_answer` plus drone flight time.

This is the highest-leverage fairness mechanism in the design, and it is pure logic — fully
testable without rendering anything.

---

## 7. Resources and loss conditions

| Resource | Behaviour |
|---|---|
| **Hearts** | Start at 3. A tank reaching the wall costs one heart and is destroyed on impact. |
| **Drones** | Finite pool. Every answer costs one. Regenerates slowly — one per N correct answers ("resupply"). |

### Run structure: a finite, winnable wave

A run is a **finite wave of N tanks**. The drone pool starts at N, and every answer — right or
wrong — costs one drone. Resupply grants +1 drone per M correct answers.

This makes the error budget explicit and self-tuning: winning requires N correct answers, which
earn `floor(N/M)` resupply drones, so a run tolerates exactly **`floor(N/M)` wrong answers**. At
N = 12, M = 3 that is four mistakes. N and M are the difficulty dial for the resource economy.

**Win:** the wave is exhausted — every tank resolved, whether destroyed by a drone or destroyed
breaching the wall — **and hearts remain**.

**Loss:** hearts reach zero.

**Simultaneous resolution: the loss is checked first.** If the last tank's impact both empties the
wave and takes the final heart, the run is a loss. Without this precedence the outcome is undefined,
because a breaching tank is destroyed on impact and therefore also advances the win condition.

A consequence, accepted deliberately: because breached tanks count as resolved, a player who runs
dry of drones with a heart to spare can let the last tanks through and still win. That is a scrape,
not a strategy — every breach costs a heart, and with three hearts it buys at most two tanks.

Running out of drones is deliberately *not* a separate game-over rule. It costs hearts rather than
ending the run, and the failure still reads to the player as "I ran out of drones." Note the
justification is *not* that a dry player loses inevitably — in a finite wave the tanks run out
before the hearts do. It is that a dedicated rule would add nothing the heart economy does not
already express.

**Why drones regenerate:** as a fixed pool, drones create a death spiral — wrong answers are most
likely under pressure, which is exactly when losing one hurts most, which increases pressure. A
regenerating pool acts as an anti-guessing rate limiter instead of a doom counter. Wrong answers
still bite, because you may be dry exactly when a tank goes critical.

**Why hearts instead of instant death on breach:** a run that ends 20 seconds in with no recovery
is how you get a child who won't open the game again.

---

## 8. Input modes

Both modes run on the **same engine**. Tanks always own numbers; the target is always the tank whose
number matches the answer. Only rendering and input differ.

| Mode | Tank numbers | Input | Skill |
|---|---|---|---|
| **Recognition** (easy tiers, and the 7-year-old default) | Visible | Tap the correct tank | Multiple choice |
| **Recall** (hard tiers) | Hidden | Read problem on base, type the answer | Free recall |

In recall mode the drone flies to whichever tank *is* that number — the player doesn't know which
tank is about to die until the drone launches, which is genuinely exciting.

**This is the strongest difficulty axis in the game** — far stronger than bigger numbers — and it
maps to how children actually progress: recognition first, recall later.

**Rule for typed input:** a typed number that matches *another tank* launches at that tank, exactly
as if it had been tapped (and is therefore wrong). A number no tank carries is rejected outright.
Since distractors *are* other tanks' numbers, most wrong answers match a tank, so the two modes
behave identically.

---

## 9. Problem generation

**The problem is generated from the tanks, not the tanks from the problem.**

> **A tank owns its number from spawn until death.**

When a new problem is needed, the generator picks a target tank (per §5) and constructs a problem
whose answer is that tank's *existing* number.

The alternative — generate the problem, then assign numbers to tanks — means numbers change under
the player's finger mid-approach. It feels like cheating even when it isn't, and it makes threat
reasoning impossible.

### Generator constraints

- No two tanks on screen may show the same number.
- No other on-screen tank may also be a correct answer to the displayed problem.
- Division must produce whole results; division by zero excluded.
- Subtraction must not produce negatives (except in tiers that explicitly allow it).
- Answers must fit legibly on a tank sprite — effectively a **2–3 digit cap**, which in turn caps
  operand ranges regardless of the difficulty setting.

### Distractors are the educational content

If wrong answers are random numbers, the child doesn't do arithmetic — they compute the answer once
and pattern-match a string. Good distractors encode real mistakes:

- Adjacent times-table fact (`7 × 8` → `63` or `49`)
- Off-by-one / forgotten carry
- Operand confusion (`7 × 8` → `15`)
- Digit reversal (`56` → `65`)

**Distractor strategy scales with difficulty alongside the number ranges.** Near-miss distractors
make the game much harder — choosing between 12, 13 and 14 under time pressure is a very different
experience from choosing between 13, 40 and 82. A 7-year-old should start with well-separated
distractors.

Bonus: distractor choice tells you *which* misconception a child has when they miss. Worth recording
even if nothing consumes it yet (see §14).

---

## 10. Difficulty model

Difficulty is expressed as **per-operation constraints**, surfaced to parents as **named presets by
age**, with an "advanced" expander over the raw knobs.

"Maximum number" alone is not sufficient. Real knobs:

- **Addition/subtraction:** operand ranges; whether carrying/borrowing is allowed (this is the
  actual difficulty cliff, not magnitude — `4+3` and `8+7` are both "under 20" and wildly different
  at age five); whether negative results are allowed.
- **Multiplication:** whether the range constrains *factors* or *products* (enormous difference);
  which times-table subsets are active (children practise "the 6s, 7s and 8s", which no single
  slider can express).
- **Division:** best expressed as the inverse of the multiplication facts already known; whole
  results only.

### The complete difficulty toolkit

Because tanks never shoot back (§11), every cost in the game is denominated in seconds — flight
time, thinking time, the wrong-answer time lost, all measured against tanks advancing at `v_tank`.
That makes difficulty tuning effectively one-dimensional, and this is the whole list of dials:

| Dial | Effect |
|---|---|
| Tank speed | Shrinks the seconds available |
| Spawn rate / governor | How many demands compete for those seconds |
| Lane count | Board width; also screen-size dependent |
| Problem difficulty | Grows `t_answer` |
| Distractor closeness | Grows `t_answer` |
| Recognition → recall | Grows `t_answer` a lot; the big one |
| Drone speed | Drama only — **not** fairness |

---

## 11. Tanks never shoot back

- The drone can only ever be lost by being **wrong**. Nothing random, nothing reflex-based. A parent
  watching can see that every loss was a math mistake.
---

## 12. Practice mode

**Practice mode: tanks advance only while a drone is in flight.**

Thinking is completely free — the child can stare at `7 × 8` for a minute with no pressure — but
every shot still lets the line creep forward. The game keeps its win and loss conditions, still
teaches threat management, and the cost model stays intact.

This is much better than simply freezing the board, which removes all pressure and stops the game
being a game. **This is almost certainly the mode to start a 7-year-old in.**

### Note on timed drill

Worth knowing: timed arithmetic drill is genuinely divisive in math education. It builds fluency,
but it produces anxiety in some children and specifically penalises those who *derive* facts
(`8×7 = 8×8−8`) over those who have memorised them — sometimes punishing better mathematical
thinking. Hence: tank speed is a first-class setting including a very slow tier, and practice mode
exists.

---

## 13. Asset contract

All art is author-supplied and must be swappable without code changes.

### Formats, split by motion type

| Motion | Format | Tool |
|---|---|---|
| Rotors spinning, treads, turret rotation, recoil | **None** — engine transforms named groups inside a static SVG | Vector tool (draw once) |
| Explosion, fire, smoke, muzzle flash | **Sprite sheet** (PNG grid of frames) | Photoshop |

**Mechanical motion is not animated as an asset.** Draw the drone once as an SVG with stable IDs on
the moving parts (`rotor-fl`, `rotor-fr`, …); the engine rotates them. Free, infinitely scalable,
and re-tunable without touching art. This covers most of the motion in the game.

**Effects use sprite sheets.** 8–16 frames exported onto a single PNG in a fixed grid (e.g. 4×4 of
256×256), shipped with a small descriptor giving frame size, frame count, and fps — so the engine
never hardcodes the grid and a 24-frame explosion can be swapped in later without a code change.
Export at 2× target size for high-DPI screens.

**Tooling note:** Photoshop is a raster tool. The drone, tanks, base and background want Illustrator,
Figma, or Inkscape (free). Photoshop's role is effects sprite sheets only.

### Per-asset metadata (the manifest)

"Assets are SVGs in a folder" is not a contract. Each asset needs:

- **Canonical size and coordinate space**, and facing direction.
- **Anchor points** — the drone's impact point, the tank's hit point. Otherwise every new sprite
  means re-tuning the collision code.
- **Text safe zone on the tank.** The number is *game data drawn by the engine*, not part of the
  art. Every tank sprite needs a defined region — position, size, guaranteed contrast — where up to
  three digits render legibly. **This is the single most likely thing to break when swapping art.**
  On a top-down tank this is the hull roof.
- **Animatable element IDs** for anything the engine transforms.

Ship a **dev-only asset page** that renders every asset with its anchors and text zones drawn on
top. Ten minutes of work; makes swapping art a non-event.

---

## 14. Architecture

**Game logic must be fully separated from rendering and testable headlessly.**

| Logic core (no screen) | UI layer |
|---|---|
| Problem generation | Rendering |
| Distractor selection | Input mapping |
| Difficulty constraints | Animation |
| Tank number assignment | Audio |
| Urgency tiers & target selection | Layout / responsive lane count |
| Spawn governor | |
| Scoring, drones, hearts | |
| The §6 fairness invariant, as an assertion | |

### The payoff: simulation

With this split you can run **thousands of games headlessly**. Model a player with a 3-second
answer time and 85% accuracy, run every difficulty preset a thousand times, and measure how long
runs actually last and how often they end in a breach.

That turns difficulty tuning from "playtest and guess" into measurement — and it's how you find out
a preset is accidentally brutal *before* your daughter plays it.

### Record outcomes from day one

Log per-problem results (which problem, which distractor was chosen, how long it took) from the
first version. It costs almost nothing now and is the prerequisite for any future adaptive
difficulty or "she keeps missing 7×8" reporting. Nothing has to consume it yet.

---

## 15. Platform, persistence, privacy

**Delivery model:** one web app, installable on desktop and Android, used in the browser (or added
to the home screen) on iPhone. This is the only way to reach all three without three codebases, and
the compromises are small. Android and desktop get a real install prompt; iPhone install works but
is manual and undiscoverable, so **assume most iPhone users will just use the browser**.

**Offline is a separate feature from installation.** Caching the game's files on device is
deliberate work; once done it works in the browser too, installed or not. Cheap if planned early,
annoying to retrofit — so plan for it from the start.

**Persistence: local only.** Per-kid profiles storing a name, their last-used preset, and their
statistics. All device-local.

- ⚠️ **iOS gotcha:** Safari wipes a website's stored data after ~7 days of not visiting — so stats
  would silently vanish over a school holiday. Adding the app to the home screen exempts it. Worth
  nudging iPhone users toward, and a reason not to promise durable progress on iOS.
- Local data is per-browser, per-device, never syncs, and dies if browsing data is cleared. Fine for
  "my daughter's stats on the family laptop"; not a durable record.
- Mitigation: a "save my stats to a file" button as a manual backup.

**Privacy posture: collect nothing.** No accounts, no analytics, no leaderboards, no cloud sync.
A name typed on the device and stored on the device is not data collection. Anything cloud would
drag in children's-privacy obligations for no real benefit.

**App stores:** nothing here forecloses it. Google Play accepts web apps through a thin wrapper and
is cheap. Apple's store is the expensive path ($99/year, review, and Apple is picky about apps that
are "just a website"). Realistic future: Android store if wanted, iPhone stays web. **No decision
needed now.**

---

## 16. Explicitly rejected (do not re-litigate)

| Rejected | Why |
|---|---|
| Side-view layout (drone patrolling above a ground line) | Top-down is diegetic for FPV, solves occlusion, and makes urgency a single readable coordinate. |
| Drone patrolling from the left | Would make the *urgent* target the *farthest* — compounding difficulty on itself. Launching from the wall makes emergencies cheap to answer. |
| Retargeting mid-flight | Adds a velocity/turn-rate physics model, breaks the §6 guarantee, and weakens the wrong-answer penalty. |
| Kamikaze drone destroying a wrongly-targeted tank | Would make wrong answers usefully clear the board. |
| Wrong answers resolving on impact | Delays feedback for no gain, since the choice is already committed. |
| "No drones left" as a separate game-over | Adds nothing the heart economy does not already express (§7). |
| Instant loss on first breach | Too harsh for the target age; kills replay. |
| Fixed (non-regenerating) drone pool | Creates a death spiral under pressure. |
| Generating tanks from the problem | Numbers would change under the player's finger. |
| Random-number distractors | Reduces the game to string matching; no educational content. |
| Tanks shooting back / dodging | Turns a math game into a reflex game. |
| Cloud sync, accounts, leaderboards | Children's-privacy obligations for no real benefit. |
| Central drone hangar with diagonal flight | Breaks per-lane symmetry; edge lanes get a worse deal, and drone speed re-enters the fairness equation. |
| GIF / SMIL / Lottie for effects | See §13. |
| Portrait orientation (v1) | Layout is a landscape composition. |
| Phaser 3 / PixiJS | Rasterise SVG at load, so §13's named-group animation does not survive; Phaser additionally pulls game state toward Scenes, against §14. See §17. |
| Canvas 2D rendering | Cannot reach inside an SVG, so §13's asset contract would become "parts plus an offsets manifest"; also hand-rolled text fitting and hit-testing. See §17. |
| C++ / WebAssembly for the core | Still requires JS for DOM, input, audio and assets — you learn the web anyway, plus an Emscripten toolchain, and it forecloses nothing TypeScript doesn't. |

---

## 17. Technology stack (decided)

**TypeScript + Vite + Vitest. DOM with inline SVG for rendering. No game engine.**

Rationale, tied to requirements already in this document:

- **Inline SVG in the DOM implements §13 literally.** Each tank is a `<g>` node; the engine
  transforms named groups (`rotor-fl`) inside a static SVG exactly as §13 specifies. Canvas- and
  WebGL-based options (Pixi, Phaser) rasterise SVG at load, so named-group animation does not
  survive and the asset contract would have to become "a folder of parts plus an offsets manifest".
- **The tank number becomes a real `<text>` element.** §13 calls the text safe zone the single most
  likely thing to break when swapping art; this is the option where it breaks least — legible at any
  DPI, no font atlas, no manual `measureText` fitting.
- **Tap targeting is a `click` listener on the tank node** — correct on touch and mouse with no
  hit-testing code.
- **An SVG `viewBox` gives responsive, aspect-preserving scaling natively**, which is most of what
  an engine's scale manager exists to provide.
- **TypeScript's `strict` mode is the closest available equivalent to warnings-as-errors**, and is
  what keeps an AI agent's output mechanically checkable (§19).
- The renderer sits behind a narrow interface and the logic core never imports it, so this is a
  reversible decision — roughly a day to swap at this scene size.

**What no-engine costs, and the mitigation.** The engine features this game would otherwise use are
a preloader, a sprite-sheet flipbook, a tween helper, and audio — about 250–300 lines total, nearly
all deferred to late milestones. Physics, particles, input abstraction, scaling and text rendering
are all either unnecessary here or better in the DOM.

**Audio is the one genuine loss** and should be bought, not built: browser autoplay unlock, decode,
pooling and the mobile-Safari quirks are fiddly and platform-specific. Use **Howler.js** (~10KB,
audio only, architecture-agnostic) rather than adopting a whole engine for its sound manager.

**Risk to watch:** drift — quietly building a bad game engine one helper at a time. Rule: build the
specific thing the game needs, never the general system. If a helper grows options nothing uses,
stop.

**Animation clock rule.** CSS transitions and the Web Animations API run on the browser's clock, not
the game's — they do not pause when the game pauses and do not scale with the fixed timestep.
Therefore: anything affecting gameplay (drone and tank positions) is moved by the game loop; only
decorative effects (flashes, shake, score pops) may be CSS.

---

## 17a. Open questions

1. **`t_answer` per age tier.** The entire fairness system depends on it. Measure from real play
   rather than guessing; the simulation harness (§14) is the tool.
2. **Concrete tuning values** — tank speeds per tier, spawn governor parameters, wave size N,
   resupply rate M, scoring formula.
3. **Sound design** — which cues exist and what they sound like. The *technical* question is
   resolved (Howler.js, unlocked on the first tap); the content question is not.
4. **How presets are surfaced in the UI** — parent-facing setup screen vs. in-game.
5. **Background art** — static, or parallax scrolling ground to convey tank motion.

---

## 18. Out of scope for v1

- Adaptive difficulty (but record the data for it now — §14)
- Tanks with return fire / drone evasion
- App store distribution
- Cloud sync or cross-device profiles
- Portrait layout

---

## 19. Secondary goal (context for how to work)

The author has a deliberate learning goal alongside the game: understanding how to direct an AI
coding agent effectively, not just receiving a finished product.

Practical implication: prefer small, verifiable increments with a written spec to hold the agent to.
The headless logic core (§14) exists partly for this reason — problem generation, distractor
selection, difficulty constraints and targeting can be specified and mechanically verified, rather
than eyeballed in a running game.

The author's C++ instincts about separating logic from I/O transfer directly and should be leaned on.
