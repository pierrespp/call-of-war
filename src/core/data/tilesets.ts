import { TileSet } from '../../types/tileset';
import { URBAN_TILESET_DATA } from './urbanManifest';
import { getImageUrl } from '@/src/lib/utils';

const normalizeTileSetPaths = (manifest: TileSet): TileSet => ({
  ...manifest,
  tiles: manifest.tiles.map(tile => ({
    ...tile,
    imagePath: getImageUrl(tile.imagePath),
  })),
});

export const BUILTIN_TILESETS: TileSet[] = [
  normalizeTileSetPaths(URBAN_TILESET_DATA),
];

export const DEFAULT_TILESET_ID = 'urban_ruins';

