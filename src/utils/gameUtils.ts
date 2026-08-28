import { Unit, Room } from "../types/game";
import { CELL_SIZE, METERS_PER_CELL } from "../core/data/constants";

export function normalizeAngle(a: number) {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

export function angleDegBetween(ax: number, ay: number, bx: number, by: number): number {
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

export function distanceMeters(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cellSize: number = CELL_SIZE,
  metersPerCell: number = METERS_PER_CELL
) {
  return (Math.hypot(bx - ax, by - ay) / cellSize) * metersPerCell;
}

