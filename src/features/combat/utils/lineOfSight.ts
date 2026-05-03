import { CELL_SIZE } from '@/src/core/data/constants';
import { MapCoverData } from '@/src/types/game';

// Algoritmo de Bresenham para traçar linha entre dois pontos
export const getLineOfSight = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  coverData: MapCoverData
): { hasWall: boolean; cells: string[] } => {
  const cells: string[] = [];

  // Converter coordenadas de pixels para grid
  const gx0 = Math.floor(x0 / CELL_SIZE);
  const gy0 = Math.floor(y0 / CELL_SIZE);
  const gx1 = Math.floor(x1 / CELL_SIZE);
  const gy1 = Math.floor(y1 / CELL_SIZE);

  // Bresenham's line algorithm
  const dx = Math.abs(gx1 - gx0);
  const dy = Math.abs(gy1 - gy0);
  const sx = gx0 < gx1 ? 1 : -1;
  const sy = gy0 < gy1 ? 1 : -1;
  let err = dx - dy;

  let x = gx0;
  let y = gy0;

  while (true) {
    const cellKey = `${x},${y}`;
    cells.push(cellKey);

    // Verificar se há parede nesta célula
    if (coverData[cellKey] === 'wall') {
      return { hasWall: true, cells };
    }

    // Chegou ao destino
    if (x === gx1 && y === gy1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return { hasWall: false, cells };
};

// Verificar se há linha de visão clara entre dois pontos
export const hasLineOfSight = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  coverData: MapCoverData
): boolean => {
  const result = getLineOfSight(x0, y0, x1, y1, coverData);
  return !result.hasWall;
};
