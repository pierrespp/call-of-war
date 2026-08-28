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
  | 'Revólver'
  | 'Melee';
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
  hitBonus?: number;
  critBonus?: number;
  weaponClasses?: WeaponClass[];
  maxRange?: number;
  minRange?: number;
  requireProne?: boolean;
  isGrenade?: boolean;
  aoeRadius?: number; // em metros
  aoeDamage?: number;
}

export interface Skill {
  name: string;
  classRequired: string | string[];
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
  primaryWeapon: string | null;
  secondaryWeapon: string | null;
  attachments: string[];
  skills: string[];
  movedThisTurn: number;        // metres
  extraMoveMeters: number;      // bonus from Investida this turn
  shotsThisTurn: number;        // shots already fired this turn
  primaryAmmoInMag: number;            // current rounds in primary magazine
  secondaryAmmoInMag: number;          // current rounds in secondary magazine
  activeWeaponSlot: 'primary' | 'secondary';
  markedTargetId: string | null;     // Sniper marked target ID
  markedTargetExpiresAtTurn: number; // Turn number when the mark expires
  actions: UnitActions;
  stance: Stance;
  facingLockedThisTurn: boolean;
  isBot?: boolean;
  botType?: 'zombie' | 'tactical';
  // ── Habilidades ──────────────────────────────────────────────────────────
  guardShotsThisTurn?: number;       // Emboscada: contador de tiros de guarda no turno
  suppressedUntilTurn?: number;      // Fogo Supressivo: suprimido até este turno (inclusive)
  killedThisTurn?: boolean;          // Implacável: eliminou um inimigo neste turno
  hasSmokeGrenade?: boolean;         // Granada de Fumaça: possui granada de fumaça
  alertStatus?: 'dormant' | 'alert' | 'investigating'; // Silent Run: status da IA
  targetLocation?: { gx: number; gy: number };         // Silent Run: local para investigar som
}

export type CoverType = 'none' | 'half' | 'full' | 'wall' | 'deployA' | 'deployB' | 'water' | 'doorOpen' | 'doorClose' | 'window' | 'spawn_pve' | 'extraction' | 'car_alarm';

export interface MapCoverData {
  [cellKey: string]: CoverType;
}

export interface PendingGuardShot {
  id: string;
  guardUnitId: string;
  targetUnitId: string;
  guardTeam: 'A' | 'B';
}

export interface InterruptedMove {
  unitId: string;
  remainingPath: { gx: number; gy: number }[];
  ignoredGuards: string[];
}

export interface GameState {
  units: Record<string, Unit>;
  logs: LogEntry[];
  mapId: string;
  turnNumber: number;
  gameMode?: GameMode;
  difficulty?: Difficulty;
  pveNoiseLevel?: number;
  tacticalState?: {
    lkp?: { gx: number, gy: number } | null;
    patrolPoints?: Record<string, { gx: number, gy: number }[]>;
  };
  pveState?: {
    targetDP: number;
    currentDP: number;
  };
  recentlyEliminated?: Record<string, {
    unitSnapshot: any;
    x: number;
    y: number;
    turn: number;
    team: string;
  }>;
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
  primaryWeapon: string | null;
  secondaryWeapon: string | null;
  attachments: string[];
  skills: string[];
  rotation?: number;
}

export type RoomPhase = 'draft' | 'deploy' | 'active';

export type GameMode = 'pvp' | 'pve-zombies' | 'pve-tactical';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface RoomPlayer {
  name: string;
  token: string;
}

export interface Room {
  id: string;
  players: { A?: RoomPlayer; A2?: RoomPlayer; A3?: RoomPlayer; A4?: RoomPlayer; B?: RoomPlayer };
  gameState: GameState;
  currentTurn: 'A' | 'B';
  phase: RoomPhase;
  draft: DraftState;
  deploy: DeployState;
  coverData: Record<string, MapCoverData>;
  pendingGuardShots: PendingGuardShot[];
  interruptedMove?: InterruptedMove;
  createdAt: number;
  updatedAt?: number;
  winner?: 'A' | 'B' | null;
}

export interface DraftState {
  selectedMap: string;
  gameMode?: GameMode;
  difficulty?: Difficulty;
  pveZombieCount?: number;
  pveTeamName?: string;
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
// A persisted AI-generated map. These live in a separate registry from the
// built-in MAPS constant — they appear alongside the defaults in the picker
// but are stored server-side and listed dynamically.
// A "draft" usually refers to the design state before final baking (e.g. prompt, painted legend).
// In our current code, this is used for map generation persistence.
export interface AIMapDraft {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  coverData: MapCoverData;
  userPrompt: string;
  updatedAt: number;
}

// A persisted AI-generated map record. These appear alongside the defaults in the picker.
export interface AIMapListItem {
  id: string;
  name: string;
  /** Public URL or path that the client can render via <img>/CSS background. */
  imagePath: string;
  gridWidth: number;
  gridHeight: number;
  /** Created-at timestamp (ms since epoch). */
  createdAt: number;
}

export interface AIMapSaveRequest {
  name: string;
  imageBase64: string;
  mimeType: string;
  coverData: MapCoverData;
  gridWidth: number;
  gridHeight: number;
}

export interface AIMapSaveResult {
  mapId: string;
  imagePath: string;
}
