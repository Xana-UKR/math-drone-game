import type { Config, GameState } from '../core/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Landscape viewBox (DESIGN.md §3); render works in these units, core stays unitless. */
const VIEWBOX_WIDTH = 1600;
const VIEWBOX_HEIGHT = 900;

/** The base console (DESIGN.md §3): a panel on the right edge whose left face is the wall. */
const CONSOLE_WIDTH = 240;
const TANK_WIDTH = 90;
const TANK_HEIGHT = 60;
/** No art yet (out of scope for this increment) — a plain rectangle stands in for the drone. */
const DRONE_WIDTH = 40;
const DRONE_HEIGHT = 18;
/**
 * The core-x mapping below aligns a tank's *nose* to the wall at x = 1, so it is offset by half a
 * tank width. The drone shares that mapping (see `sync`) but is narrower, so without correcting
 * for the width difference its own nose would start half a tank short of the wall — a drone
 * appearing in open ground rather than launching from the wall (DESIGN.md §4).
 */
const DRONE_NOSE_OFFSET = (TANK_WIDTH - DRONE_WIDTH) / 2;

/** Spent-heart glyphs sit at the same spot the remaining ones would, just greyed. */
const HEART_COLOR_REMAINING = '#d94f4f';
const HEART_COLOR_SPENT = '#9aa4ae';
const HEART_SPACING = 48;
const HEART_FONT_SIZE = 36;

/** The drone/destroyed counters sit below the problem, each other's own row. */
const COUNTER_FONT_SIZE = 28;
const COUNTER_COLOR = '#0b0f14';
/** Same grey as a spent heart — a refused tap reads as "I'm out", not as a bug. */
const COUNTER_COLOR_EMPTY = HEART_COLOR_SPENT;

/**
 * Wall clock, not the fixed timestep: this is input debounce on a decorative overlay, not
 * gameplay, and CLAUDE.md's motion rule doesn't reach it. A child mid-tap on a tank when the last
 * heart is lost must not have that same tap land on the overlay and skip straight into a new run
 * before they have seen the loss.
 */
const RESTART_DEBOUNCE_SECONDS = 0.75;

/**
 * End-of-run overlay layout (increment 4d). All plain white text over the scrim, sized down from
 * the title to the per-entry list, with generous vertical gaps so nothing it can show ever clips
 * the viewBox. The worst case is 13 entries — every shot of a `waveSize` 13 wave wrong, the most
 * DESIGN.md §7's pool allows. A `waveSize` above 14 can exceed 7 rows per column and reach the
 * footer.
 */
const OVERLAY_TEXT_COLOR = '#ffffff';
const OVERLAY_CENTER_X = VIEWBOX_WIDTH / 2;
const OVERLAY_TITLE_FONT_SIZE = 64;
const OVERLAY_TITLE_Y = 110;
const OVERLAY_COUNT_FONT_SIZE = 30;
const OVERLAY_DESTROYED_Y = 190;
const OVERLAY_WRONG_COUNT_Y = 232;
/**
 * The wrong-answer list sits between the counts and the footer. One column holds up to
 * `OVERLAY_LIST_MAX_ROWS_PER_COLUMN` entries; a longer list splits into two side-by-side columns
 * of (at most) that many rows each, so the vertical space the list occupies never grows past what
 * one column of that height already reserves — 13, the worst case, fits as 7 and 6.
 */
const OVERLAY_LIST_FONT_SIZE = 28;
const OVERLAY_LIST_TOP_Y = 300;
const OVERLAY_LIST_ROW_HEIGHT = 50;
const OVERLAY_LIST_MAX_ROWS_PER_COLUMN = 7;
const OVERLAY_LIST_COLUMN_LEFT_X = VIEWBOX_WIDTH * 0.27;
const OVERLAY_LIST_COLUMN_RIGHT_X = VIEWBOX_WIDTH * 0.73;
const OVERLAY_FOOTER_FONT_SIZE = 44;
const OVERLAY_FOOTER_Y = 820;

export interface Scene {
  svg: SVGSVGElement;
  sync(state: GameState): void;
}

/**
 * Builds the SVG once: lane bands sized to `config.lanes`, and the base console (DESIGN.md §3) —
 * a panel down the right edge whose left face is the wall every lane terminates on. Widening
 * CONSOLE_WIDTH therefore also shortens `travel`, the pixels a tank covers in
 * `laneTraverseSeconds`. The console also carries one heart glyph per `config.hearts`, above the
 * problem text, and two counters below it: drones left and tanks destroyed (DESIGN.md §7).
 * `sync(state)` then creates, moves and removes one `<g>` per tank, keyed by id, and one `<g>` for
 * the drone, in a layer above the tanks; recolours the hearts from `state.hearts`; updates the two
 * counters from `state.drones` and `state.correct`, greying the drone count at zero; and shows or
 * hides a full-screen end-of-run overlay, appended last so it sits above the drone layer too. The
 * overlay's title, counts and wrong-answer list (increment 4d, DESIGN.md §16) are built once, on
 * the `playing` → ended edge, not every frame — the run is frozen by then, so they cannot change.
 * `onSelectTank` is wired to a `click` listener on each tank node as it is created (DESIGN.md §17:
 * tap targeting needs no hit-testing code this way) — render only reports the tap; core decides
 * what it means. `onRestart` is wired the same way to the overlay, debounced for
 * `RESTART_DEBOUNCE_SECONDS` from the moment the overlay appears.
 */
export function createScene(
  config: Config,
  onSelectTank: (tankId: number) => void,
  onRestart: () => void,
): Scene {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const laneHeight = VIEWBOX_HEIGHT / config.lanes;

  for (let lane = 0; lane < config.lanes; lane += 1) {
    const band = document.createElementNS(SVG_NS, 'rect');
    band.setAttribute('x', '0');
    band.setAttribute('y', String(lane * laneHeight));
    band.setAttribute('width', String(VIEWBOX_WIDTH));
    band.setAttribute('height', String(laneHeight));
    band.setAttribute('fill', lane % 2 === 0 ? '#1b2330' : '#161c26');
    svg.appendChild(band);
  }

  // The console's left face is the wall every lane terminates on.
  const wallFaceX = VIEWBOX_WIDTH - CONSOLE_WIDTH;

  const consolePanel = document.createElementNS(SVG_NS, 'rect');
  consolePanel.setAttribute('x', String(wallFaceX));
  consolePanel.setAttribute('y', '0');
  consolePanel.setAttribute('width', String(CONSOLE_WIDTH));
  consolePanel.setAttribute('height', String(VIEWBOX_HEIGHT));
  consolePanel.setAttribute('fill', '#e6edf3');
  svg.appendChild(consolePanel);

  const problemText = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  problemText.setAttribute('x', String(wallFaceX + CONSOLE_WIDTH / 2));
  problemText.setAttribute('y', String(VIEWBOX_HEIGHT / 2));
  problemText.setAttribute('text-anchor', 'middle');
  problemText.setAttribute('dominant-baseline', 'central');
  problemText.setAttribute('fill', '#0b0f14');
  // 40, not 48: the widest problem the generator can produce is 11 glyphs (`20 - 20 = ?`), and
  // SVG text is not clipped, so an overflow would render on the lane bands in the console's own
  // near-black fill — invisible rather than merely ugly.
  problemText.setAttribute('font-size', '40');
  problemText.setAttribute('font-family', 'system-ui, sans-serif');
  problemText.setAttribute('font-weight', 'bold');
  svg.appendChild(problemText);

  // One ♥ per config.hearts, in a row above the problem, centred on the console.
  const consoleCenterX = wallFaceX + CONSOLE_WIDTH / 2;
  const heartsY = VIEWBOX_HEIGHT / 2 - 120;
  const heartNodes: SVGTextElement[] = [];
  for (let i = 0; i < config.hearts; i += 1) {
    const heart = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    heart.setAttribute('x', String(consoleCenterX + (i - (config.hearts - 1) / 2) * HEART_SPACING));
    heart.setAttribute('y', String(heartsY));
    heart.setAttribute('text-anchor', 'middle');
    heart.setAttribute('dominant-baseline', 'central');
    heart.setAttribute('font-size', String(HEART_FONT_SIZE));
    heart.setAttribute('font-family', 'system-ui, sans-serif');
    heart.textContent = '♥';
    svg.appendChild(heart);
    heartNodes.push(heart);
  }

  // "Tanks left" (increment 4c) sits between the hearts row and the problem text, same style as
  // the hearts/drones/destroyed counters — the wave's own countdown, distinct from the drone pool.
  const tanksLeftText = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  tanksLeftText.setAttribute('x', String(consoleCenterX));
  tanksLeftText.setAttribute('y', String((heartsY + VIEWBOX_HEIGHT / 2) / 2));
  tanksLeftText.setAttribute('text-anchor', 'middle');
  tanksLeftText.setAttribute('dominant-baseline', 'central');
  tanksLeftText.setAttribute('font-size', String(COUNTER_FONT_SIZE));
  tanksLeftText.setAttribute('font-family', 'system-ui, sans-serif');
  tanksLeftText.setAttribute('fill', COUNTER_COLOR);
  svg.appendChild(tanksLeftText);

  // Two counters below the problem — drones left and tanks destroyed (DESIGN.md §7) — each its
  // own row, with enough gap from problemText's own font-size (40, centred on the same y) that
  // neither ever overlaps it.
  const dronesText = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  dronesText.setAttribute('x', String(consoleCenterX));
  dronesText.setAttribute('y', String(VIEWBOX_HEIGHT / 2 + 90));
  dronesText.setAttribute('text-anchor', 'middle');
  dronesText.setAttribute('dominant-baseline', 'central');
  dronesText.setAttribute('font-size', String(COUNTER_FONT_SIZE));
  dronesText.setAttribute('font-family', 'system-ui, sans-serif');
  svg.appendChild(dronesText);

  const destroyedText = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
  destroyedText.setAttribute('x', String(consoleCenterX));
  destroyedText.setAttribute('y', String(VIEWBOX_HEIGHT / 2 + 90 + HEART_FONT_SIZE));
  destroyedText.setAttribute('text-anchor', 'middle');
  destroyedText.setAttribute('dominant-baseline', 'central');
  destroyedText.setAttribute('font-size', String(COUNTER_FONT_SIZE));
  destroyedText.setAttribute('font-family', 'system-ui, sans-serif');
  destroyedText.setAttribute('fill', COUNTER_COLOR);
  svg.appendChild(destroyedText);

  const tankLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(tankLayer);

  // Appended after the tank layer, so paint order puts the drone above every tank.
  const droneLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(droneLayer);

  // Appended last of all, so paint order puts it above the drone layer too. Hidden by default —
  // `sync` reveals it for any `state.outcome` other than `'playing'` — `'lost'` or `'won'` alike.
  const overlay = document.createElementNS(SVG_NS, 'g');
  overlay.setAttribute('display', 'none');
  overlay.setAttribute('cursor', 'pointer');

  const overlayScrim = document.createElementNS(SVG_NS, 'rect');
  overlayScrim.setAttribute('x', '0');
  overlayScrim.setAttribute('y', '0');
  overlayScrim.setAttribute('width', String(VIEWBOX_WIDTH));
  overlayScrim.setAttribute('height', String(VIEWBOX_HEIGHT));
  overlayScrim.setAttribute('fill', '#000000');
  overlayScrim.setAttribute('fill-opacity', '0.7');
  overlay.appendChild(overlayScrim);

  /** A plain, centred overlay text node at a given y — every line below shares this shape. */
  function createOverlayText(y: number, fontSize: number, bold: boolean): SVGTextElement {
    const text = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    text.setAttribute('x', String(OVERLAY_CENTER_X));
    text.setAttribute('y', String(y));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', OVERLAY_TEXT_COLOR);
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('font-family', 'system-ui, sans-serif');
    if (bold) text.setAttribute('font-weight', 'bold');
    return text;
  }

  // "You won!" / "Out of hearts", the two counts, and the footer are fixed single lines, built
  // once; only their textContent changes. The wrong-answer list's row count (and so its column
  // layout) varies with the run, so its own nodes are rebuilt from scratch — see `buildOverlayList`.
  const overlayTitle = createOverlayText(OVERLAY_TITLE_Y, OVERLAY_TITLE_FONT_SIZE, true);
  overlay.appendChild(overlayTitle);
  const overlayDestroyed = createOverlayText(OVERLAY_DESTROYED_Y, OVERLAY_COUNT_FONT_SIZE, false);
  overlay.appendChild(overlayDestroyed);
  const overlayWrongCount = createOverlayText(OVERLAY_WRONG_COUNT_Y, OVERLAY_COUNT_FONT_SIZE, false);
  overlay.appendChild(overlayWrongCount);

  const overlayListLayer = document.createElementNS(SVG_NS, 'g');
  overlay.appendChild(overlayListLayer);

  const overlayFooter = createOverlayText(OVERLAY_FOOTER_Y, OVERLAY_FOOTER_FONT_SIZE, true);
  overlayFooter.textContent = 'Tap to play again';
  overlay.appendChild(overlayFooter);

  /**
   * (Re)builds the wrong-answer list from `wrongAnswers`, keyed by nothing — called only on the
   * `playing` → ended edge (see `sync`), never per frame, since the list a frozen run ends with
   * never changes again. One column up to `OVERLAY_LIST_MAX_ROWS_PER_COLUMN` entries; beyond that,
   * two columns, first filled before the second, each capped at that same row count.
   */
  function buildOverlayList(wrongAnswers: GameState['wrongAnswers']): void {
    while (overlayListLayer.firstChild !== null) overlayListLayer.firstChild.remove();

    if (wrongAnswers.length === 0) {
      const text = createOverlayText(
        OVERLAY_LIST_TOP_Y + OVERLAY_LIST_ROW_HEIGHT / 2,
        OVERLAY_LIST_FONT_SIZE,
        false,
      );
      text.textContent = 'No wrong answers!';
      overlayListLayer.appendChild(text);
      return;
    }

    const columns = wrongAnswers.length > OVERLAY_LIST_MAX_ROWS_PER_COLUMN ? 2 : 1;
    const rows = Math.ceil(wrongAnswers.length / columns);

    wrongAnswers.forEach(({ problem, chosen }, i) => {
      const column = Math.floor(i / rows);
      const row = i % rows;
      const x =
        columns === 1
          ? OVERLAY_CENTER_X
          : column === 0
            ? OVERLAY_LIST_COLUMN_LEFT_X
            : OVERLAY_LIST_COLUMN_RIGHT_X;
      const y = OVERLAY_LIST_TOP_Y + row * OVERLAY_LIST_ROW_HEIGHT + OVERLAY_LIST_ROW_HEIGHT / 2;

      const text = createOverlayText(y, OVERLAY_LIST_FONT_SIZE, false);
      text.setAttribute('x', String(x));
      text.textContent =
        `${problem.a} ${problem.op} ${problem.b} = ${problem.answer} — you chose ${chosen}`;
      overlayListLayer.appendChild(text);
    });
  }

  svg.appendChild(overlay);

  // `null` until the overlay has shown at least once; `sync` sets it the step `state.outcome`
  // first reads something other than `'playing'`, and the click listener below refuses to act
  // until RESTART_DEBOUNCE_SECONDS has passed since then.
  let shownAt: number | null = null;
  overlay.addEventListener('click', () => {
    if (shownAt !== null && performance.now() - shownAt >= RESTART_DEBOUNCE_SECONDS * 1000) {
      onRestart();
    }
  });

  // Map core x so the tank's nose (its right edge, TANK_WIDTH / 2 from centre) sits exactly on the
  // wall's near face at x=1, and the tank's tail (its left edge) sits exactly on the viewBox's own
  // left edge at x=0 — increment 4c's entry fix: a tank's number is readable the instant it enters
  // rather than ~1.1 s later, when its off-screen half would otherwise have scrolled into view.
  // Render-only: core still starts every tank at x=0 and knows nothing about pixels.
  const spawnX = TANK_WIDTH / 2;
  const wallX = wallFaceX - TANK_WIDTH / 2;
  const travel = wallX - spawnX;

  const tankNodes = new Map<number, { g: SVGElement; label: SVGTextElement }>();

  function createTankNode(number: number): { g: SVGElement; label: SVGTextElement } {
    const g = document.createElementNS(SVG_NS, 'g');
    // Inherited by the hull and the number, so the label shows a hand rather than an I-beam.
    g.setAttribute('cursor', 'pointer');

    const hull = document.createElementNS(SVG_NS, 'rect');
    hull.setAttribute('x', String(-TANK_WIDTH / 2));
    hull.setAttribute('y', String(-TANK_HEIGHT / 2));
    hull.setAttribute('width', String(TANK_WIDTH));
    hull.setAttribute('height', String(TANK_HEIGHT));
    hull.setAttribute('rx', '6');
    hull.setAttribute('fill', '#4a7043');
    g.appendChild(hull);

    const label = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    label.setAttribute('x', '0');
    label.setAttribute('y', '0');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('fill', '#0b0f14');
    label.setAttribute('font-size', '28');
    label.setAttribute('font-family', 'system-ui, sans-serif');
    label.setAttribute('font-weight', 'bold');
    label.textContent = String(number);
    g.appendChild(label);

    tankLayer.appendChild(g);
    return { g, label };
  }

  function createDroneNode(): SVGElement {
    const g = document.createElementNS(SVG_NS, 'g');

    const body = document.createElementNS(SVG_NS, 'rect');
    body.setAttribute('x', String(-DRONE_WIDTH / 2));
    body.setAttribute('y', String(-DRONE_HEIGHT / 2));
    body.setAttribute('width', String(DRONE_WIDTH));
    body.setAttribute('height', String(DRONE_HEIGHT));
    body.setAttribute('rx', '4');
    body.setAttribute('fill', '#d94f4f');
    g.appendChild(body);

    droneLayer.appendChild(g);
    return g;
  }

  let droneNode: SVGElement | null = null;
  /** Whether the overlay was shown as of the previous `sync` — the edge `shownAt` is set on. */
  let wasEnded = false;

  function sync(state: GameState): void {
    const { problem } = state;
    problemText.textContent = problem === null ? '' : `${problem.a} ${problem.op} ${problem.b} = ?`;

    for (let i = 0; i < heartNodes.length; i += 1) {
      const heart = heartNodes[i];
      if (heart === undefined) continue;
      heart.setAttribute('fill', i < state.hearts ? HEART_COLOR_REMAINING : HEART_COLOR_SPENT);
    }

    tanksLeftText.textContent = `Tanks left ${state.tanks.length + state.pending.length}`;

    dronesText.textContent = `Drones ${state.drones}`;
    dronesText.setAttribute('fill', state.drones === 0 ? COUNTER_COLOR_EMPTY : COUNTER_COLOR);
    destroyedText.textContent = `Destroyed ${state.correct}`;

    const isEnded = state.outcome !== 'playing';
    overlay.setAttribute('display', isEnded ? 'inline' : 'none');
    if (isEnded && !wasEnded) {
      shownAt = performance.now();
      overlayTitle.textContent = state.outcome === 'won' ? 'You won!' : 'Out of hearts';
      overlayDestroyed.textContent = `Tanks destroyed: ${state.correct}`;
      overlayWrongCount.textContent = `Wrong answers: ${state.wrongAnswers.length}`;
      buildOverlayList(state.wrongAnswers);
    }
    wasEnded = isEnded;

    const seen = new Set<number>();

    for (const tank of state.tanks) {
      seen.add(tank.id);

      let node = tankNodes.get(tank.id);
      if (node === undefined) {
        node = createTankNode(tank.number);
        node.g.addEventListener('click', () => onSelectTank(tank.id));
        tankNodes.set(tank.id, node);
      }

      const x = spawnX + tank.x * travel;
      const y = (tank.lane + 0.5) * laneHeight;
      node.g.setAttribute('transform', `translate(${x}, ${y})`);
    }

    for (const [id, node] of tankNodes) {
      if (!seen.has(id)) {
        node.g.remove();
        tankNodes.delete(id);
      }
    }

    const { drone } = state;
    if (drone === null) {
      if (droneNode !== null) {
        droneNode.remove();
        droneNode = null;
      }
    } else {
      if (droneNode === null) droneNode = createDroneNode();

      // `hit` shares the tanks' own spawnX/travel mapping, so the drawn impact coincides with
      // core's impact condition — plus DRONE_NOSE_OFFSET, which puts the drone's nose where a
      // tank's nose would be rather than its centre. `miss` is a decorative diagonal derived from
      // the single core scalar: top-right corner (x=1) to bottom-left (x=0) — core owns the
      // scalar, the diagonal is render's to draw.
      const [x, y] =
        drone.kind === 'hit'
          ? [spawnX + drone.x * travel + DRONE_NOSE_OFFSET, (drone.lane + 0.5) * laneHeight]
          : [drone.x * VIEWBOX_WIDTH, (1 - drone.x) * VIEWBOX_HEIGHT];
      droneNode.setAttribute('transform', `translate(${x}, ${y})`);
    }
  }

  return { svg, sync };
}
