import type { Config, GameState } from '../core/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Landscape viewBox (DESIGN.md §3); render works in these units, core stays unitless. */
const VIEWBOX_WIDTH = 1600;
const VIEWBOX_HEIGHT = 900;

const WALL_WIDTH = 24;
const TANK_WIDTH = 90;
const TANK_HEIGHT = 60;

export interface Scene {
  svg: SVGSVGElement;
  sync(state: GameState): void;
}

/**
 * Builds the SVG once: lane bands sized to `config.lanes` and a base wall down the right edge.
 * `sync(state)` then creates, moves and removes one `<g>` per tank, keyed by id.
 */
export function createScene(config: Config): Scene {
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

  const wall = document.createElementNS(SVG_NS, 'rect');
  wall.setAttribute('x', String(VIEWBOX_WIDTH - WALL_WIDTH));
  wall.setAttribute('y', '0');
  wall.setAttribute('width', String(WALL_WIDTH));
  wall.setAttribute('height', String(VIEWBOX_HEIGHT));
  wall.setAttribute('fill', '#e6edf3');
  svg.appendChild(wall);

  const tankLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(tankLayer);

  // Map core x so the tank's nose (its right edge, TANK_WIDTH / 2 from centre) sits exactly on the
  // wall's near face at x=1, and the tank's centre sits just off the left edge of the viewBox at x=0.
  const spawnX = -TANK_WIDTH / 2;
  const wallX = VIEWBOX_WIDTH - WALL_WIDTH - TANK_WIDTH / 2;
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

  function sync(state: GameState): void {
    const seen = new Set<number>();

    for (const tank of state.tanks) {
      seen.add(tank.id);

      let node = tankNodes.get(tank.id);
      if (node === undefined) {
        node = createTankNode(tank.number);
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
  }

  return { svg, sync };
}
