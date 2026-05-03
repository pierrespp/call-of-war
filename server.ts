import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import fs from "fs";
import { put } from "@vercel/blob";

import {
  CLASSES,
  WEAPONS,
  ARMORS,
  ATTACHMENTS,
  SKILLS,
  MAPS,
  CELL_SIZE,
  METERS_PER_CELL,
  SCALE,
  MapGridSettings,
  DEFAULT_GRID_SETTINGS,
} from "./src/core/data/constants";
import {
  GameState,
  Unit,
  PendingGuardShot,
  DraftUnit,
  RoomPhase,
  DraftState,
  DeployState,
  CoverType,
  InterruptedMove,
  Room,
  RoomPlayer,
} from "./src/types/game";
import {
  findDeployZones,
  validatePath,
  pathCostMeters,
  defaultDeployZones,
} from "./src/features/combat/utils/pathfinding";
import { computeShotCover } from "./src/features/combat/utils/cover";
import { db } from "./src/lib/firebase-server";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import multer from "multer";
import { getMissionEngine } from "./src/missions";
import { hasLineOfSight } from "./src/features/combat/utils/cover";
import { normalizeAngle, distanceMeters } from "./src/utils/gameUtils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Persistent storage for global map cover data (Map Editor) ───────────────

async function loadGlobalCoverData(): Promise<
  Record<string, Record<string, string>>
> {
  const out: Record<string, Record<string, string>> = {};

  // Try Firestore first
  try {
    const col = collection(db, "map-covers");
    const snap = await getDocs(col);
    snap.docs.forEach((d) => {
      out[d.id] = d.data() as Record<string, string>;
    });
  } catch (err) {
    console.error("⚠️ Falha ao ler coberturas do Firestore:", err);
  }

  return out;
}

async function saveMapCover(mapId: string, data: Record<string, string>) {
  // Update global cache
  globalCoverData[mapId] = data;

  // Save to Firestore (specific cover collection)
  try {
    await setDoc(doc(db, "map-covers", mapId), data);
  } catch (err) {
    console.error(`⚠️ Falha ao salvar cobertura no Firestore (${mapId}):`, err);
  }

  // If it's an AI map, also update its metadata record to keep them in sync
  if (mapId.startsWith("ai_")) {
    try {
      const records = await loadAIMapRecords();
      const record = records.find((r) => r.id === mapId);
      if (record) {
        record.coverData = data;
        await persistAIMapRecord(record);
      }
    } catch (err) {
      console.error(
        `⚠️ Falha ao sincronizar registro de metadados do mapa IA (${mapId}):`,
        err,
      );
    }
  }
}

// ── Persistent storage for per-map grid display settings (Map Editor) ──────

async function loadGlobalGridSettings(): Promise<
  Record<string, MapGridSettings>
> {
  const out: Record<string, MapGridSettings> = {};

  // Try Firestore
  try {
    const col = collection(db, "map-grid-settings");
    const snap = await getDocs(col);
    snap.docs.forEach((d) => {
      out[d.id] = d.data() as MapGridSettings;
    });
  } catch (err) {
    console.error("⚠️ Falha ao ler grid settings do Firestore:", err);
  }

  return out;
}

async function saveMapGridSettings(mapId: string, data: MapGridSettings) {
  // Save to Firestore
  try {
    await setDoc(doc(db, "map-grid-settings", mapId), data);
  } catch (err) {
    console.error(
      `⚠️ Falha ao salvar grid settings no Firestore (${mapId}):`,
      err,
    );
  }
}

/** Lightweight runtime check so a malformed POST body doesn't corrupt state. */
function isValidGridSettings(x: unknown): x is MapGridSettings {
  if (!x || typeof x !== "object") return false;
  const g = x as Record<string, unknown>;
  return (
    typeof g.cellSize === "number" &&
    g.cellSize >= 10 &&
    g.cellSize <= 400 &&
    Number.isFinite(g.cellSize) &&
    typeof g.opacity === "number" &&
    g.opacity >= 0 &&
    g.opacity <= 1 &&
    Number.isFinite(g.opacity)
  );
}


/**
 * Check whether the battle ended (one team has zero living units).
 * Idempotent — safe to call after every shot. Sets room.winner once and adds a final log.
 */
function checkWinner(room: Room) {
  if (room.phase !== "active" || room.winner) return;
  const units = Object.values(room.gameState.units);
  // Only count once both teams have actually deployed at least one unit
  // (avoids false-positives during the brief moment before buildBattleUnits runs).
  const hasA = units.some((u) => u.team === "A");
  const hasB = units.some((u) => u.team === "B");
  if (units.length === 0) return;
  if (!hasA || !hasB) {
    const winner: "A" | "B" = hasA ? "A" : "B";
    room.winner = winner;
    const winnerName = room.players[winner]?.name;
    pushLog(
      room,
      `🏆 Equipe ${winner}${winnerName ? ` (${winnerName})` : ""} venceu — todas as unidades adversárias foram eliminadas.`,
    );
  }
}

const rooms: Record<string, Room> = {};
const globalCoverData: Record<string, Record<string, string>> = {};
const globalGridSettings: Record<string, MapGridSettings> = {};

async function loadRoom(roomId: string): Promise<Room | null> {
  if (rooms[roomId]) return rooms[roomId];
  try {
    const snap = await getDoc(doc(db, "rooms", roomId));
    if (snap.exists()) {
      rooms[roomId] = snap.data() as Room;
      return rooms[roomId];
    }
  } catch (err) {
    console.error(`Falha ao ler sala ${roomId} do Firestore:`, err);
  }
  return null;
}

async function saveRoom(room: Room) {
  // Sync to Firestore
  try {
    // Save the entire room object including tokens.
    // Secure apps would split tokens into a subcollection, but per requirements "todos editam tudo" is fine for now.
    room.updatedAt = Date.now();
    await setDoc(doc(db, "rooms", room.id), room);
  } catch (err) {
    console.error(`Falha ao salvar sala ${room.id} no Firestore:`, err);
  }
}

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function emptyGameState(): GameState {
  return {
    units: {},
    logs: [
      {
        id: randomUUID(),
        timestamp: Date.now(),
        message: "Sala criada. Aguardando início da partida.",
      },
    ],
    mapId: "",
    turnNumber: 1,
  };
}

function emptyDraft(): DraftState {
  return {
    selectedMap: "",
    gameMode: "pvp",
    difficulty: "normal",
    pveZombieCount: 3,
    teams: { A: [], B: [] },
    ready: { A: false, B: false },
  };
}
function emptyDeploy(): DeployState {
  return {
    chosenZone: { A: null, B: null },
    positions: { A: {}, B: {} },
    ready: { A: false, B: false },
  };
}

function pushLog(room: Room, message: string) {
  room.gameState.logs.push({
    id: randomUUID(),
    timestamp: Date.now(),
    message,
  });
}

function ensureUnitDefaults(u: any): Unit {
  const pWeapon = u.primaryWeapon ? WEAPONS[u.primaryWeapon] : null;
  const sWeapon = u.secondaryWeapon ? WEAPONS[u.secondaryWeapon] : null;
  return {
    ...u,
    activeWeaponSlot: u.activeWeaponSlot ?? 'primary',
    movedThisTurn: u.movedThisTurn ?? 0,
    extraMoveMeters: u.extraMoveMeters ?? 0,
    shotsThisTurn: u.shotsThisTurn ?? 0,
    primaryAmmoInMag: u.primaryAmmoInMag ?? pWeapon?.reload ?? 0,
    secondaryAmmoInMag: u.secondaryAmmoInMag ?? sWeapon?.reload ?? 0,
    markedTargetId: u.markedTargetId ?? null,
    markedTargetExpiresAtTurn: u.markedTargetExpiresAtTurn ?? 0,
    actions: u.actions ?? {
      move: true,
      intervention: true,
      tactical: true,
      chargeUsed: false,
    },
    stance: u.stance ?? "standing",
    facingLockedThisTurn: u.facingLockedThisTurn ?? false,
  };
}


function isInVisionCone(observer: Unit, target: Unit, room: Room): boolean {
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  const distCells = Math.sqrt(dx * dx + dy * dy) / 50;

  if (distCells > 10) return false; // 15m limit for dormant

  // Line of sight check (walls)
  const mapCover = getRoomCover(room, room.gameState.mapId);
  if (!hasLineOfSight(observer.x, observer.y, target.x, target.y, mapCover)) {
    return false;
  }

  // Angle check (90 degree cone)
  const angleToTarget = Math.atan2(dy, dx) * (180 / Math.PI);
  let diff = Math.abs(normalizeAngle(angleToTarget - observer.rotation));
  return diff <= 45;
}


function getRoomCover(room: Room, mapId: string): Record<string, string> {
  const editorData = {
    ...(globalCoverData[mapId] || {}),
    ...(room.coverData[mapId] || {}),
  };
  // If the editor never added any deploy zones for this map, fall back to factory defaults
  // so that a fresh install can play immediately without opening the editor first.
  const hasAnyDeploy = Object.values(editorData).some(
    (v) => v === "deployA" || v === "deployB",
  );
  if (!hasAnyDeploy) {
    const mission = getMissionEngine(mapId);
    if (mission) {
      return mission.generateCover();
    }
    const map = MAPS[mapId];
    if (map) {
      const defaults = defaultDeployZones(map.gridWidth, map.gridHeight);
      // Editor data wins over defaults (so painting a wall on top of a default zone removes it).
      return { ...defaults, ...editorData };
    }
  }
  return editorData;
}

function pathHitsWall(
  room: Room,
  mapId: string,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): boolean {
  const cover = getRoomCover(room, mapId);
  const dist = Math.hypot(tx - sx, ty - sy);
  if (dist === 0) return false;
  const steps = Math.max(2, Math.ceil(dist / (CELL_SIZE / 4)));
  const startCell = `${Math.floor(sx / CELL_SIZE)},${Math.floor(sy / CELL_SIZE)}`;
  const endCell = `${Math.floor(tx / CELL_SIZE)},${Math.floor(ty / CELL_SIZE)}`;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = sx + (tx - sx) * t;
    const cy = sy + (ty - sy) * t;
    const key = `${Math.floor(cx / CELL_SIZE)},${Math.floor(cy / CELL_SIZE)}`;
    if (key === startCell) continue;
    if (cover[key] === "wall") return true;
    if (key === endCell && cover[key] === "wall") return true;
  }
  return false;
}

function isInFOV(observer: Unit, target: Unit, room: Room): boolean {
  const mapCover = getRoomCover(room, room.gameState.mapId) as Record<
    string,
    CoverType
  >;
  const distMeters = distanceMeters(observer.x, observer.y, target.x, target.y);

  // If target is currently marked by observer, it bypasses arc/distance restrictions
  const isMarked =
    observer.className === "Sniper" &&
    observer.attachments.includes("Objetiva") &&
    observer.markedTargetId === target.id;

  // 3 & 4. Obstructed Vision or Target in Full Cover -> No Vision
  const coverInfo = computeShotCover(
    observer.x,
    observer.y,
    target.x,
    target.y,
    mapCover,
  );
  if (coverInfo.hasWall || coverInfo.cover === "full") {
    return false;
  }

  if (isMarked) {
    return true; // Bypasses the 90deg and 40m limits
  }

  const watch = observer.rotation ?? 0;
  const ang = angleDegBetween(observer.x, observer.y, target.x, target.y);
  const diff = Math.abs(normalizeAngle(ang - watch));

  // 1. Arc 90°, range <= 40m
  if (distMeters <= SCALE.RAIO_VISAO_BASE) {
    if (diff <= 45) return true; // 45° either side = 90° total
  }

  // 2. Extensão frontal além de 40m
  // SOMENTE o Sniper com habilidade/acessório específica (ex: Objetiva) vê além de 40m na frente
  const isSniper = observer.className === "Sniper";
  const hasObjetiva = observer.attachments.includes("Objetiva");
  if (isSniper && hasObjetiva) {
    if (diff <= 10) {
      // Narrow frontal cone
      return true;
    }
  }

  return false;
}

// ─── Draft validation (max 9 units, max 100 pts) ──────────────────────────
const MAX_POINTS_PER_TEAM = 100;
const MAX_UNITS_PER_TEAM = 9;

function calcDraftUnitCost(u: DraftUnit): number {
  let sum = 0;
  if (u.className) sum += CLASSES[u.className]?.points || 0;
  if (u.primaryWeapon) sum += WEAPONS[u.primaryWeapon]?.points || 0;
  if (u.secondaryWeapon) sum += WEAPONS[u.secondaryWeapon]?.points || 0;
  if (u.armorName) sum += ARMORS[u.armorName]?.points || 0;
  for (const a of u.attachments || []) sum += ATTACHMENTS[a]?.points || 0;
  for (const s of u.skills || []) sum += SKILLS[s]?.points || 0;
  return sum;
}
function calcDraftTeamCost(units: DraftUnit[]): number {
  return units.reduce((acc, u) => acc + calcDraftUnitCost(u), 0);
}
function validateDraftTeam(units: DraftUnit[]): {
  ok: boolean;
  error?: string;
} {
  if (units.length > MAX_UNITS_PER_TEAM)
    return {
      ok: false,
      error: `Máximo de ${MAX_UNITS_PER_TEAM} unidades por equipe.`,
    };
  if (calcDraftTeamCost(units) > MAX_POINTS_PER_TEAM)
    return {
      ok: false,
      error: `Limite de ${MAX_POINTS_PER_TEAM} pontos por equipe excedido.`,
    };
  return { ok: true };
}

// Build final Unit objects from a draft + deploy positions, ready for battle.
function buildBattleUnits(room: Room): Record<string, Unit> {
  const out: Record<string, Unit> = {};
  for (const team of ["A", "B"] as const) {
    const positions = room.deploy.positions[team];
    const draftUnits = room.draft.teams[team];
    for (const du of draftUnits) {
      const pos = positions[du.id];
      // Fallback: if no position (shouldn't happen — server validates), drop the unit
      if (!pos) continue;
      let jitterX = 0;
      let jitterY = 0;
      if (team === "B" && room.draft.gameMode?.startsWith("pve")) {
         jitterX = (Math.random() - 0.5) * 20; // -10 to +10
         jitterY = (Math.random() - 0.5) * 20; // -10 to +10
      }
      
      const x = pos.gx * CELL_SIZE + CELL_SIZE / 2 + jitterX;
      const y = pos.gy * CELL_SIZE + CELL_SIZE / 2 + jitterY;
      const pWeapon = du.primaryWeapon ? WEAPONS[du.primaryWeapon] : null;
      const sWeapon = du.secondaryWeapon ? WEAPONS[du.secondaryWeapon] : null;
      out[du.id] = ensureUnitDefaults({
        id: du.id,
        name: du.name,
        team,
        className: du.className,
        x,
        y,
        rotation: du.rotation ?? (team === "A" ? 0 : 180),
        hp: CLASSES[du.className]?.hp ?? 5,
        armorName: du.armorName,
        primaryWeapon: du.primaryWeapon,
        secondaryWeapon: du.secondaryWeapon,
        attachments: du.attachments || [],
        skills: du.skills || [],
        primaryAmmoInMag: pWeapon?.reload ?? 0,
        secondaryAmmoInMag: sWeapon?.reload ?? 0,
        activeWeaponSlot: 'primary',
        // Inicializar Granada de Fumaça para Granadeiros com a skill
        hasSmokeGrenade: (du.skills || []).includes("Granada de Fumaça"),
      });
    }
  }
  return out;
}

// ── AI Maps — persistent metadata (only from Firestore) ───────────────────────

interface AIMapRecord {
  id: string;
  name: string;
  imagePath: string;
  coverData: Record<string, string>;
  gridWidth: number;
  gridHeight: number;
  createdAt: number;
}

async function loadAIMapRecords(): Promise<AIMapRecord[]> {
  try {
    const col = collection(db, "ai-maps");
    const snap = await getDocs(col);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AIMapRecord);
  } catch (err) {
    console.error("⚠️ Falha ao ler ai-maps do Firestore:", err);
    return [];
  }
}

async function persistAIMapRecord(map: AIMapRecord): Promise<void> {
  try {
    await setDoc(doc(db, "ai-maps", map.id), map);
  } catch (err) {
    console.error("⚠️ Falha ao persistir mapa no Firestore:", err);
  }
}

async function deleteAIMapRecord(mapId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "ai-maps", mapId));
  } catch (err) {
    console.error("⚠️ Falha ao deletar mapa do Firestore:", err);
  }
}

interface AIMapDraft {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  coverData: Record<string, string>;
  userPrompt: string;
  updatedAt: number;
}

async function loadAIMapDrafts(): Promise<AIMapDraft[]> {
  try {
    const col = collection(db, "ai-map-drafts");
    const snap = await getDocs(col);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AIMapDraft);
  } catch {
    return [];
  }
}

async function persistAIMapDraft(draft: AIMapDraft): Promise<void> {
  try {
    await setDoc(doc(db, "ai-map-drafts", draft.id), draft);
  } catch (err) {
    console.error("⚠️ Falha ao persistir rascunho no Firestore:", err);
  }
}

async function deleteAIMapDraftFromDB(draftId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "ai-map-drafts", draftId));
  } catch (err) {
    console.error("⚠️ Falha ao deletar rascunho do Firestore:", err);
  }
}

/** Upload a base64 image to Vercel Blob. */
async function uploadToVercelBlob(
  imageBase64: string,
  mimeType: string,
  fileName: string,
): Promise<string> {
  try {
    const pureBase64 = imageBase64.split(",").pop() || "";
    const buffer = Buffer.from(pureBase64, "base64");
    const { url } = await put(`maps/${fileName}`, buffer, {
      access: "public",
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return url;
  } catch (err) {
    console.error("⚠️ Erro no upload para Vercel Blob:", err);
    throw err;
  }
}

/** Delete a local image file */
async function deleteImageFile(imageUrl: string): Promise<void> {
  try {
    if (imageUrl.includes("/api/maps/img/")) {
      const fileName = imageUrl.replace("/api/maps/img/", "");
      const targetPath = path.join(
        __dirname,
        "data",
        "maps",
        decodeURIComponent(fileName),
      );
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    }
  } catch (err) {
    console.warn("⚠️ Erro ao deletar imagem local:", err);
  }
}

// This will be called inside startServer to ensure it waits for Firestore
async function loadAIMapsIntoRuntime() {
  const maps = await loadAIMapRecords();
  for (const m of maps) {
    // Override or add to runtime MAPS object
    MAPS[m.id] = {
      id: m.id,
      name: m.name,
      imagePath: m.imagePath,
      gridWidth: m.gridWidth,
      gridHeight: m.gridHeight,
    };
    // Sync cover data from the metadata record if not already loaded into globalCoverData
    if (m.coverData) {
      globalCoverData[m.id] = m.coverData;
    }
  }
  if (maps.length > 0) {
    console.log(
      `🗺️ Mapas persistentes carregados/sincronizados: ${maps.length} mapa(s).`,
    );
  }
}

async function startServer() {
  // Initialize persistent data before starting the server
  try {
    // 1. Load basic global data
    const [covers, settings] = await Promise.all([
      loadGlobalCoverData(),
      loadGlobalGridSettings(),
    ]);
    Object.assign(globalCoverData, covers);
    Object.assign(globalGridSettings, settings);

    // 2. Load AI maps and sync their specific covers (this might override basic covers)
    await loadAIMapsIntoRuntime();

    console.log("✅ Dados globais sincronizados com Firestore.");
  } catch (err) {
    console.error("❌ Falha crítica ao sincronizar dados iniciais:", err);
  }

  const app = express();
  const PORT = 3000;
  // 500 MB limit for huge image base64 payloads
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ limit: "500mb", extended: true }));

  // ── Room Management ──────────────────────────────────────────────────────────

  app.post("/api/rooms", async (req, res) => {
    const { playerName, gameMode } = req.body;
    if (!playerName)
      return res.status(400).json({ error: "Nome do jogador é obrigatório" });

    let roomId = generateRoomId();
    while (rooms[roomId]) roomId = generateRoomId();

    const playerToken = randomUUID();
    rooms[roomId] = {
      id: roomId,
      players: { A: { name: playerName, token: playerToken } },
      gameState: emptyGameState(),
      currentTurn: "A",
      phase: "draft",
      draft: { ...emptyDraft(), gameMode: gameMode || "pvp" },
      deploy: emptyDeploy(),
      coverData: {},
      pendingGuardShots: [],
      createdAt: Date.now(),
    };

    console.log(`🏠 Sala ${roomId} criada por ${playerName}`);
    await saveRoom(rooms[roomId]);
    res.json({ roomId, playerToken, team: "A" });
  });

  app.post("/api/rooms/:roomId/join", async (req, res) => {
    const { roomId } = req.params;
    const { playerName } = req.body;
    const room = await loadRoom(roomId);
    if (!room)
      return res
        .status(404)
        .json({ error: "Sala não encontrada. Verifique o código." });
    if (!playerName)
      return res.status(400).json({ error: "Nome do jogador é obrigatório" });
      
    const isPve = room.draft.gameMode === "pve-zombies" || room.draft.gameMode === "pve-tactical";
    const playerToken = randomUUID();

    if (isPve) {
      if (!room.players.A2) {
        room.players.A2 = { name: playerName, token: playerToken };
      } else if (!room.players.A3) {
        room.players.A3 = { name: playerName, token: playerToken };
      } else if (!room.players.A4) {
        room.players.A4 = { name: playerName, token: playerToken };
      } else {
        return res.status(409).json({ error: "Sala PVE já está cheia (4/4)" });
      }
      pushLog(room, `${playerName} entrou na sala como membro da Equipe.`);
      console.log(`🤝 ${playerName} entrou na sala ${roomId} (PVE)`);
      await saveRoom(room);
      return res.json({ roomId, playerToken, team: "A" });
    } else {
      if (room.players.B)
        return res.status(409).json({ error: "Sala PVP já está cheia (2/2)" });
      room.players.B = { name: playerName, token: playerToken };
      pushLog(room, `${playerName} entrou na sala como Equipe B.`);
      console.log(`🤝 ${playerName} entrou na sala ${roomId} como Equipe B`);
      await saveRoom(room);
      return res.json({ roomId, playerToken, team: "B" });
    }
  });

  // Public room state — strips opponent details that the player shouldn't see during draft.
  app.get("/api/rooms/:roomId/state", async (req, res) => {
    const { roomId } = req.params;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });

    const status: "waiting" | "active" =
      room.phase === "active" ? "active" : "waiting";
    res.json({
      gameState: room.gameState,
      currentTurn: room.currentTurn,
      status,
      phase: room.phase,
      players: {
        A: room.players.A ? { name: room.players.A.name } : undefined,
        A2: room.players.A2 ? { name: room.players.A2.name } : undefined,
        A3: room.players.A3 ? { name: room.players.A3.name } : undefined,
        A4: room.players.A4 ? { name: room.players.A4.name } : undefined,
        B: room.players.B ? { name: room.players.B.name } : undefined,
      },
      draft: {
        selectedMap: room.draft.selectedMap,
        teams: room.draft.teams, // both teams visible (sizes)
        ready: room.draft.ready,
        gameMode: room.draft.gameMode,
      },
      deploy: {
        chosenZone: room.deploy.chosenZone,
        positions: room.deploy.positions,
        ready: room.deploy.ready,
      },
      pendingGuardShots: room.pendingGuardShots,
      interruptedMove: room.interruptedMove,
      winner: room.winner ?? null,
    });
  });

  // ── Helper: ensure caller is a known player and return their team ──────────
  function authPlayer(
    room: Room,
    playerToken: string,
  ): { team?: "A" | "B"; error?: string; status?: number } {
    if (room.players.A?.token === playerToken) return { team: "A" };
    if (room.players.A2?.token === playerToken) return { team: "A" };
    if (room.players.A3?.token === playerToken) return { team: "A" };
    if (room.players.A4?.token === playerToken) return { team: "A" };
    if (room.players.B?.token === playerToken) return { team: "B" };
    return { error: "Token de jogador inválido", status: 403 };
  }

  // ── Draft endpoints ────────────────────────────────────────────────────────

  app.post("/api/rooms/:roomId/draft/team", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, units } = req.body as {
      playerToken: string;
      units: DraftUnit[];
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "draft")
      return res.status(400).json({ error: "Não estamos na fase de Draft." });

    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    if (!Array.isArray(units))
      return res.status(400).json({ error: "Formato de unidades inválido" });
    const v = validateDraftTeam(units);
    if (!v.ok) return res.status(400).json({ error: v.error });

    room.draft.teams[auth.team!] = units;
    // Editing the team always cancels your own ready flag (prevents accidental start).
    room.draft.ready[auth.team!] = false;
    await saveRoom(room);
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/draft/map", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, mapId } = req.body as {
      playerToken: string;
      mapId: string;
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "draft")
      return res.status(400).json({ error: "Não estamos na fase de Draft." });
    if (!MAPS[mapId]) return res.status(400).json({ error: "Mapa inválido" });

    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });
    if (auth.team !== "A")
      return res
        .status(403)
        .json({ error: "Apenas o Jogador A escolhe o mapa." });

    room.draft.selectedMap = mapId;
    // Map change cancels ready states (both players need to re-confirm)
    room.draft.ready.A = false;
    room.draft.ready.B = false;
    await saveRoom(room);
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/draft/ready", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, ready } = req.body as {
      playerToken: string;
      ready: boolean;
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "draft")
      return res.status(400).json({ error: "Não estamos na fase de Draft." });

    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    if (ready) {
      if (room.draft.gameMode === "pvp" && (!room.players.A || !room.players.B)) {
        return res
          .status(400)
          .json({ error: "Aguardando o segundo jogador entrar na sala." });
      }
      const myTeam = room.draft.teams[auth.team!];
      if (myTeam.length === 0)
        return res
          .status(400)
          .json({ error: "Recrute pelo menos uma unidade." });
      const v = validateDraftTeam(myTeam);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    room.draft.ready[auth.team!] = !!ready;

    // auto ready B if PVE and A is ready
    if (ready && room.draft.gameMode !== "pvp" && auth.team === "A") {
      room.draft.ready.B = true;
      
      // Auto-populate DraftState for Team B based on PVE mode if missing
      if (room.draft.teams.B.length === 0 && room.draft.gameMode === "pve-zombies") {
         const ZOMBIES_COUNT = room.draft.pveZombieCount || 3;
         const zombies: DraftUnit[] = [];
         for (let i = 0; i < ZOMBIES_COUNT; i++) {
           zombies.push({
             id: randomUUID(),
             name: `Zombie ${i + 1}`,
             className: "Zombie",
             primaryWeapon: "Mordida",
            secondaryWeapon: null,
             armorName: null,
             attachments: [],
             skills: []
           });
         }
         room.draft.teams.B = zombies;
      }
    }

    // Both ready → advance to deploy phase
    if (room.draft.ready.A && room.draft.ready.B) {
      room.phase = "deploy";
      room.deploy = emptyDeploy();
      if (room.draft.gameMode !== "pvp") {
        room.deploy.ready.B = true; // Auto ready B in deploy phase
      }
      room.gameState.mapId = room.draft.selectedMap;
      pushLog(
        room,
        `🗺️ Ambos prontos! Avançando para a fase de Posicionamento.`,
      );
    }
    await saveRoom(room);
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/draft/pve-config", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, gameMode, difficulty, pveZombieCount, pveTeamName, pveTeamUnits } = req.body as any;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "draft")
      return res.status(400).json({ error: "Não estamos na fase de Draft." });

    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });
    if (auth.team !== "A")
      return res.status(403).json({ error: "Apenas o Jogador A configura PVE." });

    if (gameMode !== undefined) room.draft.gameMode = gameMode;
    if (difficulty !== undefined) room.draft.difficulty = difficulty;
    if (pveZombieCount !== undefined) room.draft.pveZombieCount = pveZombieCount;
    if (pveTeamName !== undefined) room.draft.pveTeamName = pveTeamName;
    
    if (room.draft.gameMode === "pve-tactical" && Array.isArray(pveTeamUnits)) {
       room.draft.teams.B = pveTeamUnits;
    } else if (room.draft.gameMode === "pve-zombies") {
       // We can generate zombie DraftUnits here
       const ZOMBIES_COUNT = room.draft.pveZombieCount || 3;
       const zombies: DraftUnit[] = [];
       for (let i = 0; i < ZOMBIES_COUNT; i++) {
         zombies.push({
           id: randomUUID(),
           name: `Zombie ${i + 1}`,
           className: "Zombie", // Fallback class
           primaryWeapon: null, // Melee
          secondaryWeapon: null,
           armorName: null,
           attachments: [],
           skills: []
         });
       }
       room.draft.teams.B = zombies;
    }

    // Cancel ready states since configuration changed
    room.draft.ready.A = false;
    room.draft.ready.B = false;

    await saveRoom(room);
    res.json({ success: true });
  });

  // ── Deploy endpoints ───────────────────────────────────────────────────────

  app.get("/api/rooms/:roomId/deploy/zones", async (req, res) => {
    const { roomId } = req.params;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const cover = getRoomCover(room, room.draft.selectedMap);
    res.json({
      A: findDeployZones(cover, "A"),
      B: findDeployZones(cover, "B"),
    });
  });

  app.post("/api/rooms/:roomId/deploy/zone", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, zoneId } = req.body as {
      playerToken: string;
      zoneId: string;
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "deploy")
      return res.status(400).json({ error: "Não estamos na fase de Deploy." });
    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    const cover = getRoomCover(room, room.draft.selectedMap);
    const myZones = findDeployZones(cover, auth.team!);
    const zone = myZones.find((z) => z.id === zoneId);
    if (!zone)
      return res
        .status(404)
        .json({ error: "Zona de deploy não encontrada para sua equipe." });

    // If switching zones, drop any positions outside the new zone
    const valid = new Set(zone.cells);
    const positions = room.deploy.positions[auth.team!];
    for (const [uid, pos] of Object.entries(positions)) {
      if (!valid.has(`${pos.gx},${pos.gy}`)) delete positions[uid];
    }
    room.deploy.chosenZone[auth.team!] = zoneId;
    room.deploy.ready[auth.team!] = false;
    await saveRoom(room);
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/deploy/positions", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, positions } = req.body as {
      playerToken: string;
      positions: Record<string, { gx: number; gy: number }>;
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "deploy")
      return res.status(400).json({ error: "Não estamos na fase de Deploy." });
    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    const zoneId = room.deploy.chosenZone[auth.team!];
    if (!zoneId)
      return res
        .status(400)
        .json({ error: "Escolha uma zona de deploy primeiro." });
    const cover = getRoomCover(room, room.draft.selectedMap);
    const zone = findDeployZones(cover, auth.team!).find(
      (z) => z.id === zoneId,
    );
    if (!zone) return res.status(400).json({ error: "Zona inválida." });
    const validCells = new Set(zone.cells);

    const myDraftIds = new Set(room.draft.teams[auth.team!].map((u) => u.id));
    const usedCells = new Set<string>();
    const cleaned: Record<string, { gx: number; gy: number }> = {};
    for (const [uid, pos] of Object.entries(positions || {})) {
      if (!myDraftIds.has(uid)) continue;
      const k = `${pos.gx},${pos.gy}`;
      if (!validCells.has(k))
        return res
          .status(400)
          .json({ error: "Posição fora da zona escolhida." });
      if (usedCells.has(k))
        return res
          .status(400)
          .json({ error: "Duas unidades não podem ocupar a mesma célula." });
      // Etapa 3: tokens não podem ser posicionados em cobertura parcial/total.
      const cellCover = cover[k] as CoverType | undefined;
      if (cellCover === "half" || cellCover === "full") {
        return res.status(400).json({
          error:
            cellCover === "full"
              ? `Não é possível posicionar uma unidade em (${pos.gx},${pos.gy}): cobertura total.`
              : `Não é possível posicionar uma unidade em (${pos.gx},${pos.gy}): cobertura parcial.`,
        });
      }
      usedCells.add(k);
      cleaned[uid] = { gx: pos.gx, gy: pos.gy };
    }
    room.deploy.positions[auth.team!] = cleaned;
    room.deploy.ready[auth.team!] = false;
    await saveRoom(room);
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/deploy/ready", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, ready } = req.body as {
      playerToken: string;
      ready: boolean;
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "deploy")
      return res.status(400).json({ error: "Não estamos na fase de Deploy." });
    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    if (ready) {
      if (!room.deploy.chosenZone[auth.team!])
        return res.status(400).json({ error: "Escolha uma zona primeiro." });
      const draftLen = room.draft.teams[auth.team!].length;
      const placed = Object.keys(room.deploy.positions[auth.team!]).length;
      if (placed !== draftLen)
        return res.status(400).json({
          error: `Posicione todas as ${draftLen} unidades antes de ficar pronto.`,
        });

      // Etapa 3: revalidar que nenhum token está em half/full antes de
      // permitir a transição para batalha (defesa em profundidade — pode
      // acontecer se o editor de cobertura for alterado depois do deploy).
      const coverNow = getRoomCover(room, room.draft.selectedMap);
      const draftIndex = new Map(
        room.draft.teams[auth.team!].map((u) => [u.id, u]),
      );
      for (const [uid, pos] of Object.entries(
        room.deploy.positions[auth.team!],
      )) {
        const k = `${pos.gx},${pos.gy}`;
        const cellCover = coverNow[k] as CoverType | undefined;
        if (cellCover === "half" || cellCover === "full") {
          const unitName = draftIndex.get(uid)?.name || uid;
          return res.status(400).json({
            error: `${unitName} está em (${pos.gx},${pos.gy}) sobre cobertura ${cellCover === "full" ? "total" : "parcial"}. Reposicione antes de ficar pronto.`,
          });
        }
      }
    }
    room.deploy.ready[auth.team!] = !!ready;

    // Both ready → start battle
    if (room.deploy.ready.A && room.deploy.ready.B) {
      if (room.draft.gameMode !== "pvp") {
        const coverNow = getRoomCover(room, room.draft.selectedMap);
        const mapInfo = MAPS[room.draft.selectedMap] || room.coverData[room.draft.selectedMap];
        const gw = Number(mapInfo?.gridWidth || 40);
        const gh = Number(mapInfo?.gridHeight || 20);
        const bUnits = room.draft.teams.B;
        const positions: Record<string, {gx: number, gy: number}> = {};

        const spawnCells = Object.keys(coverNow).filter(k => coverNow[k] === "spawn_pve");
        if (spawnCells.length > 0) {
          for(let i=spawnCells.length-1; i>0; i--) {
            const j = Math.floor(Math.random()*(i+1));
            [spawnCells[i], spawnCells[j]] = [spawnCells[j], spawnCells[i]];
          }
          let spawnIndex = 0;
          bUnits.forEach(u => {
             const key = spawnCells[spawnIndex % spawnCells.length];
             const [gx, gy] = key.split(",").map(Number);
             const cellCover = coverNow[key];
             // Make sure the cell is passable (though map makers shouldn't put spawn on walls)
             if (cellCover !== "full" && cellCover !== "wall" && cellCover !== "half") {
               positions[u.id] = { gx, gy };
             }
             spawnIndex++;
          });
        }

        let deployedCount = Object.keys(positions).length;
        if (deployedCount < bUnits.length) {
          let avgAX = 0;
          const aPositions = Object.values(room.deploy.positions.A);
          if (aPositions.length > 0) {
            avgAX = aPositions.reduce((sum, p) => sum + p.gx, 0) / aPositions.length;
          } else {
            avgAX = gw / 2;
          }

          const targetX = avgAX < gw / 2 ? gw - 1 : 0;
          const allBlocked = new Set(aPositions.map(p => `${p.gx},${p.gy}`));
          Object.values(positions).forEach(p => allBlocked.add(`${p.gx},${p.gy}`));
          
          const freeCells: {gx: number, gy: number, weight: number}[] = [];
          for (let x=0; x<gw; x++) {
             for(let y=0; y<gh; y++) {
                const key = `${x},${y}`;
                const c = coverNow[key];
                if (c !== "half" && c !== "full" && c !== "wall" && !allBlocked.has(key)) {
                   const weight = Math.abs(x - targetX);
                   freeCells.push({gx: x, gy: y, weight});
                }
             }
          }
          
          freeCells.sort((a, b) => a.weight - b.weight);
          const topCells = freeCells.slice(0, Math.max(bUnits.length * 5, 20));
          for(let i=topCells.length-1; i>0; i--) {
             const j = Math.floor(Math.random()*(i+1));
             [topCells[i], topCells[j]] = [topCells[j], topCells[i]];
          }

          bUnits.forEach(u => {
             if (positions[u.id]) return;
             const cell = topCells.pop() || freeCells.pop();
             if (cell) {
               positions[u.id] = {gx: cell.gx, gy: cell.gy};
               allBlocked.add(`${cell.gx},${cell.gy}`);
             }
          });
        }
        room.deploy.positions.B = positions;
      }

      const units = buildBattleUnits(room);
      
      // Post-process units to add PVE bot flags
      if (room.draft.gameMode !== "pvp") {
         const botType = room.draft.gameMode === "pve-zombies" ? 'zombie' : 'tactical';
         Object.values(units).forEach(u => {
            if (u.team === "B") {
               u.isBot = true;
               u.botType = botType;
               if (botType === 'zombie') {
                 u.primaryWeapon = "Mordida";
                 u.secondaryWeapon = null;
                 u.armorName = null;
                 u.primaryAmmoInMag = 100;
                  u.alertStatus = 'dormant';
                  u.rotation = [0, 90, 180, 270][Math.floor(Math.random() * 4)];

               }
            }
         });
      }

      room.gameState = {
        units,
        mapId: room.draft.selectedMap,
        turnNumber: 1,
        logs: [
          {
            id: randomUUID(),
            timestamp: Date.now(),
            message: "⚔️ Batalha iniciada! Turno da Equipe A.",
          },
        ],
      };
      if (room.draft.gameMode === "pve-tactical") {
          room.gameState.tacticalState = { lkp: null, patrolPoints: {} };
      }
      room.phase = "active";
      room.currentTurn = "A";
      room.pendingGuardShots = [];
      console.log(`⚔️ Batalha iniciada na sala ${roomId}`);
    }
    await saveRoom(room);
    res.json({ success: true });
  });

  // ── Helper: validate it's caller's turn during active battle ──────────────
  function validateTurn(
    room: Room,
    playerToken: string,
  ): { error?: string; status?: number } {
    if (room.phase !== "active")
      return { error: "Batalha não iniciada", status: 400 };

    // Check for pending guard shots before anything else
    if (room.pendingGuardShots.length > 0) {
      return {
        error: "Ação bloqueada: aguardando reação de Guarda do oponente.",
        status: 409,
      };
    }

    const currentPlayer = room.players[room.currentTurn];
    const isPveBotTurn = room.draft.gameMode !== "pvp" && room.currentTurn === "B";
    const hostAuth = authPlayer(room, playerToken);
    
    // In PVE, let Host (Team A) control B's turn
    if (isPveBotTurn) {
       if (hostAuth.team === "A") {
          return {}; // Allow
       }
    }

    if (!currentPlayer || currentPlayer.token !== playerToken)
      return { error: "Não é seu turno", status: 403 };
    return {};
  }

  function processMovementSteps(
    room: Room,
    unit: Unit,
    cellPath: { gx: number; gy: number }[],
    ignoredGuards: string[],
  ) {
    const cover = getRoomCover(room, room.gameState.mapId);
    let detectedGuard: Unit | null = null;
    let stopIndex = 0;
    let accumulatedCost = 0;

    for (let i = 1; i < cellPath.length; i++) {
      const step = cellPath[i];
      const prevStep = cellPath[i - 1];

      const stepCost = pathCostMeters([prevStep, step], cover);
      accumulatedCost += stepCost;

      // Update unit pos temporarily
      unit.x = step.gx * CELL_SIZE + CELL_SIZE / 2;
      unit.y = step.gy * CELL_SIZE + CELL_SIZE / 2;

      const guards = Object.values(room.gameState.units).filter(
        (u) =>
          u.team !== unit.team &&
          u.stance === "guard" &&
          u.hp > 0 &&
          !ignoredGuards.includes(u.id),
      );

      for (const guard of guards) {
        if (isInFOV(guard, unit, room)) {
          detectedGuard = guard;
          break;
        }
      }

      if (detectedGuard) {
        stopIndex = i;
        break;
      }
    }

    if (detectedGuard) {
      unit.movedThisTurn += accumulatedCost;
      const remainingPath = cellPath.slice(stopIndex);

      const pending: PendingGuardShot = {
        id: randomUUID(),
        guardUnitId: detectedGuard.id,
        targetUnitId: unit.id,
        guardTeam: detectedGuard.team as "A" | "B",
      };
      room.pendingGuardShots.push(pending);
      pushLog(
        room,
        `🛡️ ${detectedGuard.name} (Postura de Guarda) detectou ${unit.name} em movimento e o turno foi suspenso!`,
      );

      room.interruptedMove = {
        unitId: unit.id,
        remainingPath,
        ignoredGuards: [...ignoredGuards, detectedGuard.id],
      };
    } else {
      const dest = cellPath[cellPath.length - 1];
      unit.x = dest.gx * CELL_SIZE + CELL_SIZE / 2;
      unit.y = dest.gy * CELL_SIZE + CELL_SIZE / 2;
      unit.movedThisTurn += accumulatedCost;
      unit.facingLockedThisTurn = true;
      pushLog(room, `${unit.name} completou o movimento.`);
      delete room.interruptedMove;

      // Mission Hooks
      const mission = getMissionEngine(room.gameState.mapId);
      if (mission?.onUnitMove) {
        mission.onUnitMove(room, unit);
      }
    }
  }

  // ── Movement (path-based) ─────────────────────────────────────────────────
  // Body: { playerToken, unitId, path: [{gx,gy},...] }   path[0] is the unit's current cell.
  app.post("/api/rooms/:roomId/move", async (req, res) => {
    const { roomId } = req.params;
    const {
      unitId,
      path: cellPath,
      playerToken,
    } = req.body as {
      unitId: string;
      playerToken: string;
      path: { gx: number; gy: number }[];
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.move && unit.extraMoveMeters <= unit.movedThisTurn) {
      return res
        .status(400)
        .json({ error: "Sem Ação de Movimento disponível neste turno." });
    }
    // Fogo Supressivo: unidade suprimida não pode se mover
    if (unit.suppressedUntilTurn && unit.suppressedUntilTurn > 0 && unit.suppressedUntilTurn >= room.gameState.turnNumber) {
      return res.status(400).json({ error: "Esta unidade está Suprimida e não pode se mover neste turno!" });
    }
    if (!Array.isArray(cellPath) || cellPath.length < 2) {
      return res.status(400).json({ error: "Caminho inválido." });
    }

    // Confirm starting cell matches the unit's current position
    const curGx = Math.floor(unit.x / CELL_SIZE);
    const curGy = Math.floor(unit.y / CELL_SIZE);
    if (cellPath[0].gx !== curGx || cellPath[0].gy !== curGy) {
      return res.status(400).json({
        error: `Início do caminho (${cellPath[0].gx},${cellPath[0].gy}) não coincide com a posição da unidade (gx: ${curGx}, gy: ${curGy}). [Unit: ${unit.id} at x:${unit.x.toFixed(2)},y:${unit.y.toFixed(2)}]`,
      });
    }

    const cover = getRoomCover(room, room.gameState.mapId);
    const mapInfo = MAPS[room.gameState.mapId];
    const enemyOccupied = new Set<string>();
    const allyOccupied = new Set<string>();
    for (const u of Object.values(room.gameState.units)) {
      if (u.id === unit.id) continue;
      const key = `${Math.floor(u.x / CELL_SIZE)},${Math.floor(u.y / CELL_SIZE)}`;
      if (u.team === unit.team) allyOccupied.add(key);
      else enemyOccupied.add(key);
    }
    const validation = validatePath(
      cellPath,
      mapInfo.gridWidth,
      mapInfo.gridHeight,
      cover,
      enemyOccupied,
      allyOccupied,
    );
    if (!validation.ok)
      return res.status(400).json({ error: validation.error });

    // Defesa em profundidade: além de validatePath já rejeitar atravessar
    // half/full (Etapa 2), garantir explicitamente que o destino não pousa
    // sobre cobertura sólida. Tokens não podem ocupar half/full nem como
    // ponto final de movimento (Etapa 3).
    const destStep = cellPath[cellPath.length - 1];
    const destKey = `${destStep.gx},${destStep.gy}`;
    const destCover = cover[destKey] as CoverType | undefined;
    if (destCover === "half" || destCover === "full") {
      return res.status(400).json({
        error:
          destCover === "full"
            ? "Não é possível terminar o movimento sobre cobertura total."
            : "Não é possível terminar o movimento sobre cobertura parcial.",
      });
    }

    const cost = pathCostMeters(cellPath, cover);
    const armorPenal = unit.armorName
      ? ARMORS[unit.armorName]?.movePenal || 0
      : 0;
    const classInfo = CLASSES[unit.className];
    let baseMove = (classInfo?.movement || SCALE.MOVIMENTO_BASE) - armorPenal;
    if (unit.stance === "prone") baseMove = Math.min(baseMove, 3);
    const maxMove = baseMove + unit.extraMoveMeters;

    if (unit.movedThisTurn + cost > maxMove + 0.01) {
      const remaining = (maxMove - unit.movedThisTurn).toFixed(1);
      return res.status(400).json({
        error: `Movimento excede o limite. Restam ${remaining}m, custo ${cost.toFixed(1)}m.`,
      });
    }

    processMovementSteps(room, unit, cellPath, []);

    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Grenade ───────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/grenade", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, attackerId, targetCell, distancePenalty } = req.body;

    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const state = room.gameState;
    const sessionTeam =
      room.players.A?.token === playerToken
        ? "A"
        : room.players.B?.token === playerToken
          ? "B"
          : null;
    if (!sessionTeam)
      return res.status(403).json({ error: "Jogador não encontrado" });

    try {
      const attacker = state.units[attackerId];
      if (!attacker) throw new Error("Unidade não encontrada");
      if (attacker.team !== sessionTeam)
        throw new Error("Unidade não pertence ao seu time.");
      if (room.currentTurn !== sessionTeam) throw new Error("Não é seu turno.");
      if (!attacker.actions.intervention)
        throw new Error("Sem ação de Intervenção disponível.");

      const grenadeIndex = attacker.attachments?.indexOf(
        "Granada de Fragmentação",
      );
      if (grenadeIndex === undefined || grenadeIndex === -1)
        throw new Error("A unidade não possui Granada de Fragmentação.");

      // Remove one grenade from inventory
      attacker.attachments.splice(grenadeIndex, 1);

      // Base grenade chance is 60 as per rules
      const hitChance = Math.max(0, 60 - distancePenalty);
      const roll = Math.floor(Math.random() * 100) + 1;
      const isHit = roll <= hitChance;

      // Mark intervention as used
      attacker.actions.intervention = false;

      const logLines: string[] = [];
      logLines.push(
        `[${attacker.name}] arremessou uma Granada de Fragmentação. (Roll: ${roll} vs ${hitChance}%)`,
      );

      if (!isHit) {
        logLines.push(`↳ O arremesso falhou (errou o alvo).`);
      } else {
        logLines.push(
          `↳ O arremesso foi um SUCESSO! Explosão em área calculada.`,
        );

        // Target cell pixel center
        const ex = targetCell.gx * 50 + 25; // 50 is CELL_SIZE
        const ey = targetCell.gy * 50 + 25;
        // Artilharia Pesada: +1.5m de raio e +2 de dano base
        const hasHeavyOrdnance = attacker.skills?.includes("Artilharia Pesada");
        const baseBlastRadius = 3 + (hasHeavyOrdnance ? 1.5 : 0);
        const blastRadiusPx = (baseBlastRadius / 1.5) * 50;
        const baseGrenadeDamage = 6 + (hasHeavyOrdnance ? 2 : 0);

        let hitCount = 0;

        for (const unitId of Object.keys(state.units)) {
          const unit = state.units[unitId];
          const distPx = Math.hypot(unit.x - ex, unit.y - ey);
          if (distPx <= blastRadiusPx) {
            // Recompute cover from explosion to unit
            const room = rooms[roomId];
            const mapCover = getRoomCover(room, state.mapId);
            const line = computeShotCover(
              ex,
              ey,
              unit.x,
              unit.y,
              mapCover as Record<string, CoverType>,
            );

            if (line.hasWall || line.cover === "full") {
              logLines.push(
                `  - [${unit.name}] protegido por cobertura TOTAL, sem dano.`,
              );
            } else {
              let damage = baseGrenadeDamage;
              if (line.cover === "half") {
                damage = Math.ceil(damage / 2); // Partial block
                logLines.push(
                  `  - [${unit.name}] parcialmente protegido. Dano reduzido para ${damage}.`,
                );
              }
              unit.hp -= damage;
              hitCount++;
              if (unit.hp <= 0) {
                logLines.push(
                  `  - [${unit.name}] sofreu ${damage} de dano da explosão e foi ELIMINADO!`,
                );
                delete state.units[unitId];
              } else {
                logLines.push(
                  `  - [${unit.name}] sofreu ${damage} de dano da explosão (HP: ${unit.hp}).`,
                );
              }
            }
          }
        }

        if (hitCount === 0) {
          logLines.push(`  - Nenhuma unidade foi atingida pela explosão.`);
        } else {
           checkWinner(room);
        }
      }

      state.logs.push({
        id: randomUUID(),
        timestamp: Date.now(),
        message: logLines.join("\n"),
      });

      // PVE Noise Level (Explosion = Extremely Loud)
      if (room.draft.gameMode?.startsWith("pve") && attacker.team === "A") {
        room.gameState.pveNoiseLevel = Math.min(100, (room.gameState.pveNoiseLevel ?? 0) + 25);
      }

      await saveRoom(room);
      res.json({ success: true, gameState: room.gameState });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Erro interno" });
    }
  });

  app.post("/api/rooms/:roomId/facing", async (req, res) => {
    const { roomId } = req.params;
    const { unitId, rotation, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });

    unit.rotation = rotation;
    pushLog(room, `${unit.name} mudou a direção (ação livre).`);

    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Shoot ─────────────────────────────────────────────────────────────────
  function performShot(
    room: Room,
    attacker: Unit,
    target: Unit,
    coverLevel: string,
    distancePenalty: number,
    fromGuard = false,
  ) {
    const wName_attacker = attacker.activeWeaponSlot === 'secondary' ? attacker.secondaryWeapon : attacker.primaryWeapon;
    const weapon = wName_attacker ? WEAPONS[wName_attacker] : null;
    if (!weapon) return { ok: false, error: "Atirador sem arma" };

    let targetIsSurprised = !fromGuard && !isInFOV(target, attacker, room);

    if (
      targetIsSurprised &&
      target.skills &&
      target.skills.includes("Sexto Sentido")
    ) {
      targetIsSurprised = false;
      pushLog(
        room,
        `🛡️ Sexto Sentido: ${target.name} percebeu o ataque e não foi surpreendido!`,
      );
    }

    const effectiveCover = targetIsSurprised ? "none" : coverLevel;

    const distMeters = distanceMeters(
      attacker.x,
      attacker.y,
      target.x,
      target.y,
    );
    const atts = attacker.attachments || [];
    let attHitBonus = 0;
    let attCritBonus = 0;

    for (const attName of atts) {
      const attInfo = ATTACHMENTS[attName];
      if (!attInfo) continue;

      const weaponMatches =
        !attInfo.weaponClasses ||
        attInfo.weaponClasses.includes(weapon.weaponClass);
      const minRangeOk =
        attInfo.minRange === undefined || distMeters > attInfo.minRange;
      const maxRangeOk =
        attInfo.maxRange === undefined || distMeters <= attInfo.maxRange;
      const proneOk = !attInfo.requireProne || attacker.stance === "prone";

      if (weaponMatches && minRangeOk && maxRangeOk && proneOk) {
        attHitBonus += attInfo.hitBonus || 0;
        attCritBonus += attInfo.critBonus || 0;
      }
    }

    // Check if it's from the back for "Sexto Sentido"
    const targetRot = target.rotation ?? 0;
    const angToAttacker = angleDegBetween(
      target.x,
      target.y,
      attacker.x,
      attacker.y,
    );
    const backDiff = Math.abs(normalizeAngle(angToAttacker - targetRot));
    const isFromBack = backDiff > 135; // Back 90 degree cone (180 +/- 45)

    let hitRate = CLASSES[attacker.className]?.hit ?? 60;
    hitRate += attHitBonus;
    if (distancePenalty) hitRate -= distancePenalty;
    if (effectiveCover === "half") hitRate -= 20;
    if (effectiveCover === "full") hitRate -= 40;
    if (fromGuard) hitRate -= 10;
    if (target.stance === "guard") hitRate -= 10;
    if (target.stance === "prone") hitRate -= 10;
    if (targetIsSurprised) hitRate += 10;
    // Implacável: se o alvo eliminou um inimigo no próprio turno, -30% no primeiro ataque recebido
    if (target.skills?.includes("Implacável") && target.killedThisTurn) {
      hitRate -= 30;
      target.killedThisTurn = false; // consome o buff (só vale para o primeiro ataque)
      pushLog(room, `🛡️ Implacável: ${target.name} está em foco — primeiro ataque recebido sofre -30% de acerto!`);
    }
    // Fogo Supressivo: atacante suprimido tem -20% de acerto
    if (attacker.suppressedUntilTurn && attacker.suppressedUntilTurn > 0 && attacker.suppressedUntilTurn >= room.gameState.turnNumber) {
      hitRate -= 20;
    }
    // Granada de Fumaça: alvo coberto por fumaça recebe -40% de acerto (suppressedUntilTurn negativo)
    if (target.suppressedUntilTurn && target.suppressedUntilTurn < 0 && Math.abs(target.suppressedUntilTurn) >= room.gameState.turnNumber) {
      hitRate -= 40;
    }
    if (hitRate < 5) hitRate = 5;

    const roll = Math.floor(Math.random() * 100) + 1;
    let hit = roll <= hitRate;

    // Trigger Sexto Sentido on miss from back
    if (!hit && target.skills?.includes("Sexto Sentido") && isFromBack) {
      target.extraMoveMeters = (target.extraMoveMeters || 0) + 1.5;
      pushLog(
        room,
        `🛡️ Sexto Sentido: ${target.name} esquivou do tiro pelas costas e ganhou +1.5m de movimento livre!`,
      );
    }

    const attackerClassName =
      CLASSES[attacker.className]?.name || attacker.className;
    const targetClassName = CLASSES[target.className]?.name || target.className;

    if (weapon.name === "Morteiro" && !hit) {
      const scatterRoll = Math.floor(Math.random() * 10) + 1;
      if (scatterRoll >= 5) {
        hit = true;
        pushLog(room, `Morteiro desviou mas acertou (Desvio: ${scatterRoll}).`);
      } else
        pushLog(
          room,
          `Morteiro errou e desviou ${SCALE.DESVIO_MORTEIRO}m (Desvio: ${scatterRoll}).`,
        );
    }

    if (hit) {
      let critChance = weapon.criticalChance || 0;
      if (attackerClassName === "Sniper") critChance += 10;
      critChance += attCritBonus;
      if (coverLevel === "half") critChance -= 5;
      if (coverLevel === "full") critChance -= 15;
      if (target.stance === "prone") critChance -= 5;
      // Flanqueador Nato: +20% crit se alvo sem cobertura ou ataque por flanco/costas
      if (attacker.skills?.includes("Flanqueador Nato")) {
        if (effectiveCover === "none" || isFromBack) {
          critChance += 20;
        }
      }
      if (critChance < 0) critChance = 0;
      if (critChance > 100) critChance = 100;
      const critRoll = Math.floor(Math.random() * 100) + 1;
      const isCrit = critChance > 0 && critRoll <= critChance;
      let damage = weapon.damage;
      if (isCrit) damage = weapon.critical;
      const armorRed = target.armorName
        ? ARMORS[target.armorName]?.reduction || 0
        : 0;
      damage = Math.max(1, damage - Math.floor(armorRed / 2));
      console.log(`[DEBUG] performShot: attacker=${attacker.name}, target=${target.name}, weapon=${weapon.name}, baseDamage=${weapon.damage}, armorRed=${armorRed}, finalDamage=${damage}, targetHPBefore=${target.hp}`);
      target.hp -= damage;
      console.log(`[DEBUG] performShot: targetHPAfter=${target.hp}`);
      if (isCrit)
        pushLog(
          room,
          `💥 CRÍTICO! ${attacker.name} (${attackerClassName}) atirou em ${target.name} (${targetClassName}) com ${weapon.name} causando ${damage} de dano! (Hit ${roll}/${hitRate}% · Crit ${critRoll}/${critChance}%)`,
        );
      else
        pushLog(
          room,
          `[ACERTO] ${attacker.name} (${attackerClassName}) atirou em ${target.name} (${targetClassName}) com ${weapon.name} causando ${damage} de dano. (Hit ${roll}/${hitRate}% · Crit ${critRoll}/${critChance}%)`,
        );
      if (target.hp <= 0) {
        pushLog(room, `☠️ ${target.name} (${targetClassName}) foi eliminado!`);
        // Morte de Cima: devolve ação tática ao Sniper se kill a +30m
        if (attacker.skills?.includes("Morte de Cima") && attacker.className === "Sniper") {
          if (distMeters > 30) {
            attacker.actions.tactical = true;
            pushLog(room, `🎯 Morte de Cima: ${attacker.name} recuperou a Ação Tática após eliminar ${target.name} a ${distMeters.toFixed(1)}m!`);
          }
        }
        // Implacável: marcar flag de kill no atacante
        if (attacker.skills?.includes("Implacável")) {
          attacker.killedThisTurn = true;
        }
        // Desfibrilador: salvar snapshot do eliminado para ressurreição
        if (!room.gameState.recentlyEliminated) room.gameState.recentlyEliminated = {};
        room.gameState.recentlyEliminated[target.id] = {
          unitSnapshot: { ...target },
          x: target.x,
          y: target.y,
          turn: room.gameState.turnNumber,
          team: target.team,
        };
        delete room.gameState.units[target.id];
        checkWinner(room);
      }
    } else {
      pushLog(
        room,
        `[ERRO] ${attacker.name} (${attackerClassName}) errou o tiro em ${target.name} (${targetClassName}). (Hit ${roll}/${hitRate}%)`,
      );

      // Sexto Sentido Trigger
      if (
        isFromBack &&
        target.skills &&
        target.skills.includes("Sexto Sentido")
      ) {
        target.extraMoveMeters += 3; // 3 meters free move (2 cells approximately)
        target.actions.move = true; // Grant move action if it was used
        pushLog(
          room,
          `⚡ Sexto Sentido: ${target.name} sentiu o perigo pelas costas, o inimigo errou e ele ganhou 3m de movimento livre!`,
        );
      }
    }
    return { ok: true };
  }

  app.post("/api/rooms/:roomId/shoot", async (req, res) => {
    const { roomId } = req.params;
    // Note: `coverLevel` is intentionally NOT read from req.body anymore — the
    // server is the single source of truth for cover and recomputes it below
    // from the map state. `distancePenalty` is still received from the client
    // because it depends on the weapon stats which the client already knows
    // (and there is no way for the client to forge a meaningful advantage).
    const { attackerId, targetId, distancePenalty, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const attacker = room.gameState.units[attackerId];
    const target = room.gameState.units[targetId];
    if (!attacker || !target)
      return res.status(404).json({ error: "Unidade não encontrada" });
    if (attacker.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    const wName_attacker = attacker.activeWeaponSlot === 'secondary' ? attacker.secondaryWeapon : attacker.primaryWeapon;
    const weapon = wName_attacker ? WEAPONS[wName_attacker] : null;
    if (!weapon) return res.status(400).json({ error: "Atirador sem arma" });

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (weapon.weaponClass === "Melee" && distance > 75) {
      return res.status(400).json({ error: "Alvo muito distante para ataque corpo-a-corpo." });
    }

    if ((attacker.activeWeaponSlot === 'secondary' ? attacker.secondaryAmmoInMag : attacker.primaryAmmoInMag) <= 0)
      return res.status(400).json({
        error: "Sem munição no carregador. Recarregue antes de atirar.",
      });
    if (attacker.shotsThisTurn >= weapon.shots)
      return res.status(400).json({
        error: `Limite de ${weapon.shots} disparo(s) por turno atingido.`,
      });
    if (
      attacker.shotsThisTurn === 0 &&
      !attacker.actions.intervention &&
      !attacker.skills?.includes("Linha de Frente")
    )
      return res
        .status(400)
        .json({ error: "Sem Ação de Intervenção disponível neste turno." });

    // Visão de Esquadrão: Sniper pode atirar via FOV de um aliado (com -15% hit)
    let squadsightActive = false;
    if (!isInFOV(attacker, target, room)) {
      if (attacker.skills?.includes("Visão de Esquadrão") && attacker.className === "Sniper") {
        // Verifica se algum aliado tem o alvo no FOV
        const alliesWithFOV = Object.values(room.gameState.units).filter(
          (u) => u.team === attacker.team && u.id !== attacker.id && u.hp > 0 && isInFOV(u, target, room)
        );
        if (alliesWithFOV.length === 0) {
          return res.status(400).json({ error: "O alvo está fora do campo de visão seu e de seus aliados (Visão de Esquadrão requer que um aliado veja o alvo)." });
        }
        squadsightActive = true; // -15% hit aplicado abaixo via distancePenalty extra
      } else {
        return res
          .status(400)
          .json({ error: "O alvo está fora do seu campo de visão (FOV)." });
      }
    }

    // Authoritative cover calculation (Etapa 4).
    const mapCover = getRoomCover(room, room.gameState.mapId) as Record<
      string,
      CoverType
    >;
    const coverInfo = computeShotCover(
      attacker.x,
      attacker.y,
      target.x,
      target.y,
      mapCover,
    );
    if (coverInfo.hasWall)
      return res
        .status(400)
        .json({ error: "Há paredes bloqueando o caminho!" });

    if (
      attacker.shotsThisTurn === 0 &&
      !attacker.skills?.includes("Linha de Frente")
    )
      attacker.actions.intervention = false;
    attacker.shotsThisTurn += 1;
    if (attacker.activeWeaponSlot === 'secondary') attacker.secondaryAmmoInMag -= 1; else attacker.primaryAmmoInMag -= 1;
    const r = performShot(
      room,
      attacker,
      target,
      coverInfo.cover,
      distancePenalty + (squadsightActive ? 15 : 0),
    );
    if (!r.ok) return res.status(400).json({ error: r.error });

    // Mission Hooks
    const mission = getMissionEngine(room.gameState.mapId);
    if (mission?.onShoot) {
      mission.onShoot(room, attacker, coverInfo);
    }

    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState, cover: coverInfo });
  });

  // ── Mark Target ──────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/mark-target", async (req, res) => {
    const { roomId } = req.params;
    const { sniperId, targetId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const sniper = room.gameState.units[sniperId];
    const target = room.gameState.units[targetId];
    if (!sniper || !target)
      return res.status(404).json({ error: "Unidade não encontrada" });
    if (sniper.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });

    if (
      sniper.className !== "Sniper" ||
      !sniper.attachments.includes("Objetiva")
    ) {
      return res
        .status(400)
        .json({ error: "Apenas Snipers com Objetiva podem marcar alvos." });
    }
    if (!sniper.actions.tactical) {
      return res
        .status(400)
        .json({ error: "Sem Ação Tática disponível para marcar o alvo." });
    }
    if (!isInFOV(sniper, target, room)) {
      return res.status(400).json({
        error: "O alvo deve estar no seu campo de visão para ser marcado.",
      });
    }

    const distMeters = distanceMeters(sniper.x, sniper.y, target.x, target.y);
    const wName_sniper = sniper.activeWeaponSlot === 'secondary' ? sniper.secondaryWeapon : sniper.primaryWeapon;
    const weapon = wName_sniper ? WEAPONS[wName_sniper] : null;
    const isCompensado =
      sniper.skills?.includes("Disparo Compensado") &&
      weapon?.weaponClass === "Rifle";
    const range = SCALE.ALCANCE_LONGO + (isCompensado ? 10 : 0);

    if (distMeters > range) {
      return res.status(400).json({
        error: `O alvo está além do alcance da arma (${distMeters.toFixed(1)}m > ${range}m) e não pode ser marcado.`,
      });
    }

    // Marcação consume Ação Tática e dura até o final do próximo turno do Sniper
    sniper.actions.tactical = false;
    sniper.markedTargetId = target.id;
    sniper.markedTargetExpiresAtTurn = room.gameState.turnNumber + 4; // Turno do Sniper -> Turno Inimigo -> Turno Sniper (pode atirar) -> Turno Inimigo (limpa antes de começar)

    pushLog(
      room,
      `🎯 ${sniper.name} marcou ${target.name} como alvo. (A marcação dura 1 turno)`,
    );
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Toggle Door ──────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/toggle-door", async (req, res) => {
    const { roomId } = req.params;
    const { unitId, cellKey, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.tactical)
      return res
        .status(400)
        .json({ error: "Sem Ação Tática para abrir/fechar porta." });

    const mapCover = getRoomCover(room, room.gameState.mapId) as Record<
      string,
      string
    >;
    const currentType = mapCover[cellKey];

    if (currentType !== "doorOpen" && currentType !== "doorClose") {
      return res.status(400).json({ error: "Esta célula não é uma porta." });
    }

    // Proximity check: unit must be within 1.5m (adjacent)
    const [gx, gy] = cellKey.split(",").map(Number);
    const cellWorldX = (gx + 0.5) * CELL_SIZE;
    const cellWorldY = (gy + 0.5) * CELL_SIZE;
    const dist = Math.hypot(unit.x - cellWorldX, unit.y - cellWorldY);
    if (dist > CELL_SIZE * 1.6) {
      // allow some margin for center-to-center
      return res.status(400).json({
        error: "Você precisa estar adjacente à porta para interagir.",
      });
    }

    const nextType = currentType === "doorOpen" ? "doorClose" : "doorOpen";
    mapCover[cellKey] = nextType;
    room.coverData[room.gameState.mapId] = mapCover;
    unit.actions.tactical = false;

    const actionText = nextType === "doorOpen" ? "abriu" : "fechou";
    pushLog(room, `🚪 ${unit.name} ${actionText} uma porta.`);
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState, mapCover });
  });

  // ── Heal ─────────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/heal", async (req, res) => {
    const { roomId } = req.params;
    const { healerId, targetId, playerToken } = req.body;
    const room = await loadRoom(roomId);

    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const healer = room.gameState.units[healerId];
    const target = room.gameState.units[targetId];

    if (!healer || !target)
      return res.status(404).json({ error: "Unidade não encontrada" });
    if (healer.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!healer.actions.intervention)
      return res
        .status(400)
        .json({ error: "Sem Ação de Intervenção disponível." });
    if (!healer.className.includes("Médico"))
      return res
        .status(400)
        .json({ error: "Apenas unidades da classe Médico podem curar." });
    if (healer.team !== target.team)
      return res.status(403).json({ error: "Só é possível curar aliados." });

    // Check distance (max 3 cells: ~4.5m)
    const distMeters = distanceMeters(healer.x, healer.y, target.x, target.y);
    const maxHealDist = 4.5;
    if (distMeters > maxHealDist) {
      return res.status(400).json({
        error: `Alvo muito distante para curar (${distMeters.toFixed(1)}m > ${maxHealDist}m).`,
      });
    }

    // Determine heal amount
    let healAmount = 2;
    if (healer.skills?.includes("Médico de Combate")) healAmount = 4;

    const classData = CLASSES[target.className];
    const maxHp = classData ? classData.hp : target.hp;

    if (target.hp >= maxHp) {
      return res.status(400).json({ error: "O alvo já está com HP máximo." });
    }

    const actualHeal = Math.min(healAmount, maxHp - target.hp);
    target.hp += actualHeal;
    healer.actions.intervention = false;

    let logMsg = `💉 ${healer.name} curou ${target.name} em ${actualHeal} HP.`;
    // Adrenalina: aliado curado ganha +3m de movimento no próximo turno
    if (healer.skills?.includes("Adrenalina")) {
      target.extraMoveMeters = (target.extraMoveMeters ?? 0) + 3;
      logMsg += ` ⚡ Adrenalina: ${target.name} ganhou +3m de movimento extra!`;
    }
    pushLog(room, logMsg);
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Fogo Supressivo (Suporte) ────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/suppress", async (req, res) => {
    const { roomId } = req.params;
    const { attackerId, targetId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const attacker = room.gameState.units[attackerId];
    const target = room.gameState.units[targetId];
    if (!attacker || !target) return res.status(404).json({ error: "Unidade não encontrada" });
    if (attacker.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!attacker.skills?.includes("Fogo Supressivo")) return res.status(400).json({ error: "A unidade não possui a habilidade Fogo Supressivo." });
    if (!attacker.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção disponível." });
    if ((attacker.activeWeaponSlot === 'secondary' ? attacker.secondaryAmmoInMag : attacker.primaryAmmoInMag) < 2) return res.status(400).json({ error: "Fogo Supressivo requer pelo menos 2 de munição no carregador." });
    if (attacker.team === target.team) return res.status(400).json({ error: "Não é possível suprimir aliados." });
    if (!isInFOV(attacker, target, room)) return res.status(400).json({ error: "O alvo está fora do campo de visão (FOV)." });

    if (attacker.activeWeaponSlot === 'secondary') attacker.secondaryAmmoInMag -= 2; else attacker.primaryAmmoInMag -= 2;
    attacker.actions.intervention = false;
    // Suprimido até o final do turno seguinte do alvo
    target.suppressedUntilTurn = room.gameState.turnNumber + 1;

    pushLog(room, `💨 ${attacker.name} usou Fogo Supressivo em ${target.name}! Alvo Suprimido: sem movimento e -20% de acerto até o próximo turno.`);
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Chuva de Chumbo (Suporte) ───────────────────────────────────────────────
  app.post("/api/rooms/:roomId/hail-of-bullets", async (req, res) => {
    const { roomId } = req.params;
    const { attackerId, targetId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const attacker = room.gameState.units[attackerId];
    const target = room.gameState.units[targetId];
    if (!attacker || !target) return res.status(404).json({ error: "Unidade não encontrada" });
    if (attacker.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!attacker.skills?.includes("Chuva de Chumbo")) return res.status(400).json({ error: "A unidade não possui a habilidade Chuva de Chumbo." });
    if (!attacker.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção disponível." });
    if ((attacker.activeWeaponSlot === 'secondary' ? attacker.secondaryAmmoInMag : attacker.primaryAmmoInMag) < 2) return res.status(400).json({ error: "Chuva de Chumbo requer pelo menos 2 de munição no carregador." });
    if (attacker.team === target.team) return res.status(400).json({ error: "Não é possível atacar aliados." });
    if (!isInFOV(attacker, target, room)) return res.status(400).json({ error: "O alvo está fora do campo de visão (FOV)." });

    const wName_attacker = attacker.activeWeaponSlot === 'secondary' ? attacker.secondaryWeapon : attacker.primaryWeapon;
    const weapon = wName_attacker ? WEAPONS[wName_attacker] : null;
    if (!weapon) return res.status(400).json({ error: "Atirador sem arma." });

    // Consome toda a munição
    const ammoSpent = attacker.activeWeaponSlot === 'secondary' ? attacker.secondaryAmmoInMag : attacker.primaryAmmoInMag;
    if (attacker.activeWeaponSlot === 'secondary') attacker.secondaryAmmoInMag = 0; else attacker.primaryAmmoInMag = 0;
    attacker.actions.intervention = false;

    // 100% de acerto, sem crítico
    let damage = weapon.damage;
    const armorRed = target.armorName ? ARMORS[target.armorName]?.reduction || 0 : 0;
    damage = Math.max(1, damage - Math.floor(armorRed / 2));
    target.hp -= damage;

    pushLog(room, `🔥 ${attacker.name} usou Chuva de Chumbo em ${target.name}! (${ammoSpent} munições gastas, 100% acerto, ${damage} dano, sem crítico).`);

    if (target.hp <= 0) {
      pushLog(room, `☠️ ${target.name} foi eliminado pela Chuva de Chumbo!`);
      delete room.gameState.units[target.id];
      checkWinner(room);
    } else {
      pushLog(room, `${target.name} sobreviveu com ${target.hp} HP.`);
    }

    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Granada de Fumaça (Granadeiro) ──────────────────────────────────────────
  app.post("/api/rooms/:roomId/smoke-grenade", async (req, res) => {
    const { roomId } = req.params;
    const { attackerId, targetCell, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const attacker = room.gameState.units[attackerId];
    if (!attacker) return res.status(404).json({ error: "Unidade não encontrada" });
    if (attacker.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!attacker.skills?.includes("Granada de Fumaça")) return res.status(400).json({ error: "A unidade não possui a habilidade Granada de Fumaça." });
    if (!attacker.hasSmokeGrenade) return res.status(400).json({ error: "A Granada de Fumaça já foi utilizada nesta missão." });
    if (!attacker.actions.tactical) return res.status(400).json({ error: "Sem Ação Tática disponível." });

    attacker.hasSmokeGrenade = false;
    attacker.actions.tactical = false;

    // Aplicar cobertura de fumaça: marcar células no raio de 3m como 'full' temporariamente
    // Implementado via flags de unidades aliadas dentro do raio (cobertura de fumaça)
    const ex = targetCell.gx * 50 + 25;
    const ey = targetCell.gy * 50 + 25;
    const smokeRadiusPx = (3 / 1.5) * 50; // 3m -> 100px

    // Marcar unidades aliadas no raio como tendo cobertura de fumaça até o próximo turno
    let coveredCount = 0;
    Object.values(room.gameState.units).forEach(unit => {
      if (unit.team === attacker.team && unit.hp > 0) {
        const dist = Math.hypot(unit.x - ex, unit.y - ey);
        if (dist <= smokeRadiusPx) {
          // Reutiliza suppressedUntilTurn com valor negativo como indicador de fumaça
          // Melhor: utilizamos o campo hasSmokeGrenade no proprio alvo para indicar "coberto por fumaça"
          // Para simplicidade: aplicação de -40% de acerto contra eles (equivalente a cobertura total)
          unit.suppressedUntilTurn = -(room.gameState.turnNumber + 1); // negativo = cobertura por fumaça
          coveredCount++;
        }
      }
    });

    pushLog(room, `💨 ${attacker.name} lançou uma Granada de Fumaça! ${coveredCount} aliado(s) no raio recebem Cobertura Total até o próximo turno.`);
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Desfibrilador (Médico) ─────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/revive", async (req, res) => {
    const { roomId } = req.params;
    const { healerId, targetId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const healer = room.gameState.units[healerId];
    if (!healer) return res.status(404).json({ error: "Médico não encontrado" });
    if (healer.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!healer.skills?.includes("Desfibrilador")) return res.status(400).json({ error: "A unidade não possui a habilidade Desfibrilador." });
    if (!healer.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção disponível." });
    if (!healer.className.includes("Médico")) return res.status(400).json({ error: "Apenas Médicos podem usar Desfibrilador." });

    // O alvo deve estar na lista de eliminados recentes (guardados no gameState)
    const recentlyEliminated = room.gameState.recentlyEliminated;
    if (!recentlyEliminated || !recentlyEliminated[targetId]) {
      return res.status(400).json({ error: "Nenhum aliado eliminado recentemente neste local." });
    }
    const reviveData = recentlyEliminated[targetId];
    if (room.gameState.turnNumber > reviveData.turn + 1) {
      return res.status(400).json({ error: "Passou tempo demais. O aliado não pode mais ser revivido." });
    }
    if (reviveData.team !== healer.team) {
      return res.status(400).json({ error: "Apenas aliados podem ser revividos." });
    }

    // Checar adjacência (máx 1.5m)
    const distToBody = distanceMeters(healer.x, healer.y, reviveData.x, reviveData.y);
    if (distToBody > 2.5) {
      return res.status(400).json({ error: `O Médico precisa estar adjacente ao aliado caído (${distToBody.toFixed(1)}m de distância).` });
    }

    // Reviver: reinserir a unidade com 3 HP
    const revivedUnit: Unit = ensureUnitDefaults({
      ...reviveData.unitSnapshot,
      hp: 3,
      x: reviveData.x,
      y: reviveData.y,
      actions: { move: false, intervention: false, tactical: false, chargeUsed: false },
    });
    room.gameState.units[targetId] = revivedUnit;
    delete recentlyEliminated[targetId];
    healer.actions.intervention = false;

    pushLog(room, `⚡ Desfibrilador: ${healer.name} reviveu ${revivedUnit.name} com 3 HP!`);
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });


  // ── Switch Weapon ────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/switch-weapon", async (req, res) => {
    const { roomId } = req.params;
    const { unitId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.tactical)
      return res
        .status(400)
        .json({ error: "Sem Ação Tática disponível para trocar de arma." });
    
    unit.actions.tactical = false;
    unit.activeWeaponSlot = unit.activeWeaponSlot === 'primary' ? 'secondary' : 'primary';
    const newWeaponName = unit.activeWeaponSlot === 'primary' ? unit.primaryWeapon : unit.secondaryWeapon;
    pushLog(
      room,
      `🔄 ${unit.name} trocou para a arma ${newWeaponName || 'Desarmado'}.`,
    );
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Pass Action / Reload ─────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/pass-action", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken, unitId, actionType } = req.body as {
      playerToken: string;
      unitId: string;
      actionType: 'move' | 'tactical';
    };
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const turnVal = validateTurn(room, playerToken);
    if (turnVal.error)
      return res.status(turnVal.status!).json({ error: turnVal.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });

    // Allow passing bot actions if PVE and B's turn
    const isBotControl = room.draft.gameMode !== "pvp" && room.currentTurn === "B" && room.draft.teams.A; // Host

    if (unit.team !== room.currentTurn)
      return res.status(400).json({ error: "Não é o turno desta unidade" });

    if (unit.hp <= 0)
      return res.status(400).json({ error: "Unidade eliminada" });

    if (actionType === 'move') {
       if (!unit.actions.move) return res.status(400).json({ error: "Movimento já gasto" });
       unit.actions.move = false;
    } else {
       if (!unit.actions.tactical) return res.status(400).json({ error: "Ação tática já gasta" });
       unit.actions.tactical = false;
    }

    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  app.post("/api/rooms/:roomId/reload", async (req, res) => {
    const { roomId } = req.params;
    const { unitId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.intervention)
      return res
        .status(400)
        .json({ error: "Sem Ação de Intervenção disponível." });
    const wName_unit = unit.activeWeaponSlot === 'secondary' ? unit.secondaryWeapon : unit.primaryWeapon;
    const weapon = wName_unit ? WEAPONS[wName_unit] : null;
    if (!weapon) return res.status(400).json({ error: "Sem arma equipada" });
    unit.actions.intervention = false;
    if (unit.activeWeaponSlot === 'secondary') unit.secondaryAmmoInMag = weapon.reload; else unit.primaryAmmoInMag = weapon.reload;
    pushLog(
      room,
      `🔁 ${unit.name} recarregou ${weapon.name} (${weapon.reload} munições).`,
    );
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Charge ───────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/charge", async (req, res) => {
    const { roomId } = req.params;
    const { unitId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.intervention)
      return res
        .status(400)
        .json({ error: "Sem Ação de Intervenção para usar Investida." });
    if (unit.actions.chargeUsed)
      return res
        .status(400)
        .json({ error: "Investida já utilizada neste turno." });
    unit.actions.intervention = false;
    unit.actions.chargeUsed = true;
    const classInfo = CLASSES[unit.className];
    const baseMove = classInfo?.movement || SCALE.MOVIMENTO_BASE;
    unit.extraMoveMeters += baseMove;
    unit.actions.move = true;
    pushLog(
      room,
      `🏃 ${unit.name} usou Investida (+${baseMove.toFixed(1)}m de movimento).`,
    );

    // PVE Noise Level (Running increases noise slightly)
    if (room.draft.gameMode?.startsWith("pve") && unit.team === "A") {
      room.gameState.pveNoiseLevel = Math.min(100, (room.gameState.pveNoiseLevel ?? 0) + 5);
    }

    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Guard ────────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/guard", async (req, res) => {
    const { roomId } = req.params;
    const { unitId, watchAngle, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.intervention)
      return res
        .status(400)
        .json({ error: "Sem Ação de Intervenção para Postura de Guarda." });
    unit.actions.intervention = false;
    unit.stance = "guard";
    pushLog(
      room,
      `🛡️ ${unit.name} assumiu Postura de Guarda (seguindo sua visão atual).`,
    );
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Prone ────────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/prone", async (req, res) => {
    const { roomId } = req.params;
    const { unitId, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn)
      return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.tactical)
      return res.status(400).json({ error: "Sem Ação Tática disponível." });
    unit.actions.tactical = false;
    if (unit.stance === "prone") {
      unit.stance = "standing";
      pushLog(room, `${unit.name} levantou-se do chão.`);
    } else {
      unit.stance = "prone";
      pushLog(room, `${unit.name} jogou-se ao chão.`);
    }
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Guard shot resolution ────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/guard-shot", async (req, res) => {
    const { roomId } = req.params;
    // `coverLevel` removed from the body — server recomputes (Etapa 4).
    const { pendingId, accept, distancePenalty, playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const idx = room.pendingGuardShots.findIndex((p) => p.id === pendingId);
    if (idx === -1)
      return res.status(404).json({ error: "Tiro de guarda não encontrado" });
    const pending = room.pendingGuardShots[idx];
    const guardOwner = room.players[pending.guardTeam];
    if (!guardOwner || guardOwner.token !== playerToken)
      return res
        .status(403)
        .json({ error: "Apenas o jogador da guarda pode resolver este tiro." });
    const guard = room.gameState.units[pending.guardUnitId];
    const target = room.gameState.units[pending.targetUnitId];
    room.pendingGuardShots.splice(idx, 1);
    const handleResumeMove = () => {
      if (room.interruptedMove && room.interruptedMove.unitId === target.id) {
        if (target.hp > 0 && room.interruptedMove.remainingPath.length > 1) {
          processMovementSteps(
            room,
            target,
            room.interruptedMove.remainingPath,
            room.interruptedMove.ignoredGuards,
          );
        } else {
          delete room.interruptedMove;
        }
      }
    };

    if (!guard || !target) {
      await saveRoom(room);
      return res.json({ success: true, gameState: room.gameState });
    }

    if (!accept) {
      pushLog(room, `${guard.name} optou por não atirar (Postura de Guarda).`);
      handleResumeMove();
      await saveRoom(room);
      return res.json({ success: true, gameState: room.gameState });
    }

    const wName_guard = guard.activeWeaponSlot === 'secondary' ? guard.secondaryWeapon : guard.primaryWeapon;
    const weapon = wName_guard ? WEAPONS[wName_guard] : null;
    if (!weapon) {
      pushLog(room, `${guard.name} não tem arma para o tiro de guarda.`);
      handleResumeMove();
      await saveRoom(room);
      return res.json({ success: true, gameState: room.gameState });
    }
    if ((guard.activeWeaponSlot === 'secondary' ? guard.secondaryAmmoInMag : guard.primaryAmmoInMag) <= 0) {
      pushLog(room, `${guard.name} sem munição para o tiro de guarda.`);
      handleResumeMove();
      await saveRoom(room);
      return res.json({ success: true, gameState: room.gameState });
    }

    const mapCover = getRoomCover(room, room.gameState.mapId) as Record<
      string,
      CoverType
    >;
    const coverInfo = computeShotCover(
      guard.x,
      guard.y,
      target.x,
      target.y,
      mapCover,
    );
    if (coverInfo.hasWall) {
      pushLog(
        room,
        `${guard.name} tentou o tiro de guarda mas o caminho está bloqueado por parede.`,
      );
      if (guard.skills?.includes("Emboscada") && (guard.activeWeaponSlot === 'secondary' ? guard.secondaryAmmoInMag : guard.primaryAmmoInMag) > 0) {
        pushLog(
          room,
          `🛡️ ${guard.name} possui Emboscada e mantém a Postura de Guarda apesar do bloqueio!`,
        );
      } else {
        guard.stance = "standing";
      }
      handleResumeMove();
      await saveRoom(room);
      return res.json({
        success: true,
        gameState: room.gameState,
        cover: coverInfo,
      });
    }

    if (guard.activeWeaponSlot === 'secondary') guard.secondaryAmmoInMag -= 1; else guard.primaryAmmoInMag -= 1;
    guard.guardShotsThisTurn = (guard.guardShotsThisTurn ?? 0) + 1;
    performShot(
      room,
      guard,
      target,
      coverInfo.cover,
      distancePenalty ?? 0,
      true,
    );

    // Emboscada: manter na Guarda até o limite de 2 tiros por turno
    const hasEmboscada = guard.skills?.includes("Emboscada");
    const guardShotsLimit = hasEmboscada ? 2 : 1;
    if ((guard.activeWeaponSlot === 'secondary' ? guard.secondaryAmmoInMag : guard.primaryAmmoInMag) > 0 && (guard.guardShotsThisTurn ?? 0) < guardShotsLimit) {
      pushLog(room, `🛡️ ${guard.name} mantém a Postura de Guarda (${guard.guardShotsThisTurn}/${guardShotsLimit} tiros de guarda usados).`);
    } else {
      guard.stance = "standing";
      guard.guardShotsThisTurn = 0;
      if (hasEmboscada && (guard.guardShotsThisTurn ?? 0) >= guardShotsLimit) {
        pushLog(room, `🛡️ ${guard.name} atingiu o limite de ${guardShotsLimit} tiros de guarda (Emboscada).`);
      }
    }

    handleResumeMove();
    await saveRoom(room);
    res.json({ success: true, gameState: room.gameState, cover: coverInfo });
  });

  // ── PVE Zombie DP Logic ──────────────────────────────────────────────────
  function getExtractionPoint(room: Room): { x: number, y: number } {
    const mapCover = getRoomCover(room, room.gameState.mapId);
    const extractionKeys = Object.keys(mapCover).filter(k => mapCover[k] === "extraction");
    if (extractionKeys.length > 0) {
      const [gx, gy] = extractionKeys[0].split(",").map(Number);
      return { x: gx * 50 + 25, y: gy * 50 + 25 };
    }
    
    // Fallback: Find max bounds and pick a corner furthest from Team A average
    let maxX = 0; let maxY = 0;
    for (const key of Object.keys(mapCover)) {
      const [gx, gy] = key.split(",").map(Number);
      if (gx > maxX) maxX = gx;
      if (gy > maxY) maxY = gy;
    }
    
    const aUnits = Object.values(room.gameState.units).filter(u => u.team === "A" && u.hp > 0);
    if (aUnits.length === 0) return { x: maxX * 50, y: maxY * 50 };
    
    let sumX = 0; let sumY = 0;
    aUnits.forEach(u => { sumX += u.x; sumY += u.y; });
    const avgX = sumX / aUnits.length;
    const avgY = sumY / aUnits.length;
    
    // Opposite corner
    const exX = avgX < (maxX * 50 / 2) ? maxX * 50 : 0;
    const exY = avgY < (maxY * 50 / 2) ? maxY * 50 : 0;
    
    return { x: exX, y: exY };
  }

  function calculateZombiesTargetDP(room: Room): number {
    const isHard = room.gameState.difficulty === "hard";
    let base = isHard ? 25 : 15;
    
    const aUnits = Object.values(room.gameState.units).filter((u) => u.team === "A" && u.hp > 0);
    // Modifier 1: Players / Units (+5 ou +7 DP por jogador vivo)
    base += aUnits.length * (isHard ? 7 : 5);
    
    // Modifier 2: Turn number (escalation over time, +5% a cada turno)
    const turnMultiplier = 1 + (room.gameState.turnNumber * 0.05);
    
    // Modifier 3: Proximity to extraction (Ponta - most advanced player)
    const exPoint = getExtractionPoint(room);
    let minDistanceToEx = Infinity;
    aUnits.forEach(u => {
      const dist = Math.sqrt(Math.pow(u.x - exPoint.x, 2) + Math.pow(u.y - exPoint.y, 2));
      if (dist < minDistanceToEx) minDistanceToEx = dist;
    });
    
    let proximityMultiplier = 0;
    if (minDistanceToEx < Infinity && minDistanceToEx < 2000) { // 2000 coords = 40 cells approx max influence
      const scale = 1 - (minDistanceToEx / 2000); // 0 at 2000, 1 at 0
      proximityMultiplier = scale * 0.5; // Até +50% de DP multiplicador perto da extração
    }
    
    const finalBaseDP = Math.floor(base * (turnMultiplier + proximityMultiplier));

    // NOISE MULTIPLIER (O Gatilho de Atenção)
    const noise = room.gameState.pveNoiseLevel ?? 0;
    // O baseline é 40%. Se o barulho for subindo (0 a 100), ele escala de 40% a 100%.
    const noiseScale = 0.4 + (0.6 * Math.min(1, noise / 100));

    return Math.floor(finalBaseDP * noiseScale);
  }

  function calculateZombiesCurrentDP(room: Room): number {
    const bUnits = Object.values(room.gameState.units).filter((u) => u.team === "B" && u.hp > 0);
    const aUnits = Object.values(room.gameState.units).filter((u) => u.team === "A" && u.hp > 0);

    let currentDP = 0;
    for (const z of bUnits) {
      let minDCard = Infinity;
      for (const a of aUnits) {
        const dx = (a.x - z.x) / 50;
        const dy = (a.y - z.y) / 50;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDCard) minDCard = dist;
      }

      let dpValue = 5;
      if (minDCard > 30) dpValue = 3; // Em trânsito: ainda conta como ameaça moderada
      else if (minDCard > 15) dpValue = 4; // Chegando
      else if (minDCard <= 3) dpValue = 7; // Ameaça iminente

      // Health factor proportion
      const maxHp = CLASSES[z.className]?.hp ?? 5;
      const hpRatio = z.hp / maxHp;
      dpValue *= Math.max(0.2, Math.min(1, hpRatio)); // No mínimo 20% do valor de DP pra não desconsiderar um zumbi com 1hp
      
      currentDP += dpValue;
    }
    return Math.floor(currentDP);
  }

  // ── End Turn ─────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/endturn", async (req, res) => {
    const { roomId } = req.params;
    const { playerToken } = req.body;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    Object.values(room.gameState.units).forEach((unit) => {
      if (unit.team === room.currentTurn) {
        unit.movedThisTurn = 0;
        unit.extraMoveMeters = 0;
        unit.shotsThisTurn = 0;
        unit.guardShotsThisTurn = 0;   // Emboscada: zerar contador de tiros de guarda
        unit.killedThisTurn = false;   // Implacável: zerar flag de kill
        unit.actions = {
          move: true,
          intervention: true,
          tactical: true,
          chargeUsed: false,
        };
        unit.facingLockedThisTurn = false;
      } else {
        if (unit.stance === "guard") {
          unit.stance = "standing";
          unit.guardShotsThisTurn = 0; // Emboscada: zerar ao sair da guarda
        }
      }
    });

    if (room.draft.gameMode === "pve-zombies" && room.currentTurn === "A") {
      const exPoint = getExtractionPoint(room);
      const aUnits = Object.values(room.gameState.units).filter(u => u.team === "A" && u.hp > 0);
      const reachedExtraction = aUnits.some(u => {
        const dist = Math.sqrt(Math.pow(u.x - exPoint.x, 2) + Math.pow(u.y - exPoint.y, 2));
        return dist <= 75;
      });

      if (reachedExtraction) {
        room.winner = "A";
        pushLog(room, `🏆 Mission Complete! A equipe alcançou a zona de extração e sobreviveu.`);
        await saveRoom(room);
        return res.json({ success: true, gameState: room.gameState, winner: room.winner });
      }
    }

    room.currentTurn = room.currentTurn === "A" ? "B" : "A";
    room.gameState.turnNumber++;

    const mission = getMissionEngine(room.gameState.mapId);
    if (mission?.onTurnEnd) {
      mission.onTurnEnd(room);
    }

    // Clear expired marked targets for the NEW player whose turn is starting.
    Object.values(room.gameState.units).forEach((unit) => {
      if (unit.team === room.currentTurn && unit.markedTargetId) {
        if (room.gameState.turnNumber >= unit.markedTargetExpiresAtTurn) {
          unit.markedTargetId = null;
        }
      }
    });

    const nextPlayer = room.players[room.currentTurn];
    pushLog(
      room,
      `🔄 Turno ${room.gameState.turnNumber} - Equipe ${room.currentTurn}${nextPlayer ? ` — ${nextPlayer.name}` : ""}.`,
    );

    // Apply PVE DP spawn logic if transitioning to Team B zombies
    if (room.currentTurn === "B" && room.draft.gameMode === "pve-zombies") {
      // Noise decay (-5) instead of passive increment for Silent Run balance
      room.gameState.pveNoiseLevel = Math.max(0, (room.gameState.pveNoiseLevel ?? 0) - 5);

      const targetDP = calculateZombiesTargetDP(room);
      let currentDP = calculateZombiesCurrentDP(room);

      room.gameState.pveState = { targetDP, currentDP };


      if (currentDP < targetDP || (mission?.id === "silent_run" && (room.gameState.pveNoiseLevel ?? 0) >= 50)) {
        let dpToFill = Math.max(0, targetDP - currentDP);
        let spawnsToMake = Math.min(2, Math.ceil(dpToFill / 5)); 
        
        if (mission?.id === "silent_run" && (room.gameState.pveNoiseLevel ?? 0) >= 50) {
           spawnsToMake += 3;
           pushLog(room, `⚠️ HORDA ATRAÍDA! O nível de ruído (${room.gameState.pveNoiseLevel}) atraiu reforços zumbis pelas retaguardas!`);
        }

        // Global Spawn Cap: 30 zombies
        const totalZombies = Object.values(room.gameState.units).filter(u => u.team === 'B' && u.hp > 0).length;
        if (totalZombies + spawnsToMake > 30) {
          spawnsToMake = Math.max(0, 30 - totalZombies);
        }

        if (spawnsToMake > 0) {
           const coverNow = getRoomCover(room, room.gameState.mapId);
           const spawnCells = Object.keys(coverNow).filter(k => coverNow[k] === "spawn_pve");
           
           let maxX = 20; let maxY = 20;
           for (const key of Object.keys(coverNow)) {
             const [gx, gy] = key.split(",").map(Number);
             if (gx > maxX) maxX = gx;
             if (gy > maxY) maxY = gy;
           }

           const aUnits = Object.values(room.gameState.units).filter(u => u.team === "A" && u.hp > 0);
           
           const getFallbackSpawn = () => {
             // Choose a location not too close to Team A (minimum 10 cells away), or at the map edges.
             let gx, gy;
             let valid = false;
             let attempts = 0;
             while (!valid && attempts < 50) {
               attempts++;
               gx = Math.floor(Math.random() * maxX);
               gy = Math.floor(Math.random() * maxY);
               
               let tooClose = false;
               for (const u of aUnits) {
                 const dx = (u.x - (gx * 50 + 25)) / 50;
                 const dy = (u.y - (gy * 50 + 25)) / 50;
                 if (Math.sqrt(dx*dx + dy*dy) < 8) tooClose = true;
               }
               
               // No unit exactly here
               const hasUnit = Object.values(room.gameState.units).some(
                  u => Math.floor(u.x / 50) === gx && Math.floor(u.y / 50) === gy && u.hp > 0
               );
               
               if (!tooClose && !hasUnit && (coverNow[`${gx},${gy}`] === undefined || coverNow[`${gx},${gy}`] === "none" || coverNow[`${gx},${gy}`] === "water")) {
                 valid = true;
               }
             }
             return { gx: gx || Math.floor(Math.random() * maxX), gy: gy || Math.floor(Math.random() * maxY) };
           };

           const bUnitsCount = Object.values(room.gameState.units).filter(u => u.team === "B").length;
           let spawnIndex = 0;
           let spawned = 0;

           for (let i = 0; i < spawnsToMake; i++) {
              let spawnG = { gx: 0, gy: 0 };
              
              if (spawnCells.length > 0) {
                 // Try to pick a painted spawn cell
                 const key = spawnCells[(spawnIndex + Math.floor(Math.random() * spawnCells.length)) % spawnCells.length];
                 const [gx, gy] = key.split(",").map(Number);
                 spawnG = { gx, gy };
              } else {
                 // Fallback random
                 spawnG = getFallbackSpawn();
              }
              
              // Verify if there is already a unit here
              const hasUnit = Object.values(room.gameState.units).some(
                 u => Math.floor(u.x / 50) === spawnG.gx && Math.floor(u.y / 50) === spawnG.gy && u.hp > 0
              );

              if (!hasUnit) {
                 const zombieId = `zombie_${Date.now()}_${i}_${randomUUID().split("-")[0]}`;
                 const jitterX = (Math.random() - 0.5) * 20;
                 const jitterY = (Math.random() - 0.5) * 20;
                 const zUnit: Unit = {
                   id: zombieId,
                   name: `Zumbi ${bUnitsCount + i + 1}`,
                   team: "B",
                   className: "Zombie",
                   hp: CLASSES.Zombie?.hp ?? 3,
                   x: spawnG.gx * 50 + 25 + jitterX,
                   y: spawnG.gy * 50 + 25 + jitterY,
                   rotation: 0,
                   armorName: null,
                   primaryWeapon: "Mordida",
            secondaryWeapon: null,
                   actions: { move: true, intervention: true, tactical: true, chargeUsed: false },
                   movedThisTurn: 0,
                   extraMoveMeters: 0,
                   shotsThisTurn: 0,
                   primaryAmmoInMag: 1,
                   secondaryAmmoInMag: 0,
                   markedTargetId: null,
                   markedTargetExpiresAtTurn: 0,
                   attachments: [],
                   skills: [],
                   facingLockedThisTurn: false,
                   stance: "standing",
                   isBot: true,
                   botType: "zombie",
                   activeWeaponSlot: "primary"
                 };
                    room.gameState.units[zombieId] = zUnit;
                    spawned++;
                 }
                 spawnIndex++;
                 // avoid infinite loop only when using painted spawn cells (fallback always tries all spawns)
                 if (spawnCells.length > 0 && spawnIndex >= spawnCells.length * 2) break;
              }
              
              if (spawned > 0) {
                  pushLog(room, `🧟 Orda cresce! ${spawned} novos zumbis surgiram.`);
                  // Recalculate DP after spawns just to update UI accurately right away
                  room.gameState.pveState.currentDP = calculateZombiesCurrentDP(room);
              }
           }
        }
      }

    await saveRoom(room);
    res.json({
      success: true,
      gameState: room.gameState,
      currentTurn: room.currentTurn,
    });
  });

  // ── Map cover ────────────────────────────────────────────────────────────
  app.get("/api/rooms/:roomId/maps/:mapId/cover", async (req, res) => {
    const { roomId, mapId } = req.params;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    // Same merging the rest of the server uses (editor + factory defaults if needed).
    res.json(getRoomCover(room, mapId));
  });
  app.post("/api/rooms/:roomId/maps/:mapId/cover", async (req, res) => {
    const { roomId, mapId } = req.params;
    const room = await loadRoom(roomId);
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    room.coverData[mapId] = req.body;
    await saveRoom(room);
    res.json({ success: true });
  });

  // ── Per-map grid display settings (Map Editor) ───────────────────────────
  // ── AI Map Drafts ────────────────────────────────────────────────────────
  app.get("/api/ai-maps/drafts", async (req, res) => {
    const drafts = await loadAIMapDrafts();
    res.json(drafts.sort((a, b) => b.updatedAt - a.updatedAt));
  });

  app.post("/api/ai-maps/drafts", async (req, res) => {
    const { id, name, gridWidth, gridHeight, coverData, userPrompt } =
      req.body as AIMapDraft;
    if (!name || !gridWidth || !gridHeight || !coverData) {
      return res
        .status(400)
        .json({ error: "Dados incompletos para rascunho." });
    }

    const draft: AIMapDraft = {
      id: id || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      gridWidth,
      gridHeight,
      coverData,
      userPrompt: userPrompt || "",
      updatedAt: Date.now(),
    };

    await persistAIMapDraft(draft);
    res.json(draft);
  });

  app.delete("/api/ai-maps/drafts/:draftId", async (req, res) => {
    const { draftId } = req.params;
    await deleteAIMapDraftFromDB(draftId);
    res.json({ success: true });
  });

  // ── Maps — unified listing ──────────────────────────────────────────────

  /** List ALL maps (defaults + dynamic ones from DB). */
  app.get("/api/maps/all", (_req, res) => {
    res.json(Object.values(MAPS));
  });

  app.get("/api/maps/:mapId/cover", (req, res) => {
    const { mapId } = req.params;
    const dbData = globalCoverData[mapId];
    if (dbData && Object.keys(dbData).length > 0) {
      return res.json(dbData);
    }
    
    // Fallback to mission engine defaults
    const mission = getMissionEngine(mapId);
    if (mission) {
      return res.json(mission.generateCover());
    }
    
    res.json({});
  });

  app.post("/api/maps/:mapId/cover", async (req, res) => {
    const { mapId } = req.params;
    const coverData = req.body as Record<string, string>;
    if (!coverData || typeof coverData !== "object") {
      return res.status(400).json({ error: "Invalid cover data" });
    }
    await saveMapCover(mapId, coverData);
    res.json({ success: true });
  });

  app.get("/api/maps/:mapId/grid-settings", (req, res) => {
    const { mapId } = req.params;
    res.json(globalGridSettings[mapId] || DEFAULT_GRID_SETTINGS);
  });

  app.post("/api/maps/:mapId/grid-settings", async (req, res) => {
    const { mapId } = req.params;
    const settings = req.body as MapGridSettings;
    if (!isValidGridSettings(settings)) {
      return res.status(400).json({ error: "Invalid grid settings" });
    }
    // Update global cache
    globalGridSettings[mapId] = settings;
    await saveMapGridSettings(mapId, settings);
    res.json({ success: true });
  });

  app.delete("/api/maps/:mapId/grid-settings", async (req, res) => {
    delete globalGridSettings[req.params.mapId];
    res.json({ success: true });
  });

  // ── AI Maps — save / list / delete ──────────────────────────────────────

  /** List all AI-generated maps (metadata only, no image data). */
  app.get("/api/ai-maps/list", async (_req, res) => {
    const maps = await loadAIMapRecords();
    res.json(
      maps.map(({ id, name, imagePath, gridWidth, gridHeight, createdAt }) => ({
        id,
        name,
        imagePath,
        gridWidth,
        gridHeight,
        createdAt,
      })),
    );
  });

  /**
   * Save a generated map: upload the image to Firebase Storage, persist
   * the metadata to data/ai-maps.json, and register the map in the runtime
   * MAPS table so it's immediately available for match creation.
   */
  app.post("/api/ai-maps/save", async (req, res) => {
    const { name, imageBase64, mimeType, coverData, gridWidth, gridHeight } =
      req.body as {
        name?: string;
        imageBase64?: string;
        mimeType?: string;
        coverData?: Record<string, string>;
        gridWidth?: number;
        gridHeight?: number;
      };

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Nome do mapa é obrigatório." });
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Imagem base64 é obrigatória." });
    }
    if (!coverData || typeof coverData !== "object") {
      return res
        .status(400)
        .json({ error: "Dados de cobertura são obrigatórios." });
    }
    if (
      !Number.isFinite(gridWidth) ||
      !Number.isFinite(gridHeight) ||
      (gridWidth ?? 0) < 5 ||
      (gridHeight ?? 0) < 5
    ) {
      return res.status(400).json({ error: "Tamanho de grid inválido." });
    }

    const sanitizedName = name.replace(/[^a-zA-Z0-9À-ÿ _\-]/g, "").trim();
    if (!sanitizedName) {
      return res.status(400).json({ error: "Nome inválido após sanitização." });
    }

    const existing = await loadAIMapRecords();
    if (
      existing.some((m) => m.name.toLowerCase() === sanitizedName.toLowerCase())
    ) {
      return res
        .status(409)
        .json({ error: "Já existe um mapa com esse nome." });
    }

    const mapId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const safeName = sanitizedName.replace(/\s+/g, "_").toLowerCase();
    const ext =
      mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "png";
    const fileName = `${Date.now()}_${safeName}.${ext}`;

    try {
      const imagePath = await uploadToVercelBlob(
        imageBase64,
        mimeType || "image/jpeg",
        fileName,
      );

      const record: AIMapRecord = {
        id: mapId,
        name: sanitizedName,
        imagePath,
        coverData,
        gridWidth: gridWidth!,
        gridHeight: gridHeight!,
        createdAt: Date.now(),
      };

      await persistAIMapRecord(record);

      // Merge into runtime so the new map is available immediately
      MAPS[mapId] = {
        id: mapId,
        name: sanitizedName,
        imagePath,
        gridWidth: gridWidth!,
        gridHeight: gridHeight!,
      };

      // Also persist cover data for this map so the editor and battle use it
      globalCoverData[mapId] = coverData;
      saveMapCover(mapId, coverData).catch(() => {});

      console.log(`🗺️ Mapa IA salvo: "${sanitizedName}" (${mapId})`);
      res.json({ mapId, imagePath });
    } catch (err) {
      console.error("⚠️ Falha ao salvar mapa IA:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Erro desconhecido ao salvar mapa.";
      res.status(500).json({ error: message });
    }
  });

  /** Manual registration of a map with an existing image URL or path. */
  app.post("/api/ai-maps/register-manual", async (req, res) => {
    const { id, name, imagePath, gridWidth, gridHeight, coverData } =
      req.body as {
        id: string;
        name: string;
        imagePath: string;
        gridWidth: number;
        gridHeight: number;
        coverData?: Record<string, string>;
      };

    if (!id || !name || !imagePath) {
      return res
        .status(400)
        .json({ error: "Campos obrigatórios ausentes (id, name, imagePath)." });
    }

    const mapId = id;

    let existingRecord: AIMapRecord | undefined;
    try {
      const records = await loadAIMapRecords();
      existingRecord = records.find((r) => r.id === mapId);
    } catch {}

    const record: AIMapRecord = {
      id: mapId,
      name,
      imagePath,
      gridWidth: gridWidth || 40,
      gridHeight: gridHeight || 40,
      coverData: coverData || existingRecord?.coverData || {},
      createdAt: existingRecord?.createdAt || Date.now(),
    };

    try {
      await persistAIMapRecord(record);

      // Update runtime
      MAPS[mapId] = {
        id: mapId,
        name: record.name,
        imagePath: record.imagePath,
        gridWidth: record.gridWidth,
        gridHeight: record.gridHeight,
      };

      if (record.coverData) {
        await saveMapCover(mapId, record.coverData);
      }

      console.log(
        `🗺️ Mapa registrado manualmente: "${record.name}" (${mapId})`,
      );
      res.json({ success: true, mapId });
    } catch (err) {
      console.error("⚠️ Falha ao registrar mapa manual:", err);
      res.status(500).json({ error: "Erro ao persistir registro de mapa." });
    }
  });

  /** Delete an AI-generated map: removes the image from Firebase and the metadata record. */
  app.delete("/api/ai-maps/:mapId", async (req, res) => {
    const { mapId } = req.params;

    const maps = await loadAIMapRecords();
    const map = maps.find((m) => m.id === mapId);
    if (!map) {
      return res.status(404).json({ error: "Mapa IA não encontrado." });
    }

    await deleteAIMapRecord(mapId);

    // Remove from runtime
    delete MAPS[mapId];
    delete globalCoverData[mapId];

    // Remove image from Vercel Blob — best-effort
    deleteImageFile(map.imagePath).catch(() => {});

    console.log(`🗑️ Mapa IA removido: "${map.name}" (${mapId})`);
    res.json({ success: true });
  });

  // Create multer storage config (using memory buffer)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  });

  // Serve generated map images
  app.get("/api/maps/img/:fileName", (req, res) => {
    const fileName = req.params.fileName;
    const targetPath = path.join(
      __dirname,
      "data",
      "maps",
      decodeURIComponent(fileName),
    );
    if (fs.existsSync(targetPath)) {
      res.sendFile(targetPath);
    } else {
      res.status(404).send("Image not found");
    }
  });

  // ── Vite ─────────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: __dirname,
    });
    app.use(vite.middlewares);
    
    app.get("*", async (req, res, next) => {
      if (req.originalUrl.startsWith("/api")) return next();
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () =>
    console.log(`🚀 Call of War VTT rodando em http://localhost:${PORT}`),
  );
}

startServer();
