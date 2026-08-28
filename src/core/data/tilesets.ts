import { TileSet } from '../../types/tileset';
import urbanManifest from '../../../public/tiles/urban/manifest.json';

export const BUILTIN_TILESETS: TileSet[] = [
  urbanManifest as TileSet,
];

export const DEFAULT_TILESET_ID = 'urban_ruins';

