import { TileSet, TileDefinition, MapTileData } from '../types/tileset';
import { MapCoverData, CoverType } from '../types/game';
import { getImageUrl } from '@/src/lib/utils';

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
      lookup[tile.id] = {
        ...tile,
        imagePath: getImageUrl(tile.imagePath),
      };
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

  // Ponto de Extração PVE (na avenida, fora da zona de deploy B)
  const extractKey = `${midX},5`;
  cover[extractKey] = 'extraction';

  return { tiles, cover };
}

/**
 * Gera um layout tático para Selva com Rio (Rio caudaloso, vaus, pontes, vegetação densa, rochas).
 */
export function generateJungleRiverPreset(options: {
  gridWidth: number;
  gridHeight: number;
}): {
  tiles: MapTileData;
  cover: MapCoverData;
} {
  const { gridWidth, gridHeight } = options;
  const tiles: MapTileData = {};
  const cover: MapCoverData = {};

  // 1. Chão base de floresta e trilhas de aproximação
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const key = `${x},${y}`;
      // Curva sinuosa do rio dividindo o mapa
      const riverCenterX = Math.round(10 + (y / gridHeight) * 20 + Math.sin(y * 0.3) * 3);
      const distToRiver = Math.abs(x - riverCenterX);

      if (distToRiver <= 2) {
        // Leito do rio
        // Travessia 1: Ponte de madeira no norte (y=12..14)
        if (y >= 12 && y <= 14) {
          tiles[key] = { tileId: 'wooden_bridge', rotation: 90 };
          cover[key] = 'none';
        } 
        // Travessia 2: Vau raso com pedras no sul (y=26..28)
        else if (y >= 26 && y <= 28) {
          tiles[key] = { tileId: 'shallow_water' };
          cover[key] = 'water';
        } 
        // Rio profundo normal
        else {
          tiles[key] = { tileId: 'river_water' };
          cover[key] = 'water';
        }
      } else {
        // Margens do rio
        // Trilhas de terra batida conectando as bases às travessias
        const isTrailToBridge = (y >= 11 && y <= 15) && (x < riverCenterX + 6 && x > riverCenterX - 6);
        const isTrailToFord = (y >= 25 && y <= 29) && (x < riverCenterX + 6 && x > riverCenterX - 6);
        const isLongitudinalTrailA = x >= 6 && x <= 8 && y >= 14 && y <= 35;
        const isLongitudinalTrailB = x >= 31 && x <= 33 && y >= 5 && y <= 26;

        if (isTrailToBridge || isTrailToFord || isLongitudinalTrailA || isLongitudinalTrailB) {
          tiles[key] = { tileId: 'dirt_trail' };
          cover[key] = 'none';
        } else {
          // Vegetação ribeirinha e mata
          const noise = (x * 17 + y * 23) % 11;
          if (distToRiver === 3 || distToRiver === 4) {
            // Margem imediata com folhagem densa
            if (noise < 6) {
              tiles[key] = { tileId: 'dense_foliage' };
              cover[key] = 'half';
            }
          } else if (x <= 1 || x >= gridWidth - 2 || y <= 1 || y >= gridHeight - 2) {
            // Bordas externas com mata impenetrável
            if (noise < 8) {
              tiles[key] = { tileId: 'jungle_thick' };
              cover[key] = 'wall';
            }
          } else if (noise === 10) {
            tiles[key] = { tileId: 'dense_foliage' };
            cover[key] = 'half';
          }
        }
      }
    }
  }

  // 2. Obstáculos e Coberturas Táticas Naturais
  // Rochedos vulcânicos estratégicos próximos ao rio
  const boulders = [
    { x: 12, y: 10 }, { x: 26, y: 16 }, { x: 16, y: 24 }, { x: 30, y: 30 },
    { x: 14, y: 32 }, { x: 28, y: 8 }, { x: 8, y: 20 }, { x: 34, y: 18 }
  ];
  boulders.forEach(({ x, y }) => {
    if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
      const k = `${x},${y}`;
      if (!cover[k] || cover[k] === 'none' || cover[k] === 'half') {
        tiles[k] = { tileId: 'rock_boulder' };
        cover[k] = 'full';
      }
    }
  });

  // Troncos caídos bloqueando passagens
  const fallenTrees = [
    { x: 10, y: 15, rot: 90 }, { x: 25, y: 22, rot: 0 },
    { x: 19, y: 30, rot: 90 }, { x: 32, y: 12, rot: 0 }
  ];
  fallenTrees.forEach(({ x, y, rot }) => {
    const k = `${x},${y}`;
    tiles[k] = { tileId: 'fallen_tree', rotation: rot as 0 | 90 };
    cover[k] = 'half';
  });

  // Sacos de areia / posto de vigia na cabeça da ponte
  tiles['18,11'] = { tileId: 'sandbags' };
  cover['18,11'] = 'half';
  tiles['18,15'] = { tileId: 'sandbags' };
  cover['18,15'] = 'half';

  // 3. Zonas de Deploy Obrigatórias (9 células contíguas 3x3 cada)
  // Equipe A: Margem Sudoeste (x: 6..8, y: 34..36)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const k = `${6 + dx},${34 + dy}`;
      cover[k] = 'deployA';
      tiles[k] = { tileId: 'dirt_trail' };
    }
  }

  // Equipe B: Margem Nordeste (x: 31..33, y: 4..6)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const k = `${31 + dx},${4 + dy}`;
      cover[k] = 'deployB';
      tiles[k] = { tileId: 'dirt_trail' };
    }
  }

  // 4. Pontos de Spawn PvE
  cover['3,10'] = 'spawn_pve';
  cover['36,30'] = 'spawn_pve';

  // 5. Ponto de Extração PvE (ao lado da ponte de madeira)
  cover['19,13'] = 'extraction';

  return { tiles, cover };
}

/**
 * Gera um layout tático para Acampamento na Floresta (Perímetro fortificado, tendas de comando, sacos de areia, paliçadas, depósitos).
 */
export function generateForestCampPreset(options: {
  gridWidth: number;
  gridHeight: number;
}): {
  tiles: MapTileData;
  cover: MapCoverData;
} {
  const { gridWidth, gridHeight } = options;
  const tiles: MapTileData = {};
  const cover: MapCoverData = {};

  // 1. Trilha de aproximação ao sul
  for (let y = 26; y < gridHeight; y++) {
    for (let x = 19; x <= 21; x++) {
      const key = `${x},${y}`;
      tiles[key] = { tileId: 'dirt_trail' };
      cover[key] = 'none';
    }
  }

  // 2. Perímetro Fortificado do Acampamento (x: 10..30, y: 6..26)
  const minX = 10, maxX = 30, minY = 6, maxY = 26;

  // Paredes de paliçada de madeira ao redor do perímetro
  for (let x = minX; x <= maxX; x++) {
    // Parede Norte
    const kN = `${x},${minY}`;
    tiles[kN] = { tileId: 'wooden_palisade' };
    cover[kN] = 'wall';

    // Parede Sul (com abertura no portão x: 19..21)
    const kS = `${x},${maxY}`;
    if (x < 19 || x > 21) {
      tiles[kS] = { tileId: 'wooden_palisade' };
      cover[kS] = 'wall';
    }
  }

  for (let y = minY; y <= maxY; y++) {
    // Parede Oeste
    const kW = `${minX},${y}`;
    tiles[kW] = { tileId: 'wooden_palisade' };
    cover[kW] = 'wall';

    // Parede Leste
    const kE = `${maxX},${y}`;
    tiles[kE] = { tileId: 'wooden_palisade' };
    cover[kE] = 'wall';
  }

  // Guaritas / Torres de vigia nos 4 cantos
  const towers = [
    { x: minX + 1, y: minY + 1 },
    { x: maxX - 1, y: minY + 1 },
    { x: minX + 1, y: maxY - 1 },
    { x: maxX - 1, y: maxY - 1 }
  ];
  towers.forEach(({ x, y }) => {
    const k = `${x},${y}`;
    tiles[k] = { tileId: 'watchtower_base' };
    cover[k] = 'full';
  });

  // Bunkers de sacos de areia ladeando o portão sul
  tiles['18,25'] = { tileId: 'sandbag_bunker' };
  cover['18,25'] = 'full';
  tiles['22,25'] = { tileId: 'sandbag_bunker' };
  cover['22,25'] = 'full';
  tiles['19,27'] = { tileId: 'sandbags' };
  cover['19,27'] = 'half';
  tiles['21,27'] = { tileId: 'sandbags' };
  cover['21,27'] = 'half';

  // 3. Interior do Acampamento
  // Tendas de Comando (noroeste e nordeste internos)
  // Tenda 1 (Oeste)
  for (let ty = 10; ty <= 12; ty++) {
    for (let tx = 13; tx <= 16; tx++) {
      const k = `${tx},${ty}`;
      tiles[k] = { tileId: 'military_tent' };
      cover[k] = 'wall';
    }
  }

  // Tenda 2 (Leste)
  for (let ty = 10; ty <= 12; ty++) {
    for (let tx = 24; tx <= 27; tx++) {
      const k = `${tx},${ty}`;
      tiles[k] = { tileId: 'military_tent' };
      cover[k] = 'wall';
    }
  }

  // Fogueira de acampamento central
  tiles['20,16'] = { tileId: 'campfire_site' };
  cover['20,16'] = 'half';

  // Depósitos de suprimentos (caixas e mantimentos)
  const supplies = [
    { x: 14, y: 17 }, { x: 15, y: 17 }, { x: 14, y: 18 },
    { x: 25, y: 17 }, { x: 26, y: 17 }, { x: 26, y: 18 },
    { x: 14, y: 22 }, { x: 26, y: 22 }
  ];
  supplies.forEach(({ x, y }) => {
    const k = `${x},${y}`;
    tiles[k] = { tileId: 'supply_cache' };
    cover[k] = 'half';
  });

  // 4. Bosque circundante (Mata densa, troncos e rochedos fora do acampamento)
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const isOutside = (x < minX - 1 || x > maxX + 1 || y < minY - 1 || y > maxY + 1);
      const isRoad = (y >= 26 && x >= 18 && x <= 22);
      if (isOutside && !isRoad) {
        const noise = (x * 13 + y * 29) % 17;
        const k = `${x},${y}`;
        if (noise === 0 || noise === 1) {
          tiles[k] = { tileId: 'jungle_thick' };
          cover[k] = 'wall';
        } else if (noise === 2 || noise === 3) {
          tiles[k] = { tileId: 'dense_foliage' };
          cover[k] = 'half';
        } else if (noise === 4) {
          tiles[k] = { tileId: 'rock_boulder' };
          cover[k] = 'full';
        } else if (noise === 5) {
          tiles[k] = { tileId: 'fallen_tree', rotation: 90 };
          cover[k] = 'half';
        }
      }
    }
  }

  // 5. Zonas de Deploy Obrigatórias (9 células contíguas 3x3 cada)
  // Equipe A (Força Invasora): Clareira florestal ao sul (x: 19..21, y: 35..37)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const k = `${19 + dx},${35 + dy}`;
      cover[k] = 'deployA';
      tiles[k] = { tileId: 'dirt_trail' };
    }
  }

  // Equipe B (Guarnição do Acampamento): Pátio interno (x: 19..21, y: 8..10)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const k = `${19 + dx},${8 + dy}`;
      cover[k] = 'deployB';
      tiles[k] = { tileId: 'dirt_trail' };
    }
  }

  // 6. Pontos de Spawn PvE
  cover['4,4'] = 'spawn_pve';
  cover['35,35'] = 'spawn_pve';

  // 7. Ponto de Extração PvE (antena / tenda de comando no acampamento)
  cover['20,7'] = 'extraction';

  return { tiles, cover };
}

