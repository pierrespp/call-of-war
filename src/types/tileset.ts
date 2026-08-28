import { CoverType } from './game';

export type TileCategory = 'floor' | 'wall' | 'cover' | 'liquid' | 'door' | 'window' | 'special';

export interface TileDefinition {
  id: string;                 // ex: "asphalt_plain", "sandbags_half", "car_sedan"
  name: string;               // Nome amigável para exibição no editor (ex: "Sacos de Areia")
  category: TileCategory;
  imagePath: string;          // ex: "/tiles/urban/asphalt.svg" ou PNG
  /**
   * Tipo de cobertura mecânica que este tile representa.
   * Reaproveita CoverType de src/types/game.ts.
   */
  coverType: CoverType;
  /** Variações visuais aleatórias do mesmo tipo mecânico */
  variants?: string[];
  /** Se true, o tile pode ser rotacionado (0, 90, 180, 270 graus) */
  rotatable?: boolean;
  /** Largura e altura em células do grid (padrão 1x1) */
  width?: number;
  height?: number;
  /** Descrição tática exibida no tooltip da paleta */
  description?: string;
}

export interface TileSet {
  id: string;                 // ex: "urban_ruins", "jungle_river", "camp"
  name: string;               // ex: "Urbano / Cidade em Ruínas"
  description?: string;
  tiles: TileDefinition[];
}

export interface MapCellTile {
  tileId: string;             // Referencia TileDefinition.id
  rotation?: 0 | 90 | 180 | 270;
  variantIndex?: number;
}

export interface MapTileData {
  [cellKey: string]: MapCellTile; // Formato "gx,gy"
}
