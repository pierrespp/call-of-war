import { TileSet, TileDefinition, MapTileData } from '../types/tileset';
import { MapCoverData, CoverType } from '../types/game';

/**
 * Deriva o MapCoverData a partir do MapTileData e do conjunto de tilesets disponíveis.
 * Mantém total retrocompatibilidade com o sistema mecânico de combate, pathfinding e FOV.
 *
 * @param tileData Dados visuais do mapa (quais tiles estão em cada coordenada "gx,gy")
 * @param tileDefinitionsMap Mapa de lookup indexado pelo ID do tile
 * @param existingCoverData Coberturas especiais manuais (ex: deployA, deployB, spawn_pve, extraction)
 */
export function deriveCoverDataFromTiles(
  tileData: MapTileData,
  tileDefinitionsMap: Record<string, TileDefinition>,
  existingCoverData?: MapCoverData
): MapCoverData {
  const result: MapCoverData = { ...(existingCoverData || {}) };

  // Prioridade de gameplay: marcações especiais (deploy, spawns) não devem ser sobrescritas por 'none'
  const specialCovers: CoverType[] = ['deployA', 'deployB', 'spawn_pve', 'extraction'];

  for (const [cellKey, cellTile] of Object.entries(tileData)) {
    const tileDef = tileDefinitionsMap[cellTile.tileId];
    if (tileDef) {
      const currentCover = result[cellKey];
      // Se a célula já possui marcação especial de gameplay, mantemos
      if (currentCover && specialCovers.includes(currentCover)) {
        continue;
      }
      result[cellKey] = tileDef.coverType;
    }
  }

  return result;
}

/**
 * Cria um mapa de lookup rápido para definições de tiles a partir de uma lista de TileSets.
 */
export function createTileLookup(tilesets: TileSet[]): Record<string, TileDefinition> {
  const lookup: Record<string, TileDefinition> = {};
  for (const set of tilesets) {
    for (const tile of set.tiles) {
      lookup[tile.id] = tile;
    }
  }
  return lookup;
}

/**
 * Valida se um objeto JSON segue estritamente a especificação de um TileSet.
 */
export function validateTileSetManifest(manifest: unknown): { valid: boolean; error?: string; tileset?: TileSet } {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, error: 'Manifesto inválido ou não é um objeto JSON.' };
  }

  const candidate = manifest as Partial<TileSet>;
  if (!candidate.id || typeof candidate.id !== 'string') {
    return { valid: false, error: 'O tileset deve conter um campo "id" textual único.' };
  }
  if (!candidate.name || typeof candidate.name !== 'string') {
    return { valid: false, error: 'O tileset deve conter um campo "name" descritivo.' };
  }
  if (!Array.isArray(candidate.tiles) || candidate.tiles.length === 0) {
    return { valid: false, error: 'O tileset deve conter uma lista "tiles" com pelo menos 1 definição de sprite.' };
  }

  for (let i = 0; i < candidate.tiles.length; i++) {
    const t = candidate.tiles[i];
    if (!t.id || !t.name || !t.category || !t.imagePath || !t.coverType) {
      return { valid: false, error: `Tile na posição [${i}] está incompleto (faltam campos id, name, category, imagePath ou coverType).` };
    }
  }

  return { valid: true, tileset: manifest as TileSet };
}

export interface ProceduralUrbanOptions {
  gridWidth: number;
  gridHeight: number;
  avenueWidth?: number;
  buildingSize?: number;
  addObstacles?: boolean;
}

/**
 * Gera um layout tático urbano estruturado (Avenidas, Calçadas, Edifícios, Props e Zonas de Deploy).
 * Ideal para criar rapidamente bases de mapas operacionais em VTT.
 */
export function generateUrbanTacticalPreset(options: ProceduralUrbanOptions): {
  tiles: MapTileData;
  cover: MapCoverData;
} {
  const { gridWidth, gridHeight, addObstacles = true } = options;
  const tiles: MapTileData = {};
  const cover: MapCoverData = {};

  const midX = Math.floor(gridWidth / 2);

  // 1. Preenchimento de Asfalto e Calçadas estruturadas
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const key = `${x},${y}`;

      // Avenida central (6 faixas de largura)
      const isCentralAvenue = Math.abs(x - midX) <= 2;
      // Ruas transversais a cada 14 células
      const isCrossStreet = y % 14 >= 5 && y % 14 <= 7;

      if (isCentralAvenue || isCrossStreet) {
        // Asfalto liso ou trincado com variação orgânica
        const isCracked = ((x * 13 + y * 7) % 5 === 0);
        tiles[key] = { tileId: isCracked ? 'asphalt_cracked' : 'asphalt_clean' };
        cover[key] = 'none';
      } else {
        // Calçadas e Quarteirões
        const isSidewalkEdge = Math.abs(x - midX) === 3 || (y % 14 === 4 || y % 14 === 8);
        if (isSidewalkEdge) {
          tiles[key] = { tileId: 'sidewalk_tile' };
          cover[key] = 'none';
        } else {
          // Área construída/piso interno
          tiles[key] = { tileId: 'indoor_floor' };
          cover[key] = 'none';
        }
      }
    }
  }

  // 2. Paredes dos Quarteirões / Edifícios
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const isCentralAvenue = Math.abs(x - midX) <= 2;
      const isCrossStreet = y % 14 >= 5 && y % 14 <= 7;
      const isRoad = isCentralAvenue || isCrossStreet;

      if (!isRoad) {
        const isBlockPerimeter = (Math.abs(x - midX) === 4 || x === 1 || x === gridWidth - 2 || y % 14 === 3 || y % 14 === 9);
        if (isBlockPerimeter) {
          const key = `${x},${y}`;
          // Entradas / Portas nos edifícios a cada intervalo
          if (x % 5 === 2) {
            tiles[key] = { tileId: 'door_closed' };
            cover[key] = 'doorClose';
          } else if (y % 6 === 2) {
            tiles[key] = { tileId: 'window_frame' };
            cover[key] = 'window';
          } else {
            tiles[key] = { tileId: 'brick_wall' };
            cover[key] = 'wall';
          }
        }
      }
    }
  }

  // 3. Barreiras Táticas, Carros Destruídos e Caçambas
  if (addObstacles) {
    // Carros e barreiras na avenida
    for (let y = 6; y < gridHeight - 6; y += 8) {
      const carKey = `${midX - 1},${y}`;
      tiles[carKey] = { tileId: 'car_wreck', rotation: 90 };
      cover[carKey] = 'full';

      const barrierKey = `${midX + 1},${y + 3}`;
      tiles[barrierKey] = { tileId: 'concrete_barrier', rotation: 0 };
      cover[barrierKey] = 'half';
    }

    // Caixas de areia e caçambas nos becos
    for (let y = 8; y < gridHeight - 8; y += 12) {
      const sandbagKey1 = `2,${y}`;
      const sandbagKey2 = `${gridWidth - 3},${y}`;
      tiles[sandbagKey1] = { tileId: 'sandbags' };
      cover[sandbagKey1] = 'half';
      tiles[sandbagKey2] = { tileId: 'sandbags' };
      cover[sandbagKey2] = 'half';

      const dumpsterKey = `3,${y + 4}`;
      tiles[dumpsterKey] = { tileId: 'dumpster' };
      cover[dumpsterKey] = 'full';
    }

    // Poça de água em cruzamentos
    const puddleKey = `${midX},${Math.floor(gridHeight / 2)}`;
    tiles[puddleKey] = { tileId: 'puddle_water' };
    cover[puddleKey] = 'water';
  }

  // 4. Zonas de Deploy Obrigatórias (9 células contíguas 3x3 cada)
  // Equipe A: Base Sul (Início da Rua)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const x = midX - 1 + dx;
      const y = gridHeight - 4 + dy;
      const key = `${x},${y}`;
      cover[key] = 'deployA';
      tiles[key] = { tileId: 'asphalt_clean' };
    }
  }

  // Equipe B: Base Norte (Fim da Rua)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const x = midX - 1 + dx;
      const y = 1 + dy;
      const key = `${x},${y}`;
      cover[key] = 'deployB';
      tiles[key] = { tileId: 'asphalt_clean' };
    }
  }

  // Pontos de Spawn PVE nas laterais
  const pveSpawn1 = `2,${Math.floor(gridHeight / 2)}`;
  const pveSpawn2 = `${gridWidth - 3},${Math.floor(gridHeight / 2)}`;
  cover[pveSpawn1] = 'spawn_pve';
  cover[pveSpawn2] = 'spawn_pve';

  // Ponto de Extração PVE
  const extractKey = `${midX},2`;
  cover[extractKey] = 'extraction';

  return { tiles, cover };
}

