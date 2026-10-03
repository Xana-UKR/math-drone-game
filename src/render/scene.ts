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

export interface Scene {
  svg: SVGSVGElement;
  sync(state: GameState): void;
}

/**
 * Builds the SVG once: lane bands sized to `config.lanes`, and the base console (DESIGN.md §3) —
 * a panel down the right edge whose left face is the wall every lane terminates on. Widening
 * CONSOLE_WIDTH therefore also shortens `travel`, the pixels a tank covers in
 * `laneTraverseSeconds`.
 * `sync(state)` then creates, moves and removes one `<g>` per tank, keyed by id, and one `<g>` for
 * the drone, in a layer above the tanks. `onSelectTank` is wired to a `click` listener on each
 * tank node as it is created (DESIGN.md §17: tap targeting needs no hit-testing code this way) —
 * render only reports the tap; core decides what it means.
 */
export function createScene(config: Config, onSelectTank: (tankId: number) => void): Scene {
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

  const tankLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(tankLayer);

  // Appended after the tank layer, so paint order puts the drone above every tank.
  const droneLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(droneLayer);

  // Map core x so the tank's nose (its right edge, TANK_WIDTH / 2 from centre) sits exactly on the
  // wall's near face at x=1, and the tank's centre sits just off the left edge of the viewBox at x=0.
  const spawnX = -TANK_WIDTH / 2;
  const wallX = wallFaceX - TANK_WIDTH / 2;
  const travel = wallX - spawnX;

  const tankNodes = new Map<number, { g: SVGElement; label: SVGTextElement }>();

  function createTankNode(number: number): { g: SVGElement; label: SVGTextElement } {
    const g = document.createElementNS(SVG_NS, 'g');

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

  function sync(state: GameState): void {
    const { problem } = state;
    problemText.textContent = problem === null ? '' : `${problem.a} ${problem.op} ${problem.b} = ?`;

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
