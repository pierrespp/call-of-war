import { Unit, Room } from "../types/game";

export function normalizeAngle(a: number) {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

export function distanceMeters(ax: number, ay: number, bx: number, by: number, cellSize: number, metersPerCell: number) {
  return (Math.hypot(bx - ax, by - ay) / cellSize) * metersPerCell;
}
