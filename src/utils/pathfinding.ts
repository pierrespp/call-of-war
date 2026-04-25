import { CoverType, DeployZone } from "../types/game";

export const WATER_CELL_COST = 3;     // metres consumed when crossing a water cell
export const NORMAL_CELL_COST = 1.5;  // metres consumed for any non-water cell

export interface ReachableCell {
  gx: number;
  gy: number;
  cost: number;        // metres spent reaching this cell
  maxRange: number;    // total movement budget (constant per BFS) — used to colour cells by ratio
  parent: string | null; // cellKey of parent in BFS tree, null for the source
}

export interface PathStep { gx: number; gy: number; }

// `wall`, `half` and `full` are all sólidos — bloqueiam roteamento como uma parede.
// `doorClose` também bloqueia.
// `water` e `window` são atravessáveis, mas custam o dobro do movimento normal.
const isBlocking = (t: CoverType | undefined): boolean =>
  t === "wall" || t === "half" || t === "full" || t === "doorClose";

const cellCostMeters = (t: CoverType | undefined): number =>
  (t === "water" || t === "window") ? WATER_CELL_COST : NORMAL_CELL_COST;

/**
 * Dijkstra-style BFS that respects per-cell cost (water = 3 m, others = 1.5 m).
 * Cells with cobertura sólida (wall, half, full) are impassable. The source cell
 * is reachable at cost 0 (you're standing on it). Cells occupied by other units
 * are impassable.
 */
export function computeReachable(
  startGx: number,
  startGy: number,
  gridWidth: number,
  gridHeight: number,
  cover: Record<string, CoverType | string>,
  occupied: Set<string>, // cellKey of other units
  movementBudgetMeters: number,
): Map<string, ReachableCell> {
  const result = new Map<string, ReachableCell>();
  const startKey = `${startGx},${startGy}`;
  result.set(startKey, { gx: startGx, gy: startGy, cost: 0, maxRange: movementBudgetMeters, parent: null });

  // Priority queue (cost-ascending). Tiny size so a sorted array is fine.
  const queue: Array<{ key: string; cost: number; gx: number; gy: number }> = [
    { key: startKey, cost: 0, gx: startGx, gy: startGy },
  ];

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (cur.cost > (result.get(cur.key)?.cost ?? Infinity)) continue;

    // 4-neighbour movement (up/down/left/right) — keeps "manual mode" intuitive.
    const neighbours = [
      { gx: cur.gx + 1, gy: cur.gy },
      { gx: cur.gx - 1, gy: cur.gy },
      { gx: cur.gx, gy: cur.gy + 1 },
      { gx: cur.gx, gy: cur.gy - 1 },
    ];
    for (const n of neighbours) {
      if (n.gx < 0 || n.gy < 0 || n.gx >= gridWidth || n.gy >= gridHeight) continue;
      const nKey = `${n.gx},${n.gy}`;
      const nCover = cover[nKey] as CoverType | undefined;
      if (isBlocking(nCover)) continue;
      if (occupied.has(nKey)) continue;
      const stepCost = cellCostMeters(nCover);
      const newCost = cur.cost + stepCost;
      if (newCost > movementBudgetMeters + 1e-6) continue;
      const existing = result.get(nKey);
      if (!existing || newCost < existing.cost - 1e-6) {
        result.set(nKey, { gx: n.gx, gy: n.gy, cost: newCost, maxRange: movementBudgetMeters, parent: cur.key });
        queue.push({ key: nKey, cost: newCost, gx: n.gx, gy: n.gy });
      }
    }
  }
  return result;
}

/** Reconstructs the path from source to (targetGx, targetGy) given a reachable map.
 *  startGx/startGy are accepted for API symmetry but not used (parent chain encodes it). */
export function reconstructPath(
  reachable: Map<string, ReachableCell>,
  _startGx: number,
  _startGy: number,
  targetGx: number,
  targetGy: number,
): PathStep[] | null {
  const targetKey = `${targetGx},${targetGy}`;
  if (!reachable.has(targetKey)) return null;
  const out: PathStep[] = [];
  let cur: string | null = targetKey;
  while (cur) {
    const node = reachable.get(cur);
    if (!node) return null;
    out.unshift({ gx: node.gx, gy: node.gy });
    cur = node.parent;
  }
  return out;
}

/** Computes total movement cost (metres) for a sequence of cells the player walked through.
 *  Skips the first cell (the starting position has cost 0). */
export function pathCostMeters(
  path: PathStep[],
  cover: Record<string, CoverType | string>,
): number {
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const k = `${path[i].gx},${path[i].gy}`;
    cost += cellCostMeters(cover[k] as CoverType | undefined);
  }
  return cost;
}

/** Validates that a path is a legal sequence of 4-adjacent steps with no
 *  obstáculos sólidos (wall/half/full) e sem outras unidades no caminho. */
export function validatePath(
  path: PathStep[],
  gridWidth: number,
  gridHeight: number,
  cover: Record<string, CoverType | string>,
  occupied: Set<string>, // cells occupied by *other* units
): { ok: boolean; error?: string } {
  if (!path.length) return { ok: false, error: "Caminho vazio" };
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (c.gx < 0 || c.gy < 0 || c.gx >= gridWidth || c.gy >= gridHeight)
      return { ok: false, error: "Caminho fora do mapa" };
    const k = `${c.gx},${c.gy}`;
    const cellType = cover[k] as CoverType | undefined;
    if (isBlocking(cellType)) {
      const label =
        cellType === "wall" ? "uma parede"
        : cellType === "full" ? "cobertura total"
        : cellType === "half" ? "cobertura parcial"
        : "um obstáculo";
      return { ok: false, error: `Caminho atravessa ${label}` };
    }
    if (i > 0 && occupied.has(k))
      return { ok: false, error: "Caminho atravessa outra unidade" };
    if (i > 0) {
      const prev = path[i - 1];
      const dx = Math.abs(c.gx - prev.gx);
      const dy = Math.abs(c.gy - prev.gy);
      if (dx + dy !== 1) return { ok: false, error: "Passo não é adjacente" };
    }
  }
  return { ok: true };
}

/**
 * Identify all deploy zones for a given color. A zone is a connected component
 * (4-adjacency) of cells with the requested cover type.
 */
export function findDeployZones(
  cover: Record<string, CoverType | string>,
  team: "A" | "B",
): DeployZone[] {
  const wantType: CoverType = team === "A" ? "deployA" : "deployB";
  const visited = new Set<string>();
  const zones: DeployZone[] = [];
  const cells: Array<[number, number]> = [];
  for (const [k, t] of Object.entries(cover)) {
    if (t === wantType) {
      const [gx, gy] = k.split(",").map(Number);
      cells.push([gx, gy]);
    }
  }
  for (const [gx, gy] of cells) {
    const key = `${gx},${gy}`;
    if (visited.has(key)) continue;
    // BFS this zone
    const zoneCells: string[] = [];
    let smallestKey = key;
    const queue: Array<[number, number]> = [[gx, gy]];
    visited.add(key);
    while (queue.length) {
      const [cx, cy] = queue.shift()!;
      const ck = `${cx},${cy}`;
      zoneCells.push(ck);
      if (ck < smallestKey) smallestKey = ck;
      const neighbours: Array<[number, number]> = [
        [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
      ];
      for (const [nx, ny] of neighbours) {
        const nk = `${nx},${ny}`;
        if (visited.has(nk)) continue;
        if (cover[nk] === wantType) {
          visited.add(nk);
          queue.push([nx, ny]);
        }
      }
    }
    zones.push({ id: smallestKey, team, cells: zoneCells.sort() });
  }
  return zones.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Validates deploy zones on save: each zone must have exactly 9 cells. */
export function validateDeployZones(cover: Record<string, CoverType | string>): {
  ok: boolean;
  errors: string[];
  zonesA: DeployZone[];
  zonesB: DeployZone[];
} {
  const zonesA = findDeployZones(cover, "A");
  const zonesB = findDeployZones(cover, "B");
  const errors: string[] = [];
  for (const z of zonesA) {
    if (z.cells.length !== 9)
      errors.push(`Zona Deploy A em ${z.id} tem ${z.cells.length} células (precisa de 9).`);
  }
  for (const z of zonesB) {
    if (z.cells.length !== 9)
      errors.push(`Zona Deploy B em ${z.id} tem ${z.cells.length} células (precisa de 9).`);
  }
  return { ok: errors.length === 0, errors, zonesA, zonesB };
}

/**
 * Default deploy zones used when a map has no Map Editor data yet.
 * Returns a record of { cellKey: "deployA" | "deployB" } adding two 3×3 zones
 * (one for each team) on opposite ends of the grid, leaving a margin from the edge.
 */
export function defaultDeployZones(gridWidth: number, gridHeight: number): Record<string, CoverType> {
  const out: Record<string, CoverType> = {};
  const margin = 2;
  // Team A — top-left (3×3)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      out[`${margin + dx},${margin + dy}`] = "deployA";
    }
  }
  // Team B — bottom-right (3×3)
  const baseX = gridWidth - margin - 3;
  const baseY = gridHeight - margin - 3;
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      out[`${baseX + dx},${baseY + dy}`] = "deployB";
    }
  }
  return out;
}
