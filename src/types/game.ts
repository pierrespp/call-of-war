export type RangeCategory = 'Curto' | 'Médio' | 'Longo';
export type WeaponFaction = 'USA' | 'TR' | 'Todos';
export type WeaponClass =
  | 'Submetralhadora'
  | 'Fuzil'
  | 'Escopeta'
  | 'Rifle'
  | 'Metralhadora'
  | 'Lançador'
  | 'Pistola'
  | 'Revólver';
export type Stance = 'standing' | 'guard' | 'prone';

export interface Weapon {
  name: string;
  weaponClass: WeaponClass;
  weaponFaction: WeaponFaction;
  allowedClasses: string[]; // soldier class names that can equip; empty = all
  points: number;
  damage: number;
  critical: number;
  criticalChance: number; // 0-100 base chance
  shots: number;          // shots per turn
  reload: number;         // magazine capacity (shots before reload required)
  range: RangeCategory;
  slots: number;          // number of accessory slots this weapon supports
}

export interface UnitClass {
  id: string;
  name: string;
  points: number;
  hp: number;
  hit: number;
  critical: number;       // base crit modifier from soldier class (added to weapon's chance)
  movement: number;
  faction?: string;
}

export interface Armor {
  name: string;
  points: number;
  slots: number;
  movePenal: number;
  reduction: number;
}

export interface Attachment {
  name: string;
  points: number;
  description: string;
}

export interface Skill {
  name: string;
  classRequired: string;
  points: number;
  description: string;
}

export interface UnitActions {
  move: boolean;
  intervention: boolean;
  tactical: boolean;
  chargeUsed: boolean; // Investida already used this turn
}

export interface Unit {
  id: string;
  name: string;
  team: string;
  className: string;
  x: number;
  y: number;
  rotation: number;
  hp: number;
  armorName: string | null;
  weaponName: string | null;
  attachments: string[];
  skills: string[];
  movedThisTurn: number;        // metres
  extraMoveMeters: number;      // bonus from Investida this turn
  shotsThisTurn: number;        // shots already fired this turn
  ammoInMag: number;            // current rounds in magazine
  actions: UnitActions;
  stance: Stance;
  guardWatchAngle: number | null;
  facingLockedThisTurn: boolean;
}

export type CoverType = 'none' | 'half' | 'full' | 'wall' | 'deployA' | 'deployB' | 'water';

export interface MapCoverData {
  [cellKey: string]: CoverType;
}

export interface PendingGuardShot {
  id: string;
  guardUnitId: string;
  targetUnitId: string;
  guardTeam: 'A' | 'B';
}

export interface GameState {
  units: Record<string, Unit>;
  logs: LogEntry[];
  mapId: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
}

// ─── Multiplayer flow (Draft / Deploy) ──────────────────────────────────────
// A "draft" unit is what the player builds in the team-builder before deploy:
// it has a className/weapon/armor/etc. but no x/y position yet.
export interface DraftUnit {
  id: string;
  name: string;
  className: string;
  armorName: string | null;
  weaponName: string | null;
  attachments: string[];
  skills: string[];
  rotation?: number;
}

export type RoomPhase = 'draft' | 'deploy' | 'active';

export interface DraftState {
  selectedMap: string;
  teams: { A: DraftUnit[]; B: DraftUnit[] };
  ready: { A: boolean; B: boolean };
}

// A deploy zone is a contiguous group of cells of color 'deployA' or 'deployB'.
// Identified by the smallest (gx,gy) cell key in the zone (lexicographic).
export interface DeployZone {
  id: string;          // e.g. "12,8"  (smallest cell key in zone)
  team: 'A' | 'B';
  cells: string[];     // all cell keys belonging to this zone
}

export interface DeployState {
  chosenZone: { A: string | null; B: string | null };
  // map of unitId -> { gridX, gridY }  (centre-of-cell positions)
  positions: { A: Record<string, { gx: number; gy: number }>; B: Record<string, { gx: number; gy: number }> };
  ready: { A: boolean; B: boolean };
}

// ─── AI Map Generator ───────────────────────────────────────────────────────
// Request payload sent from the client to the server when generating a new map
// from a painted legend canvas.
export interface AIMapGenerationRequest {
  /** Base64-encoded legend image (PNG, may include `data:image/...;base64,` prefix). */
  legendImage: string;
  /** Free-form thematic context the user typed (e.g. "deserto destruído"). */
  userPrompt: string;
  gridWidth: number;
  gridHeight: number;
}

// Result returned by the server after a successful generation. The image is
// base64-encoded so the client can preview it before deciding to save.
export interface AIMapGenerationResult {
  /** Base64-encoded generated map image (no data-URI prefix). */
  generatedImage: string;
  /** Mime type of `generatedImage` (typically "image/png"). */
  mimeType: string;
  /** Cover detected per cell by Gemini Vision. Cells with "none" are omitted. */
  detectedCover: MapCoverData;
  /** Server-side timestamp (ms since epoch). */
  timestamp: number;
}

// A persisted AI-generated map. These live in a separate registry from the
// built-in MAPS constant — they appear alongside the defaults in the picker
// but are stored server-side and listed dynamically.
export interface AIMapDraft {
  id: string;
  name: string;
  /** Public URL or path that the client can render via <img>/CSS background. */
  imagePath: string;
  coverData: MapCoverData;
  gridWidth: number;
  gridHeight: number;
  /** Created-at timestamp (ms since epoch). */
  createdAt: number;
}
