import { MapTileData } from '@/src/types/tileset';
import { MapCoverData } from '@/src/types/game';
import { MapGridSettings, DEFAULT_GRID_SETTINGS } from './constants';
import {
  generateUrbanTacticalPreset,
  generateJungleRiverPreset,
  generateForestCampPreset,
} from '@/src/utils/tilesetUtils';

export interface PredefinedMapPayload {
  mapId: string;
  gridSettings: MapGridSettings;
  tiles: MapTileData;
  cover: MapCoverData;
}

// Layout canônico para Cidade em Ruínas (40x40)
const cidadeRuinasPreset = generateUrbanTacticalPreset({
  gridWidth: 40,
  gridHeight: 40,
  addObstacles: true,
});

// Layout canônico para Selva com Rio (40x40)
const selvaRioPreset = generateJungleRiverPreset({
  gridWidth: 40,
  gridHeight: 40,
});

// Layout canônico para Acampamento na Floresta (40x40)
const acampamentoPreset = generateForestCampPreset({
  gridWidth: 40,
  gridHeight: 40,
});

export const CANONICAL_MAP_DATA: Record<string, PredefinedMapPayload> = {
  cidade_ruinas: {
    mapId: 'cidade_ruinas',
    gridSettings: { ...DEFAULT_GRID_SETTINGS },
    tiles: cidadeRuinasPreset.tiles,
    cover: cidadeRuinasPreset.cover,
  },
  selva_rio: {
    mapId: 'selva_rio',
    gridSettings: { ...DEFAULT_GRID_SETTINGS },
    tiles: selvaRioPreset.tiles,
    cover: selvaRioPreset.cover,
  },
  acampamento: {
    mapId: 'acampamento',
    gridSettings: { ...DEFAULT_GRID_SETTINGS },
    tiles: acampamentoPreset.tiles,
    cover: acampamentoPreset.cover,
  },
};

/**
 * Obtém os dados canônicos de um mapa padrão caso existam.
 */
export function getCanonicalMapData(mapId: string): PredefinedMapPayload | null {
  return CANONICAL_MAP_DATA[mapId] || null;
}
