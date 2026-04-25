import { CELL_SIZE } from "../data/constants";
import { CoverType, MapCoverData } from "../types/game";

export type ShotCoverLevel = "none" | "half" | "full";

export interface ShotCoverResult {
  /** Final cover applied to the shot. `full` always wins over `half`. */
  cover: ShotCoverLevel;
  /** True when the line of fire crosses a wall — shot is blocked entirely. */
  hasWall: boolean;
  /** Full-cover cells found along the line (no distance restriction). */
  contributingFullCells: string[];
  /**
   * Half-cover cells that effectively grant the bonus. By rule a half cell
   * only protects the target if it is at most 2 squares (Chebyshev) from the
   * **target**, AND the **attacker** is not within 2 squares of that same
   * cell (in which case the bonus is cancelled — too close to flank).
   */
  contributingHalfCells: string[];
  /**
   * Half cells crossed by the line that did NOT meet the proximity rule.
   * Returned for UI debugging / future tooltips. Not used for math.
   */
  ignoredHalfCells: string[];
}

const HALF_RANGE_TO_TARGET = 2;
const HALF_CANCEL_FROM_ATTACKER = 2;

/**
 * Computes the cover applied to a shot using **server-authoritative** rules.
 *
 * Algorithm:
 *   1. Walk the line of fire (Bresenham, grid cells) from attacker to target,
 *      excluding the endpoints (the shooters' own cells).
 *   2. If any cell is `wall`, the shot is blocked (`hasWall = true`) and we
 *      return immediately — no cover math needed.
 *   3. Collect every `full` cell along the line. If at least one exists, the
 *      cover is `full` regardless of distance.
 *   4. For each `half` cell along the line, compute the Chebyshev distance
 *      to the target and to the attacker:
 *        - distance(half, target) ≤ 2  → eligible to grant cover
 *        - distance(half, attacker) ≤ 2 → cancels the cover (flanked)
 *      If `full` is not present and at least one half cell passes both
 *      checks, the cover is `half`.
 *   5. Otherwise the cover is `none`.
 *
 * Both client and server import this same function so the preview the player
 * sees matches what the server applies.
 */
export function computeShotCover(
  attackerX: number,
  attackerY: number,
  targetX: number,
  targetY: number,
  cover: MapCoverData,
): ShotCoverResult {
  const result: ShotCoverResult = {
    cover: "none",
    hasWall: false,
    contributingFullCells: [],
    contributingHalfCells: [],
    ignoredHalfCells: [],
  };

  const ax = Math.floor(attackerX / CELL_SIZE);
  const ay = Math.floor(attackerY / CELL_SIZE);
  const tx = Math.floor(targetX / CELL_SIZE);
  const ty = Math.floor(targetY / CELL_SIZE);

  // Bresenham — collects every grid cell touched by the segment.
  const dx = Math.abs(tx - ax);
  const dy = Math.abs(ty - ay);
  const sx = ax < tx ? 1 : -1;
  const sy = ay < ty ? 1 : -1;
  let err = dx - dy;
  let x = ax;
  let y = ay;

  const lineCells: Array<{ x: number; y: number; key: string }> = [];
  while (true) {
    const isAttackerCell = x === ax && y === ay;
    const isTargetCell = x === tx && y === ty;
    if (!isAttackerCell && !isTargetCell) {
      const key = `${x},${y}`;
      const c = cover[key] as CoverType | undefined;
      if (c === "wall") {
        result.hasWall = true;
        return result;
      }
      lineCells.push({ x, y, key });
    }
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }

  for (const { x: cx, y: cy, key } of lineCells) {
    const c = cover[key] as CoverType | undefined;
    if (c === "full") {
      result.contributingFullCells.push(key);
    } else if (c === "half") {
      const distTarget = Math.max(Math.abs(cx - tx), Math.abs(cy - ty));
      const distAttacker = Math.max(Math.abs(cx - ax), Math.abs(cy - ay));
      const tooFarFromTarget = distTarget > HALF_RANGE_TO_TARGET;
      const tooCloseToAttacker = distAttacker <= HALF_CANCEL_FROM_ATTACKER;
      if (tooFarFromTarget || tooCloseToAttacker) {
        result.ignoredHalfCells.push(key);
      } else {
        result.contributingHalfCells.push(key);
      }
    }
  }

  if (result.contributingFullCells.length > 0) result.cover = "full";
  else if (result.contributingHalfCells.length > 0) result.cover = "half";

  return result;
}
