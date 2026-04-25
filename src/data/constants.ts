import { UnitClass, Weapon, Armor, Attachment, Skill } from '../types/game';

export const CELL_SIZE = 50;
export const METERS_PER_CELL = 1.5;

// Escala e Espaço Tático (em metros)
export const SCALE = {
  UNIDADE_FUNDAMENTAL: 1,
  JOGAR_SE_AO_CHAO: 3,
  DESVIO_MORTEIRO: 3,
  MOVIMENTO_BASE: 10,
  INVESTIDA: 20,
  ALCANCE_CURTO: 20,
  RAIO_VISAO_BASE: 40,
  ALCANCE_MEDIO: 40,
  ALCANCE_LONGO: 60,
};

export const CLASSES: Record<string, UnitClass> = {
  'USA_Assalto': { id: 'USA_Assalto', faction: 'USA', name: 'Assalto', points: 10, hp: 6, hit: 80, critical: 20, movement: 10.5 },
  'USA_Suporte': { id: 'USA_Suporte', faction: 'USA', name: 'Suporte', points: 15, hp: 5, hit: 70, critical: 20, movement: 10.5 },
  'USA_Médico': { id: 'USA_Médico', faction: 'USA', name: 'Médico', points: 15, hp: 5, hit: 60, critical: 20, movement: 10.5 },
  'USA_Granadeiro': { id: 'USA_Granadeiro', faction: 'USA', name: 'Granadeiro', points: 15, hp: 5, hit: 70, critical: 20, movement: 10.5 },
  'USA_Sniper': { id: 'USA_Sniper', faction: 'USA', name: 'Sniper', points: 20, hp: 4, hit: 90, critical: 20, movement: 10.5 },
  
  'TR_Assalto': { id: 'TR_Assalto', faction: 'TR', name: 'Assalto', points: 10, hp: 6, hit: 80, critical: 20, movement: 10.5 },
  'TR_Suporte': { id: 'TR_Suporte', faction: 'TR', name: 'Suporte', points: 15, hp: 5, hit: 70, critical: 20, movement: 10.5 },
  'TR_Médico': { id: 'TR_Médico', faction: 'TR', name: 'Médico', points: 15, hp: 5, hit: 60, critical: 20, movement: 10.5 },
  'TR_Granadeiro': { id: 'TR_Granadeiro', faction: 'TR', name: 'Granadeiro', points: 15, hp: 5, hit: 70, critical: 20, movement: 10.5 },
  'TR_Sniper': { id: 'TR_Sniper', faction: 'TR', name: 'Sniper', points: 20, hp: 4, hit: 90, critical: 20, movement: 10.5 },
};

export const WEAPONS: Record<string, Weapon> = {
  // ── Submetralhadoras ──
  'MP5K':         { name: 'MP5K',         weaponClass: 'Submetralhadora', weaponFaction: 'USA',   allowedClasses: ['Assalto', 'Médico'],     points: 2,  damage: 4, critical: 5,  criticalChance: 0,  shots: 3, reload: 2, range: 'Curto', slots: 2 },
  'Uzi':          { name: 'Uzi',          weaponClass: 'Submetralhadora', weaponFaction: 'TR',    allowedClasses: ['Assalto', 'Médico'],     points: 2,  damage: 4, critical: 5,  criticalChance: 0,  shots: 3, reload: 2, range: 'Curto', slots: 2 },
  'VZ Skorpion':  { name: 'VZ Skorpion',  weaponClass: 'Submetralhadora', weaponFaction: 'TR',    allowedClasses: ['Assalto', 'Médico'],     points: 1,  damage: 4, critical: 5,  criticalChance: 0,  shots: 2, reload: 2, range: 'Curto', slots: 2 },

  // ── Fuzis ──
  'AK-47':        { name: 'AK-47',        weaponClass: 'Fuzil',           weaponFaction: 'TR',    allowedClasses: ['Assalto'],               points: 3,  damage: 5, critical: 7,  criticalChance: 10, shots: 3, reload: 3, range: 'Médio', slots: 3 },
  'M16':          { name: 'M16',          weaponClass: 'Fuzil',           weaponFaction: 'USA',   allowedClasses: ['Assalto'],               points: 4,  damage: 5, critical: 7,  criticalChance: 10, shots: 3, reload: 3, range: 'Médio', slots: 3 },
  'M4A1':         { name: 'M4A1',         weaponClass: 'Fuzil',           weaponFaction: 'USA',   allowedClasses: ['Assalto'],               points: 5,  damage: 5, critical: 7,  criticalChance: 10, shots: 3, reload: 3, range: 'Médio', slots: 3 },
  'SCAR-L':       { name: 'SCAR-L',       weaponClass: 'Fuzil',           weaponFaction: 'USA',   allowedClasses: ['Assalto'],               points: 4,  damage: 5, critical: 7,  criticalChance: 10, shots: 3, reload: 3, range: 'Médio', slots: 3 },

  // ── Escopetas ──
  'Remington M870': { name: 'Remington M870', weaponClass: 'Escopeta',    weaponFaction: 'USA',   allowedClasses: ['Assalto', 'Granadeiro'], points: 3,  damage: 6, critical: 8,  criticalChance: 15, shots: 2, reload: 4, range: 'Curto', slots: 2 },
  'SPAS 12':      { name: 'SPAS 12',      weaponClass: 'Escopeta',        weaponFaction: 'TR',    allowedClasses: ['Assalto', 'Granadeiro'], points: 3,  damage: 6, critical: 8,  criticalChance: 15, shots: 2, reload: 4, range: 'Curto', slots: 2 },
  'SPAS 15':      { name: 'SPAS 15',      weaponClass: 'Escopeta',        weaponFaction: 'USA',   allowedClasses: ['Assalto', 'Granadeiro'], points: 4,  damage: 6, critical: 8,  criticalChance: 15, shots: 4, reload: 4, range: 'Curto', slots: 2 },
  'Saiga 12':     { name: 'Saiga 12',     weaponClass: 'Escopeta',        weaponFaction: 'TR',    allowedClasses: ['Assalto', 'Granadeiro'], points: 4,  damage: 6, critical: 8,  criticalChance: 20, shots: 4, reload: 4, range: 'Curto', slots: 2 },

  // ── Rifles ──
  'Barret M82':   { name: 'Barret M82',   weaponClass: 'Rifle',           weaponFaction: 'USA',   allowedClasses: ['Sniper'],                points: 10, damage: 8, critical: 10, criticalChance: 30, shots: 2, reload: 1, range: 'Longo', slots: 3 },
  'SVD-Dragunov': { name: 'SVD-Dragunov', weaponClass: 'Rifle',           weaponFaction: 'TR',    allowedClasses: ['Sniper'],                points: 5,  damage: 6, critical: 7,  criticalChance: 20, shots: 2, reload: 2, range: 'Longo', slots: 3 },
  'M14':          { name: 'M14',          weaponClass: 'Rifle',           weaponFaction: 'USA',   allowedClasses: ['Sniper'],                points: 5,  damage: 5, critical: 7,  criticalChance: 15, shots: 2, reload: 3, range: 'Longo', slots: 3 },

  // ── Metralhadoras ──
  'M60':          { name: 'M60',          weaponClass: 'Metralhadora',    weaponFaction: 'USA',   allowedClasses: ['Suporte'],               points: 4,  damage: 4, critical: 7,  criticalChance: 10, shots: 5, reload: 2, range: 'Médio', slots: 2 },
  'M249':         { name: 'M249',         weaponClass: 'Metralhadora',    weaponFaction: 'USA',   allowedClasses: ['Suporte'],               points: 3,  damage: 4, critical: 6,  criticalChance: 10, shots: 5, reload: 3, range: 'Médio', slots: 2 },
  'RPK':          { name: 'RPK',          weaponClass: 'Metralhadora',    weaponFaction: 'TR',    allowedClasses: ['Suporte'],               points: 3,  damage: 4, critical: 6,  criticalChance: 10, shots: 5, reload: 3, range: 'Médio', slots: 2 },
  'PKM':          { name: 'PKM',          weaponClass: 'Metralhadora',    weaponFaction: 'TR',    allowedClasses: ['Suporte'],               points: 4,  damage: 4, critical: 6,  criticalChance: 10, shots: 5, reload: 2, range: 'Médio', slots: 2 },

  // ── Lançadores de Granadas ──
  'M79':          { name: 'M79',          weaponClass: 'Lançador',        weaponFaction: 'TR',    allowedClasses: ['Granadeiro'],            points: 4,  damage: 6, critical: 8,  criticalChance: 0,  shots: 1, reload: 0, range: 'Médio', slots: 1 },
  'Morteiro':     { name: 'Morteiro',     weaponClass: 'Lançador',        weaponFaction: 'TR',    allowedClasses: ['Granadeiro'],            points: 6,  damage: 6, critical: 8,  criticalChance: 0,  shots: 1, reload: 0, range: 'Longo', slots: 1 },
  'M32':          { name: 'M32',          weaponClass: 'Lançador',        weaponFaction: 'USA',   allowedClasses: ['Granadeiro'],            points: 10, damage: 6, critical: 8,  criticalChance: 0,  shots: 3, reload: 0, range: 'Curto', slots: 1 },
  'M320':         { name: 'M320',         weaponClass: 'Lançador',        weaponFaction: 'USA',   allowedClasses: ['Granadeiro'],            points: 3,  damage: 5, critical: 7,  criticalChance: 0,  shots: 1, reload: 0, range: 'Curto', slots: 1 },

  // ── Pistolas ──
  'Colt 1911':    { name: 'Colt 1911',    weaponClass: 'Pistola',         weaponFaction: 'Todos', allowedClasses: [],                        points: 1,  damage: 2, critical: 4,  criticalChance: 5,  shots: 2, reload: 4, range: 'Curto', slots: 1 },
  'Desert Eagle': { name: 'Desert Eagle', weaponClass: 'Pistola',         weaponFaction: 'Todos', allowedClasses: [],                        points: 2,  damage: 3, critical: 5,  criticalChance: 10, shots: 2, reload: 4, range: 'Curto', slots: 1 },
  'Glock 18':     { name: 'Glock 18',     weaponClass: 'Pistola',         weaponFaction: 'Todos', allowedClasses: [],                        points: 2,  damage: 2, critical: 4,  criticalChance: 0,  shots: 3, reload: 4, range: 'Curto', slots: 1 },

  // ── Revólveres ──
  'Tauros PT58 HC': { name: 'Tauros PT58 HC', weaponClass: 'Revólver',    weaponFaction: 'Todos', allowedClasses: [],                        points: 1,  damage: 2, critical: 3,  criticalChance: 0,  shots: 2, reload: 4, range: 'Curto', slots: 1 },
  'Magnum 357':   { name: 'Magnum 357',   weaponClass: 'Revólver',        weaponFaction: 'Todos', allowedClasses: [],                        points: 2,  damage: 3, critical: 4,  criticalChance: 0,  shots: 2, reload: 4, range: 'Curto', slots: 1 },
  'S&W M640':     { name: 'S&W M640',     weaponClass: 'Revólver',        weaponFaction: 'Todos', allowedClasses: [],                        points: 2,  damage: 3, critical: 4,  criticalChance: 0,  shots: 2, reload: 4, range: 'Curto', slots: 1 },
};

export const ARMORS: Record<string, Armor> = {
  'Tático Leve': { name: 'Tático Leve', points: 2, slots: 2, movePenal: 1, reduction: 2 },
  'Moderado': { name: 'Moderado', points: 2, slots: 3, movePenal: 2, reduction: 3 },
  'Pesado': { name: 'Pesado', points: 3, slots: 4, movePenal: 3, reduction: 4 },
  'Cinto Tático': { name: 'Cinto Tático', points: 0, slots: 2, movePenal: 0, reduction: 1 },
};

export const ATTACHMENTS: Record<string, Attachment> = {
  'Objetiva': { name: 'Objetiva', points: 2, description: '+20% hit, +10% crit, proibido em Curta (Rifle/Fuzil)' },
  'Red Dot': { name: 'Red Dot', points: 2, description: '+10% hit até 40m (Fuzil/Sub)' },
  'Grip': { name: 'Grip', points: 2, description: '+5% hit (Fuzil/Sub)' },
  'Bi-pé': { name: 'Bi-pé', points: 2, description: '+5% crit se deitado (Rifle/Fuzil)' },
};

export const SKILLS: Record<string, Skill> = {
  'Linha de Frente': { name: 'Linha de Frente', classRequired: 'Assalto', points: 1, description: 'Atirar em qualquer ponto do movimento.' },
  'Sexto Sentido': { name: 'Sexto Sentido', classRequired: 'Assalto', points: 1, description: 'Se inimigo errar tiro pelas costas, mover 3m livre.' },
  'Emboscada': { name: 'Emboscada', classRequired: 'Suporte', points: 3, description: 'Na Guarda, atirar em CADA inimigo que entrar no FOV.' },
  'Médico de Combate': { name: 'Médico de Combate', classRequired: 'Médico', points: 1, description: '+2 cura por kit.' },
  'Disparo Compensado': { name: 'Disparo Compensado', classRequired: 'Sniper', points: 1, description: '+10m alcance do rifle.' },
};

export interface GameMap {
  id: string;
  name: string;
  imagePath: string;
  gridWidth: number;
  gridHeight: number;
}

/**
 * Per-map visual grid settings used by the Map Editor.
 *
 * - `cellSize`: visual size in pixels of a single grid cell while editing
 *   (defaults to {@link CELL_SIZE} = 50). Larger values make the grid look
 *   bigger / less dense; smaller values pack more cells into the same view.
 * - `opacity`: opacity of the grid line overlay (0–1), default 0.6.
 *
 * Game logic (positions, deploy, battle) always uses the canonical
 * {@link CELL_SIZE} constant; these settings only affect the editor preview.
 */
export interface MapGridSettings {
  cellSize: number;
  opacity: number;
}

export const DEFAULT_GRID_SETTINGS: MapGridSettings = {
  cellSize: CELL_SIZE,
  opacity: 0.6,
};

export const MAPS: Record<string, GameMap> = {
  'cidade_ruinas': { id: 'cidade_ruinas', name: 'Cidade em Ruínas', imagePath: '/maps/cidade_ruinas.jpg', gridWidth: 40, gridHeight: 40 },
  'selva_rio': { id: 'selva_rio', name: 'Selva com Rio', imagePath: '/maps/selva_rio.jpg', gridWidth: 40, gridHeight: 40 },
  'acampamento': { id: 'acampamento', name: 'Acampamento na Floresta', imagePath: '/maps/acampamento.jpg', gridWidth: 40, gridHeight: 40 },
};

