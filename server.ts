import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import fs from "fs";
import pg from "pg";

import { CLASSES, WEAPONS, ARMORS, ATTACHMENTS, SKILLS, MAPS, CELL_SIZE, METERS_PER_CELL, SCALE, MapGridSettings, DEFAULT_GRID_SETTINGS } from "./src/data/constants.js";
import { GameState, Unit, PendingGuardShot, DraftUnit, RoomPhase, DraftState, DeployState, CoverType } from "./src/types/game.js";
import { findDeployZones, validatePath, pathCostMeters, defaultDeployZones } from "./src/utils/pathfinding.js";
import { computeShotCover } from "./src/utils/cover.js";
import {
  generateMapFromLegend,
  detectCoverFromImage,
  isGeminiConfigured,
  GeminiRateLimitError,
  GeminiConfigurationError,
} from "./geminiService.js";
import { geminiRateLimiter } from "./geminiRateLimiter.js";
import { db, storage } from "./src/lib/firebase-server.js";
import { collection, doc, getDocs, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Persistent storage for global map cover data (Map Editor) ───────────────
const { Pool } = pg;
const pgPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

async function ensureCoverTable() {
  if (!pgPool) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS map_covers (
      map_id TEXT PRIMARY KEY,
      data   JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadGlobalCoverData(): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  
  // Try Firestore first
  try {
    const col = collection(db, "map-covers");
    const snap = await getDocs(col);
    snap.docs.forEach(d => { out[d.id] = d.data() as Record<string, string>; });
  } catch (err) {
    console.error("⚠️ Falha ao ler coberturas do Firestore:", err);
  }

  if (pgPool) {
    try {
      await ensureCoverTable();
      const { rows } = await pgPool.query<{ map_id: string; data: Record<string, string> }>(
        "SELECT map_id, data FROM map_covers"
      );
      for (const r of rows) {
        if (!out[r.map_id]) out[r.map_id] = r.data || {};
      }
    } catch (err) {
      console.error("⚠️ Falha ao ler coberturas do banco:", err);
    }
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
      const record = records.find(r => r.id === mapId);
      if (record) {
        record.coverData = data;
        await persistAIMapRecord(record);
      }
    } catch (err) {
      console.error(`⚠️ Falha ao sincronizar registro de metadados do mapa IA (${mapId}):`, err);
    }
  }

  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO map_covers (map_id, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (map_id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = NOW()`,
      [mapId, JSON.stringify(data)]
    );
  } catch (err) {
    console.error(`⚠️ Falha ao salvar cobertura do mapa ${mapId} no Postgres:`, err);
  }
}

// ── Persistent storage for per-map grid display settings (Map Editor) ──────
async function ensureGridSettingsTable() {
  if (!pgPool) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS map_grid_settings (
      map_id TEXT PRIMARY KEY,
      data   JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadGlobalGridSettings(): Promise<Record<string, MapGridSettings>> {
  const out: Record<string, MapGridSettings> = {};

  // Try Firestore
  try {
    const col = collection(db, "map-grid-settings");
    const snap = await getDocs(col);
    snap.docs.forEach(d => { out[d.id] = d.data() as MapGridSettings; });
  } catch (err) {
    console.error("⚠️ Falha ao ler grid settings do Firestore:", err);
  }

  if (pgPool) {
    try {
      await ensureGridSettingsTable();
      const { rows } = await pgPool.query<{ map_id: string; data: MapGridSettings }>(
        "SELECT map_id, data FROM map_grid_settings"
      );
      for (const r of rows) {
        if (r.data && !out[r.map_id]) out[r.map_id] = r.data;
      }
    } catch (err) {
      console.error("⚠️ Falha ao ler configurações de grid do banco:", err);
    }
  }
  return out;
}

async function saveMapGridSettings(mapId: string, data: MapGridSettings) {
  // Save to Firestore
  try {
    await setDoc(doc(db, "map-grid-settings", mapId), data);
  } catch (err) {
    console.error(`⚠️ Falha ao salvar grid settings no Firestore (${mapId}):`, err);
  }

  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO map_grid_settings (map_id, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (map_id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = NOW()`,
      [mapId, JSON.stringify(data)]
    );
  } catch (err) {
    console.error(`⚠️ Falha ao salvar configurações de grid do mapa ${mapId}:`, err);
  }
}

/** Lightweight runtime check so a malformed POST body doesn't corrupt state. */
function isValidGridSettings(x: unknown): x is MapGridSettings {
  if (!x || typeof x !== "object") return false;
  const g = x as Record<string, unknown>;
  return (
    typeof g.cellSize === "number" && g.cellSize >= 10 && g.cellSize <= 400 && Number.isFinite(g.cellSize) &&
    typeof g.opacity === "number" && g.opacity >= 0 && g.opacity <= 1 && Number.isFinite(g.opacity)
  );
}

interface RoomPlayer { name: string; token: string; }

interface Room {
  id: string;
  players: { A?: RoomPlayer; B?: RoomPlayer };
  gameState: GameState;
  currentTurn: "A" | "B";
  phase: RoomPhase;
  draft: DraftState;
  deploy: DeployState;
  coverData: Record<string, Record<string, string>>;
  pendingGuardShots: PendingGuardShot[];
  createdAt: number;
  winner?: "A" | "B" | null;   // set when one team has no living units left
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
    pushLog(room, `🏆 Equipe ${winner}${winnerName ? ` (${winnerName})` : ""} venceu — todas as unidades adversárias foram eliminadas.`);
  }
}

const rooms: Record<string, Room> = {};
const globalCoverData: Record<string, Record<string, string>> = {};
const globalGridSettings: Record<string, MapGridSettings> = {};

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function emptyGameState(): GameState {
  return {
    units: {},
    logs: [{ id: randomUUID(), timestamp: Date.now(), message: "Sala criada. Aguardando início da partida." }],
    mapId: "cidade_ruinas",
    turnNumber: 1,
  };
}

function emptyDraft(): DraftState {
  return { selectedMap: "cidade_ruinas", teams: { A: [], B: [] }, ready: { A: false, B: false } };
}
function emptyDeploy(): DeployState {
  return { chosenZone: { A: null, B: null }, positions: { A: {}, B: {} }, ready: { A: false, B: false } };
}

function pushLog(room: Room, message: string) {
  room.gameState.logs.push({ id: randomUUID(), timestamp: Date.now(), message });
}

function ensureUnitDefaults(u: any): Unit {
  const weapon = u.weaponName ? WEAPONS[u.weaponName] : null;
  return {
    ...u,
    movedThisTurn: u.movedThisTurn ?? 0,
    extraMoveMeters: u.extraMoveMeters ?? 0,
    shotsThisTurn: u.shotsThisTurn ?? 0,
    ammoInMag: u.ammoInMag ?? (weapon?.reload ?? 0),
    markedTargetId: u.markedTargetId ?? null,
    markedTargetExpiresAtTurn: u.markedTargetExpiresAtTurn ?? 0,
    actions: u.actions ?? { move: true, intervention: true, tactical: true, chargeUsed: false },
    stance: u.stance ?? "standing",
    facingLockedThisTurn: u.facingLockedThisTurn ?? false,
  };
}

function distanceMeters(ax: number, ay: number, bx: number, by: number) {
  return (Math.hypot(bx - ax, by - ay) / CELL_SIZE) * METERS_PER_CELL;
}

function angleDegBetween(ax: number, ay: number, bx: number, by: number) {
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

function normalizeAngle(a: number) {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

function getRoomCover(room: Room, mapId: string): Record<string, string> {
  const editorData = { ...(globalCoverData[mapId] || {}), ...(room.coverData[mapId] || {}) };
  // If the editor never added any deploy zones for this map, fall back to factory defaults
  // so that a fresh install can play immediately without opening the editor first.
  const hasAnyDeploy = Object.values(editorData).some((v) => v === "deployA" || v === "deployB");
  if (!hasAnyDeploy) {
    const map = MAPS[mapId];
    if (map) {
      const defaults = defaultDeployZones(map.gridWidth, map.gridHeight);
      // Editor data wins over defaults (so painting a wall on top of a default zone removes it).
      return { ...defaults, ...editorData };
    }
  }
  return editorData;
}

function pathHitsWall(room: Room, mapId: string, sx: number, sy: number, tx: number, ty: number): boolean {
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
  const mapCover = getRoomCover(room, room.gameState.mapId) as Record<string, CoverType>;
  const distMeters = distanceMeters(observer.x, observer.y, target.x, target.y);

  // If target is currently marked by observer, it bypasses arc/distance restrictions
  const isMarked = observer.className === "Sniper" && 
                   observer.attachments.includes("Objetiva") && 
                   observer.markedTargetId === target.id;

  // 3 & 4. Obstructed Vision or Target in Full Cover -> No Vision
  const coverInfo = computeShotCover(observer.x, observer.y, target.x, target.y, mapCover);
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
    if (diff <= 10) { // Narrow frontal cone
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
  if (u.weaponName) sum += WEAPONS[u.weaponName]?.points || 0;
  if (u.armorName) sum += ARMORS[u.armorName]?.points || 0;
  for (const a of (u.attachments || [])) sum += ATTACHMENTS[a]?.points || 0;
  for (const s of (u.skills || [])) sum += SKILLS[s]?.points || 0;
  return sum;
}
function calcDraftTeamCost(units: DraftUnit[]): number {
  return units.reduce((acc, u) => acc + calcDraftUnitCost(u), 0);
}
function validateDraftTeam(units: DraftUnit[]): { ok: boolean; error?: string } {
  if (units.length > MAX_UNITS_PER_TEAM) return { ok: false, error: `Máximo de ${MAX_UNITS_PER_TEAM} unidades por equipe.` };
  if (calcDraftTeamCost(units) > MAX_POINTS_PER_TEAM) return { ok: false, error: `Limite de ${MAX_POINTS_PER_TEAM} pontos por equipe excedido.` };
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
      const x = pos.gx * CELL_SIZE + CELL_SIZE / 2;
      const y = pos.gy * CELL_SIZE + CELL_SIZE / 2;
      const weapon = du.weaponName ? WEAPONS[du.weaponName] : null;
      out[du.id] = ensureUnitDefaults({
        id: du.id,
        name: du.name,
        team,
        className: du.className,
        x, y,
        rotation: du.rotation ?? (team === "A" ? 0 : 180),
        hp: CLASSES[du.className]?.hp ?? 5,
        armorName: du.armorName,
        weaponName: du.weaponName,
        attachments: du.attachments || [],
        skills: du.skills || [],
        ammoInMag: weapon?.reload ?? 0,
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
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as AIMapRecord));
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
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as AIMapDraft));
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

/** Upload a base64 image to Firebase Storage. */
async function uploadToFirebaseStorage(
  imageBase64: string,
  mimeType: string,
  fileName: string,
): Promise<string> {
  try {
    const pureBase64 = imageBase64.split(",").pop() || "";
    const buffer = Buffer.from(pureBase64, "base64");
    const storageRef = ref(storage, `maps/${fileName}`);
    await uploadBytes(storageRef, buffer, { contentType: mimeType });
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.error("⚠️ Erro no upload para Firebase Storage:", err);
    throw err;
  }
}

/** Delete a file from Firebase Storage */
async function deleteFromFirebaseStorage(imageUrl: string): Promise<void> {
  try {
    if (imageUrl.includes("firebasestorage.googleapis.com")) {
      const decodedUrl = decodeURIComponent(imageUrl);
      const parts = decodedUrl.split("/o/");
      if (parts.length > 1) {
        const pathParts = parts[1].split("?")[0];
        const storageRef = ref(storage, pathParts);
        await deleteObject(storageRef);
      }
    } else {
      const fileName = imageUrl.replace("/api/maps/img/", "");
      const targetPath = path.join(__dirname, "data", "maps", decodeURIComponent(fileName));
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    }
  } catch (err) {
    console.warn("⚠️ Erro ao deletar de Firebase Storage:", err);
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
    console.log(`🗺️ Mapas persistentes carregados/sincronizados: ${maps.length} mapa(s).`);
  }
}

async function startServer() {
  // Initialize persistent data before starting the server
  try {
    // 1. Load basic global data
    const [covers, settings] = await Promise.all([
      loadGlobalCoverData(),
      loadGlobalGridSettings()
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

  app.post("/api/rooms", (req, res) => {
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ error: "Nome do jogador é obrigatório" });

    let roomId = generateRoomId();
    while (rooms[roomId]) roomId = generateRoomId();

    const playerToken = randomUUID();
    rooms[roomId] = {
      id: roomId,
      players: { A: { name: playerName, token: playerToken } },
      gameState: emptyGameState(),
      currentTurn: "A",
      phase: "draft",
      draft: emptyDraft(),
      deploy: emptyDeploy(),
      coverData: {},
      pendingGuardShots: [],
      createdAt: Date.now(),
    };

    console.log(`🏠 Sala ${roomId} criada por ${playerName}`);
    res.json({ roomId, playerToken, team: "A" });
  });

  app.post("/api/rooms/:roomId/join", (req, res) => {
    const { roomId } = req.params;
    const { playerName } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada. Verifique o código." });
    if (!playerName) return res.status(400).json({ error: "Nome do jogador é obrigatório" });
    if (room.players.B) return res.status(409).json({ error: "Sala já está cheia" });

    const playerToken = randomUUID();
    room.players.B = { name: playerName, token: playerToken };
    pushLog(room, `${playerName} entrou na sala como Equipe B.`);
    console.log(`🤝 ${playerName} entrou na sala ${roomId} como Equipe B`);
    res.json({ roomId, playerToken, team: "B" });
  });

  // Public room state — strips opponent details that the player shouldn't see during draft.
  app.get("/api/rooms/:roomId/state", (req, res) => {
    const { roomId } = req.params;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });

    const status: "waiting" | "active" = room.phase === "active" ? "active" : "waiting";
    res.json({
      gameState: room.gameState,
      currentTurn: room.currentTurn,
      status,
      phase: room.phase,
      players: {
        A: room.players.A ? { name: room.players.A.name } : undefined,
        B: room.players.B ? { name: room.players.B.name } : undefined,
      },
      draft: {
        selectedMap: room.draft.selectedMap,
        teams: room.draft.teams,            // both teams visible (sizes)
        ready: room.draft.ready,
      },
      deploy: {
        chosenZone: room.deploy.chosenZone,
        positions: room.deploy.positions,
        ready: room.deploy.ready,
      },
      pendingGuardShots: room.pendingGuardShots,
      winner: room.winner ?? null,
    });
  });

  // ── Helper: ensure caller is a known player and return their team ──────────
  function authPlayer(room: Room, playerToken: string): { team?: "A" | "B"; error?: string; status?: number } {
    if (room.players.A?.token === playerToken) return { team: "A" };
    if (room.players.B?.token === playerToken) return { team: "B" };
    return { error: "Token de jogador inválido", status: 403 };
  }

  // ── Draft endpoints ────────────────────────────────────────────────────────

  app.post("/api/rooms/:roomId/draft/team", (req, res) => {
    const { roomId } = req.params;
    const { playerToken, units } = req.body as { playerToken: string; units: DraftUnit[] };
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "draft") return res.status(400).json({ error: "Não estamos na fase de Draft." });

    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    if (!Array.isArray(units)) return res.status(400).json({ error: "Formato de unidades inválido" });
    const v = validateDraftTeam(units);
    if (!v.ok) return res.status(400).json({ error: v.error });

    room.draft.teams[auth.team!] = units;
    // Editing the team always cancels your own ready flag (prevents accidental start).
    room.draft.ready[auth.team!] = false;
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/draft/map", (req, res) => {
    const { roomId } = req.params;
    const { playerToken, mapId } = req.body as { playerToken: string; mapId: string };
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "draft") return res.status(400).json({ error: "Não estamos na fase de Draft." });
    if (!MAPS[mapId]) return res.status(400).json({ error: "Mapa inválido" });

    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });
    if (auth.team !== "A") return res.status(403).json({ error: "Apenas o Jogador A escolhe o mapa." });

    room.draft.selectedMap = mapId;
    // Map change cancels ready states (both players need to re-confirm)
    room.draft.ready.A = false;
    room.draft.ready.B = false;
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/draft/ready", (req, res) => {
    const { roomId } = req.params;
    const { playerToken, ready } = req.body as { playerToken: string; ready: boolean };
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "draft") return res.status(400).json({ error: "Não estamos na fase de Draft." });

    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    if (ready) {
      if (!room.players.A || !room.players.B) {
        return res.status(400).json({ error: "Aguardando o segundo jogador entrar na sala." });
      }
      const myTeam = room.draft.teams[auth.team!];
      if (myTeam.length === 0) return res.status(400).json({ error: "Recrute pelo menos uma unidade." });
      const v = validateDraftTeam(myTeam);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    room.draft.ready[auth.team!] = !!ready;

    // Both ready → advance to deploy phase
    if (room.draft.ready.A && room.draft.ready.B) {
      room.phase = "deploy";
      room.deploy = emptyDeploy();
      room.gameState.mapId = room.draft.selectedMap;
      pushLog(room, `🗺️ Ambos prontos! Avançando para a fase de Posicionamento.`);
    }
    res.json({ success: true });
  });

  // ── Deploy endpoints ───────────────────────────────────────────────────────

  app.get("/api/rooms/:roomId/deploy/zones", (req, res) => {
    const { roomId } = req.params;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const cover = getRoomCover(room, room.draft.selectedMap);
    res.json({
      A: findDeployZones(cover, "A"),
      B: findDeployZones(cover, "B"),
    });
  });

  app.post("/api/rooms/:roomId/deploy/zone", (req, res) => {
    const { roomId } = req.params;
    const { playerToken, zoneId } = req.body as { playerToken: string; zoneId: string };
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "deploy") return res.status(400).json({ error: "Não estamos na fase de Deploy." });
    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    const cover = getRoomCover(room, room.draft.selectedMap);
    const myZones = findDeployZones(cover, auth.team!);
    const zone = myZones.find(z => z.id === zoneId);
    if (!zone) return res.status(404).json({ error: "Zona de deploy não encontrada para sua equipe." });

    // If switching zones, drop any positions outside the new zone
    const valid = new Set(zone.cells);
    const positions = room.deploy.positions[auth.team!];
    for (const [uid, pos] of Object.entries(positions)) {
      if (!valid.has(`${pos.gx},${pos.gy}`)) delete positions[uid];
    }
    room.deploy.chosenZone[auth.team!] = zoneId;
    room.deploy.ready[auth.team!] = false;
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/deploy/positions", (req, res) => {
    const { roomId } = req.params;
    const { playerToken, positions } = req.body as { playerToken: string; positions: Record<string, { gx: number; gy: number }> };
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "deploy") return res.status(400).json({ error: "Não estamos na fase de Deploy." });
    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    const zoneId = room.deploy.chosenZone[auth.team!];
    if (!zoneId) return res.status(400).json({ error: "Escolha uma zona de deploy primeiro." });
    const cover = getRoomCover(room, room.draft.selectedMap);
    const zone = findDeployZones(cover, auth.team!).find(z => z.id === zoneId);
    if (!zone) return res.status(400).json({ error: "Zona inválida." });
    const validCells = new Set(zone.cells);

    const myDraftIds = new Set(room.draft.teams[auth.team!].map(u => u.id));
    const usedCells = new Set<string>();
    const cleaned: Record<string, { gx: number; gy: number }> = {};
    for (const [uid, pos] of Object.entries(positions || {})) {
      if (!myDraftIds.has(uid)) continue;
      const k = `${pos.gx},${pos.gy}`;
      if (!validCells.has(k)) return res.status(400).json({ error: "Posição fora da zona escolhida." });
      if (usedCells.has(k)) return res.status(400).json({ error: "Duas unidades não podem ocupar a mesma célula." });
      // Etapa 3: tokens não podem ser posicionados em cobertura parcial/total.
      const cellCover = cover[k] as CoverType | undefined;
      if (cellCover === "half" || cellCover === "full") {
        return res.status(400).json({
          error: cellCover === "full"
            ? `Não é possível posicionar uma unidade em (${pos.gx},${pos.gy}): cobertura total.`
            : `Não é possível posicionar uma unidade em (${pos.gx},${pos.gy}): cobertura parcial.`,
        });
      }
      usedCells.add(k);
      cleaned[uid] = { gx: pos.gx, gy: pos.gy };
    }
    room.deploy.positions[auth.team!] = cleaned;
    room.deploy.ready[auth.team!] = false;
    res.json({ success: true });
  });

  app.post("/api/rooms/:roomId/deploy/ready", (req, res) => {
    const { roomId } = req.params;
    const { playerToken, ready } = req.body as { playerToken: string; ready: boolean };
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    if (room.phase !== "deploy") return res.status(400).json({ error: "Não estamos na fase de Deploy." });
    const auth = authPlayer(room, playerToken);
    if (auth.error) return res.status(auth.status!).json({ error: auth.error });

    if (ready) {
      if (!room.deploy.chosenZone[auth.team!]) return res.status(400).json({ error: "Escolha uma zona primeiro." });
      const draftLen = room.draft.teams[auth.team!].length;
      const placed = Object.keys(room.deploy.positions[auth.team!]).length;
      if (placed !== draftLen) return res.status(400).json({ error: `Posicione todas as ${draftLen} unidades antes de ficar pronto.` });

      // Etapa 3: revalidar que nenhum token está em half/full antes de
      // permitir a transição para batalha (defesa em profundidade — pode
      // acontecer se o editor de cobertura for alterado depois do deploy).
      const coverNow = getRoomCover(room, room.draft.selectedMap);
      const draftIndex = new Map(room.draft.teams[auth.team!].map(u => [u.id, u]));
      for (const [uid, pos] of Object.entries(room.deploy.positions[auth.team!])) {
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
      const units = buildBattleUnits(room);
      room.gameState = {
        units,
        mapId: room.draft.selectedMap,
        turnNumber: 1,
        logs: [{ id: randomUUID(), timestamp: Date.now(), message: "⚔️ Batalha iniciada! Turno da Equipe A." }],
      };
      room.phase = "active";
      room.currentTurn = "A";
      room.pendingGuardShots = [];
      console.log(`⚔️ Batalha iniciada na sala ${roomId}`);
    }
    res.json({ success: true });
  });

  // ── Helper: validate it's caller's turn during active battle ──────────────
  function validateTurn(room: Room, playerToken: string): { error?: string; status?: number } {
    if (room.phase !== "active") return { error: "Batalha não iniciada", status: 400 };
    
    // Check for pending guard shots before anything else
    if (room.pendingGuardShots.length > 0) {
      return { error: "Ação bloqueada: aguardando reação de Guarda do oponente.", status: 409 };
    }

    const currentPlayer = room.players[room.currentTurn];
    if (!currentPlayer || currentPlayer.token !== playerToken) return { error: "Não é seu turno", status: 403 };
    return {};
  }

  // ── Movement (path-based) ─────────────────────────────────────────────────
  // Body: { playerToken, unitId, path: [{gx,gy},...] }   path[0] is the unit's current cell.
  app.post("/api/rooms/:roomId/move", (req, res) => {
    const { roomId } = req.params;
    const { unitId, path: cellPath, playerToken } = req.body as {
      unitId: string; playerToken: string; path: { gx: number; gy: number }[];
    };
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });

    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.move && unit.extraMoveMeters <= unit.movedThisTurn) {
      return res.status(400).json({ error: "Sem Ação de Movimento disponível neste turno." });
    }
    if (!Array.isArray(cellPath) || cellPath.length < 2) {
      return res.status(400).json({ error: "Caminho inválido." });
    }

    // Confirm starting cell matches the unit's current position
    const curGx = Math.floor(unit.x / CELL_SIZE);
    const curGy = Math.floor(unit.y / CELL_SIZE);
    if (cellPath[0].gx !== curGx || cellPath[0].gy !== curGy) {
      return res.status(400).json({ error: "Início do caminho não coincide com a posição da unidade." });
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
    const validation = validatePath(cellPath, mapInfo.gridWidth, mapInfo.gridHeight, cover, enemyOccupied, allyOccupied);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    // Defesa em profundidade: além de validatePath já rejeitar atravessar
    // half/full (Etapa 2), garantir explicitamente que o destino não pousa
    // sobre cobertura sólida. Tokens não podem ocupar half/full nem como
    // ponto final de movimento (Etapa 3).
    const destStep = cellPath[cellPath.length - 1];
    const destKey = `${destStep.gx},${destStep.gy}`;
    const destCover = cover[destKey] as CoverType | undefined;
    if (destCover === "half" || destCover === "full") {
      return res.status(400).json({
        error: destCover === "full"
          ? "Não é possível terminar o movimento sobre cobertura total."
          : "Não é possível terminar o movimento sobre cobertura parcial.",
      });
    }

    const cost = pathCostMeters(cellPath, cover);
    const armorPenal = unit.armorName ? (ARMORS[unit.armorName]?.movePenal || 0) : 0;
    const classInfo = CLASSES[unit.className];
    let baseMove = (classInfo?.movement || SCALE.MOVIMENTO_BASE) - armorPenal;
    if (unit.stance === "prone") baseMove = Math.min(baseMove, 3);
    const maxMove = baseMove + unit.extraMoveMeters;

    if (unit.movedThisTurn + cost > maxMove + 0.01) {
      const remaining = (maxMove - unit.movedThisTurn).toFixed(1);
      return res.status(400).json({ error: `Movimento excede o limite. Restam ${remaining}m, custo ${cost.toFixed(1)}m.` });
    }

    const dest = cellPath[cellPath.length - 1];
    const prevX = unit.x;
    const prevY = unit.y;

    unit.x = dest.gx * CELL_SIZE + CELL_SIZE / 2;
    unit.y = dest.gy * CELL_SIZE + CELL_SIZE / 2;
    unit.movedThisTurn += cost;
    unit.actions.move = false;
    unit.facingLockedThisTurn = true;

    const className = CLASSES[unit.className]?.name || unit.className;
    pushLog(room, `${unit.name} (${className}) moveu ${cost.toFixed(1)}m (${cellPath.length - 1} célula(s)).`);

    // Guard reactions - Check vision at every point along the path
    const guards = Object.values(room.gameState.units).filter(
      (u) => (u as Unit).team !== unit.team && (u as Unit).stance === "guard" && (u as Unit).hp > 0,
    );
    
    for (const guardObj of guards) {
      const guard = guardObj as Unit;
      let detected = false;

      // Check every step of the path
      for (const step of cellPath) {
        // Create a temporary "ghost" unit to check FOV at that specific position
        const tempUnitPos = {
          ...unit,
          x: step.gx * CELL_SIZE + CELL_SIZE / 2,
          y: step.gy * CELL_SIZE + CELL_SIZE / 2
        };

        if (isInFOV(guard, tempUnitPos, room)) {
          detected = true;
          break;
        }
      }

      if (detected) {
        const exists = room.pendingGuardShots.some(
          (p) => p.guardUnitId === guard.id && p.targetUnitId === unit.id,
        );
        if (!exists) {
          const pending: PendingGuardShot = {
            id: randomUUID(),
            guardUnitId: guard.id,
            targetUnitId: unit.id,
            guardTeam: guard.team as "A" | "B",
          };
          room.pendingGuardShots.push(pending);
          pushLog(room, `🛡️ ${guard.name} (Postura de Guarda) detectou ${unit.name} durante o movimento!`);
        }
      }
      
      // Emboscada check - Support class can keep shooting at anyone in FOV
      if (guard.skills?.includes("Emboscada")) {
        const otherEnemies = Object.values(room.gameState.units).filter(u => u.team === unit.team && u.hp > 0 && u.id !== unit.id);
        for (const other of otherEnemies) {
          if (isInFOV(guard, other, room)) {
            const exists = room.pendingGuardShots.some(
              (p) => p.guardUnitId === guard.id && p.targetUnitId === other.id,
            );
            if (!exists) {
              const pending: PendingGuardShot = {
                id: randomUUID(),
                guardUnitId: guard.id,
                targetUnitId: other.id,
                guardTeam: guard.team as "A" | "B",
              };
              room.pendingGuardShots.push(pending);
              pushLog(room, `🛡️ ${guard.name} (Emboscada) mantém a mira e detectou ${other.name}!`);
            }
          }
        }
      }
    }

    res.json({ success: true, gameState: room.gameState });
  });

  // ── Facing ────────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/facing", (req, res) => {
    const { roomId } = req.params;
    const { unitId, rotation, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });

    if (!unit.actions.tactical) return res.status(400).json({ error: "Sem Ação Tática disponível para mudar a direção." });
    unit.actions.tactical = false;
    unit.rotation = rotation;
    pushLog(room, `${unit.name} mudou a direção (Ação Tática).`);
    
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Shoot ─────────────────────────────────────────────────────────────────
  function performShot(
    room: Room, attacker: Unit, target: Unit,
    coverLevel: string, distancePenalty: number, fromGuard = false,
  ) {
    const weapon = attacker.weaponName ? WEAPONS[attacker.weaponName] : null;
    if (!weapon) return { ok: false, error: "Atirador sem arma" };

    let targetIsSurprised = !fromGuard && !isInFOV(target, attacker, room);

    if (targetIsSurprised && target.skills && target.skills.includes("Sexto Sentido")) {
      targetIsSurprised = false;
      pushLog(room, `🛡️ Sexto Sentido: ${target.name} percebeu o ataque e não foi surpreendido!`);
    }

    const effectiveCover = targetIsSurprised ? "none" : coverLevel;

    const distMeters = distanceMeters(attacker.x, attacker.y, target.x, target.y);
    const atts = attacker.attachments || [];
    let attHitBonus = 0;
    let attCritBonus = 0;

    for (const attName of atts) {
      const attInfo = ATTACHMENTS[attName];
      if (!attInfo) continue;
      
      const weaponMatches = !attInfo.weaponClasses || attInfo.weaponClasses.includes(weapon.weaponClass);
      const minRangeOk = attInfo.minRange === undefined || distMeters > attInfo.minRange;
      const maxRangeOk = attInfo.maxRange === undefined || distMeters <= attInfo.maxRange;
      const proneOk = !attInfo.requireProne || attacker.stance === "prone";

      if (weaponMatches && minRangeOk && maxRangeOk && proneOk) {
        attHitBonus += attInfo.hitBonus || 0;
        attCritBonus += attInfo.critBonus || 0;
      }
    }

    // Check if it's from the back for "Sexto Sentido"
    const targetRot = target.rotation ?? 0;
    const angToAttacker = angleDegBetween(target.x, target.y, attacker.x, attacker.y);
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
    if (hitRate < 5) hitRate = 5;

    const roll = Math.floor(Math.random() * 100) + 1;
    let hit = roll <= hitRate;

    // Trigger Sexto Sentido on miss from back
    if (!hit && target.skills?.includes("Sexto Sentido") && isFromBack) {
      target.extraMoveMeters = (target.extraMoveMeters || 0) + 1.5;
      pushLog(room, `🛡️ Sexto Sentido: ${target.name} esquivou do tiro pelas costas e ganhou +1.5m (3cm) de movimento livre!`);
    }

    const attackerClassName = CLASSES[attacker.className]?.name || attacker.className;
    const targetClassName = CLASSES[target.className]?.name || target.className;

    if (weapon.name === "Morteiro" && !hit) {
      const scatterRoll = Math.floor(Math.random() * 10) + 1;
      if (scatterRoll >= 5) { hit = true; pushLog(room, `Morteiro desviou mas acertou (Desvio: ${scatterRoll}).`); }
      else pushLog(room, `Morteiro errou e desviou ${SCALE.DESVIO_MORTEIRO}m (Desvio: ${scatterRoll}).`);
    }

    if (hit) {
      let critChance = weapon.criticalChance || 0;
      if (attackerClassName === "Sniper") critChance += 10;
      critChance += attCritBonus;
      if (coverLevel === "half") critChance -= 5;
      if (coverLevel === "full") critChance -= 15;
      if (target.stance === "prone") critChance -= 5;
      if (critChance < 0) critChance = 0;
      if (critChance > 100) critChance = 100;
      const critRoll = Math.floor(Math.random() * 100) + 1;
      const isCrit = critChance > 0 && critRoll <= critChance;
      let damage = weapon.damage;
      if (isCrit) damage = weapon.critical;
      const armorRed = target.armorName ? (ARMORS[target.armorName]?.reduction || 0) : 0;
      damage = Math.max(1, damage - Math.floor(armorRed / 2));
      target.hp -= damage;
      if (isCrit) pushLog(room, `💥 CRÍTICO! ${attacker.name} (${attackerClassName}) atirou em ${target.name} (${targetClassName}) com ${weapon.name} causando ${damage} de dano! (Hit ${roll}/${hitRate}% · Crit ${critRoll}/${critChance}%)`);
      else pushLog(room, `[ACERTO] ${attacker.name} (${attackerClassName}) atirou em ${target.name} (${targetClassName}) com ${weapon.name} causando ${damage} de dano. (Hit ${roll}/${hitRate}% · Crit ${critRoll}/${critChance}%)`);
      if (target.hp <= 0) { pushLog(room, `☠️ ${target.name} (${targetClassName}) foi eliminado!`); delete room.gameState.units[target.id]; checkWinner(room); }
    } else {
      pushLog(room, `[ERRO] ${attacker.name} (${attackerClassName}) errou o tiro em ${target.name} (${targetClassName}). (Hit ${roll}/${hitRate}%)`);
      
      // Sexto Sentido Trigger
      if (isFromBack && target.skills && target.skills.includes("Sexto Sentido")) {
        target.extraMoveMeters += 3; // 3 meters free move (2 cells approximately)
        target.actions.move = true;   // Grant move action if it was used
        pushLog(room, `⚡ Sexto Sentido: ${target.name} sentiu o perigo pelas costas, o inimigo errou e ele ganhou 3m de movimento livre!`);
      }
    }
    return { ok: true };
  }

  app.post("/api/rooms/:roomId/shoot", (req, res) => {
    const { roomId } = req.params;
    // Note: `coverLevel` is intentionally NOT read from req.body anymore — the
    // server is the single source of truth for cover and recomputes it below
    // from the map state. `distancePenalty` is still received from the client
    // because it depends on the weapon stats which the client already knows
    // (and there is no way for the client to forge a meaningful advantage).
    const { attackerId, targetId, distancePenalty, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const attacker = room.gameState.units[attackerId];
    const target = room.gameState.units[targetId];
    if (!attacker || !target) return res.status(404).json({ error: "Unidade não encontrada" });
    if (attacker.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    const weapon = attacker.weaponName ? WEAPONS[attacker.weaponName] : null;
    if (!weapon) return res.status(400).json({ error: "Atirador sem arma" });
    if (attacker.ammoInMag <= 0) return res.status(400).json({ error: "Sem munição no carregador. Recarregue antes de atirar." });
    if (attacker.shotsThisTurn >= weapon.shots) return res.status(400).json({ error: `Limite de ${weapon.shots} disparo(s) por turno atingido.` });
    if (attacker.shotsThisTurn === 0 && !attacker.actions.intervention && !attacker.skills?.includes("Linha de Frente")) return res.status(400).json({ error: "Sem Ação de Intervenção disponível neste turno." });

    if (!isInFOV(attacker, target, room)) {
      return res.status(400).json({ error: "O alvo está fora do seu campo de visão (FOV)." });
    }

    // Authoritative cover calculation (Etapa 4).
    const mapCover = getRoomCover(room, room.gameState.mapId) as Record<string, CoverType>;
    const coverInfo = computeShotCover(attacker.x, attacker.y, target.x, target.y, mapCover);
    if (coverInfo.hasWall) return res.status(400).json({ error: "Há paredes bloqueando o caminho!" });

    if (attacker.shotsThisTurn === 0 && !attacker.skills?.includes("Linha de Frente")) attacker.actions.intervention = false;
    attacker.shotsThisTurn += 1;
    attacker.ammoInMag -= 1;
    const r = performShot(room, attacker, target, coverInfo.cover, distancePenalty);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ success: true, gameState: room.gameState, cover: coverInfo });
  });

  // ── Mark Target ──────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/mark-target", (req, res) => {
    const { roomId } = req.params;
    const { sniperId, targetId, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    
    const sniper = room.gameState.units[sniperId];
    const target = room.gameState.units[targetId];
    if (!sniper || !target) return res.status(404).json({ error: "Unidade não encontrada" });
    if (sniper.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    
    if (sniper.className !== "Sniper" || !sniper.attachments.includes("Objetiva")) {
      return res.status(400).json({ error: "Apenas Snipers com Objetiva podem marcar alvos." });
    }
    if (!sniper.actions.tactical) {
      return res.status(400).json({ error: "Sem Ação Tática disponível para marcar o alvo." });
    }
    if (!isInFOV(sniper, target, room)) {
      return res.status(400).json({ error: "O alvo deve estar no seu campo de visão para ser marcado." });
    }

    const distMeters = distanceMeters(sniper.x, sniper.y, target.x, target.y);
    const weapon = sniper.weaponName ? WEAPONS[sniper.weaponName] : null;
    const isCompensado = sniper.skills?.includes("Disparo Compensado") && weapon?.weaponClass === "Rifle";
    const range = SCALE.ALCANCE_LONGO + (isCompensado ? 10 : 0);
    
    if (distMeters > range) {
      return res.status(400).json({ error: `O alvo está além do alcance da arma (${distMeters.toFixed(1)}m > ${range}m) e não pode ser marcado.` });
    }

    // Marcação consume Ação Tática e dura até o final do próximo turno do Sniper
    sniper.actions.tactical = false;
    sniper.markedTargetId = target.id;
    sniper.markedTargetExpiresAtTurn = room.gameState.turnNumber + 4; // Turno do Sniper -> Turno Inimigo -> Turno Sniper (pode atirar) -> Turno Inimigo (limpa antes de começar)

    pushLog(room, `🎯 ${sniper.name} marcou ${target.name} como alvo. (A marcação dura 1 turno)`);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Toggle Door ──────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/toggle-door", (req, res) => {
    const { roomId } = req.params;
    const { unitId, cellKey, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção para abrir/fechar porta." });

    const mapCover = getRoomCover(room, room.gameState.mapId) as Record<string, string>;
    const currentType = mapCover[cellKey];

    if (currentType !== "doorOpen" && currentType !== "doorClose") {
      return res.status(400).json({ error: "Esta célula não é uma porta." });
    }

    // Proximity check: unit must be within 1.5m (adjacent)
    const [gx, gy] = cellKey.split(",").map(Number);
    const cellWorldX = (gx + 0.5) * CELL_SIZE;
    const cellWorldY = (gy + 0.5) * CELL_SIZE;
    const dist = Math.hypot(unit.x - cellWorldX, unit.y - cellWorldY);
    if (dist > CELL_SIZE * 1.6) { // allow some margin for center-to-center
      return res.status(400).json({ error: "Você precisa estar adjacente à porta para interagir." });
    }

    const nextType = currentType === "doorOpen" ? "doorClose" : "doorOpen";
    mapCover[cellKey] = nextType;
    room.coverData[room.gameState.mapId] = mapCover;
    unit.actions.intervention = false;

    const actionText = nextType === "doorOpen" ? "abriu" : "fechou";
    pushLog(room, `🚪 ${unit.name} ${actionText} uma porta.`);
    res.json({ success: true, gameState: room.gameState, mapCover });
  });

  // ── Heal ─────────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/heal", (req, res) => {
    const { roomId } = req.params;
    const { healerId, targetId, playerToken } = req.body;
    const room = rooms[roomId];
    
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    
    const healer = room.gameState.units[healerId];
    const target = room.gameState.units[targetId];
    
    if (!healer || !target) return res.status(404).json({ error: "Unidade não encontrada" });
    if (healer.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!healer.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção disponível." });
    if (!healer.className.includes("Médico")) return res.status(400).json({ error: "Apenas unidades da classe Médico podem curar." });
    if (healer.team !== target.team) return res.status(403).json({ error: "Só é possível curar aliados." });
    
    // Check distance (max 3 cells: ~4.5m)
    const distMeters = distanceMeters(healer.x, healer.y, target.x, target.y);
    const maxHealDist = 4.5;
    if (distMeters > maxHealDist) {
      return res.status(400).json({ error: `Alvo muito distante para curar (${distMeters.toFixed(1)}m > ${maxHealDist}m).` });
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
    
    pushLog(room, `💉 ${healer.name} curou ${target.name} em ${actualHeal} HP.`);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Reload ───────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/reload", (req, res) => {
    const { roomId } = req.params;
    const { unitId, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção disponível." });
    const weapon = unit.weaponName ? WEAPONS[unit.weaponName] : null;
    if (!weapon) return res.status(400).json({ error: "Sem arma equipada" });
    unit.actions.intervention = false;
    unit.ammoInMag = weapon.reload;
    pushLog(room, `🔁 ${unit.name} recarregou ${weapon.name} (${weapon.reload} munições).`);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Charge ───────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/charge", (req, res) => {
    const { roomId } = req.params;
    const { unitId, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção para usar Investida." });
    if (unit.actions.chargeUsed) return res.status(400).json({ error: "Investida já utilizada neste turno." });
    unit.actions.intervention = false;
    unit.actions.chargeUsed = true;
    const classInfo = CLASSES[unit.className];
    const baseMove = classInfo?.movement || SCALE.MOVIMENTO_BASE;
    unit.extraMoveMeters += baseMove;
    unit.actions.move = true;
    pushLog(room, `🏃 ${unit.name} usou Investida (+${baseMove.toFixed(1)}m de movimento).`);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Guard ────────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/guard", (req, res) => {
    const { roomId } = req.params;
    const { unitId, watchAngle, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.intervention) return res.status(400).json({ error: "Sem Ação de Intervenção para Postura de Guarda." });
    unit.actions.intervention = false;
    unit.stance = "guard";
    pushLog(room, `🛡️ ${unit.name} assumiu Postura de Guarda (seguindo sua visão atual).`);
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Prone ────────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/prone", (req, res) => {
    const { roomId } = req.params;
    const { unitId, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    const unit = room.gameState.units[unitId];
    if (!unit) return res.status(404).json({ error: "Unidade não encontrada" });
    if (unit.team !== room.currentTurn) return res.status(403).json({ error: "Esta unidade não é sua" });
    if (!unit.actions.tactical) return res.status(400).json({ error: "Sem Ação Tática disponível." });
    unit.actions.tactical = false;
    if (unit.stance === "prone") { unit.stance = "standing"; pushLog(room, `${unit.name} levantou-se do chão.`); }
    else { unit.stance = "prone"; pushLog(room, `${unit.name} jogou-se ao chão.`); }
    res.json({ success: true, gameState: room.gameState });
  });

  // ── Guard shot resolution ────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/guard-shot", (req, res) => {
    const { roomId } = req.params;
    // `coverLevel` removed from the body — server recomputes (Etapa 4).
    const { pendingId, accept, distancePenalty, playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const idx = room.pendingGuardShots.findIndex((p) => p.id === pendingId);
    if (idx === -1) return res.status(404).json({ error: "Tiro de guarda não encontrado" });
    const pending = room.pendingGuardShots[idx];
    const guardOwner = room.players[pending.guardTeam];
    if (!guardOwner || guardOwner.token !== playerToken) return res.status(403).json({ error: "Apenas o jogador da guarda pode resolver este tiro." });
    const guard = room.gameState.units[pending.guardUnitId];
    const target = room.gameState.units[pending.targetUnitId];
    room.pendingGuardShots.splice(idx, 1);
    if (!guard || !target) return res.json({ success: true, gameState: room.gameState });
    if (!accept) { pushLog(room, `${guard.name} optou por não atirar (Postura de Guarda).`); return res.json({ success: true, gameState: room.gameState }); }
    const weapon = guard.weaponName ? WEAPONS[guard.weaponName] : null;
    if (!weapon) { pushLog(room, `${guard.name} não tem arma para o tiro de guarda.`); return res.json({ success: true, gameState: room.gameState }); }
    if (guard.ammoInMag <= 0) { pushLog(room, `${guard.name} sem munição para o tiro de guarda.`); return res.json({ success: true, gameState: room.gameState }); }

    const mapCover = getRoomCover(room, room.gameState.mapId) as Record<string, CoverType>;
    const coverInfo = computeShotCover(guard.x, guard.y, target.x, target.y, mapCover);
    if (coverInfo.hasWall) {
      // Wall appeared between guard and target after the trigger — shot is wasted.
      pushLog(room, `${guard.name} tentou o tiro de guarda mas o caminho está bloqueado por parede.`);
      if (guard.skills?.includes("Emboscada") && guard.ammoInMag > 0) {
        pushLog(room, `🛡️ ${guard.name} possui Emboscada e mantém a Postura de Guarda apesar do bloqueio!`);
      } else {
        guard.stance = "standing";
      }
      return res.json({ success: true, gameState: room.gameState, cover: coverInfo });
    }

    guard.ammoInMag -= 1;
    performShot(room, guard, target, coverInfo.cover, distancePenalty ?? 0, true);
    
    if (guard.skills?.includes("Emboscada") && guard.ammoInMag > 0) {
      pushLog(room, `🛡️ ${guard.name} possui Emboscada e mantém a Postura de Guarda!`);
    } else {
      guard.stance = "standing";
    }
    
    res.json({ success: true, gameState: room.gameState, cover: coverInfo });
  });

  // ── End Turn ─────────────────────────────────────────────────────────────
  app.post("/api/rooms/:roomId/endturn", (req, res) => {
    const { roomId } = req.params;
    const { playerToken } = req.body;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    const v = validateTurn(room, playerToken);
    if (v.error) return res.status(v.status!).json({ error: v.error });
    Object.values(room.gameState.units).forEach((unit) => {
      if (unit.team === room.currentTurn) {
        unit.movedThisTurn = 0;
        unit.extraMoveMeters = 0;
        unit.shotsThisTurn = 0;
        unit.actions = { move: true, intervention: true, tactical: true, chargeUsed: false };
        unit.facingLockedThisTurn = false;
      } else {
        if (unit.stance === "guard") { unit.stance = "standing"; }
      }
    });
    room.currentTurn = room.currentTurn === "A" ? "B" : "A";
    room.gameState.turnNumber++;

    // Clear expired marked targets for the NEW player whose turn is starting.
    Object.values(room.gameState.units).forEach((unit) => {
      if (unit.team === room.currentTurn && unit.markedTargetId) {
        if (room.gameState.turnNumber >= unit.markedTargetExpiresAtTurn) {
          unit.markedTargetId = null;
        }
      }
    });

    const nextPlayer = room.players[room.currentTurn];
    pushLog(room, `🔄 Turno ${room.gameState.turnNumber} - Equipe ${room.currentTurn}${nextPlayer ? ` — ${nextPlayer.name}` : ""}.`);
    res.json({ success: true, gameState: room.gameState, currentTurn: room.currentTurn });
  });

  // ── Map cover ────────────────────────────────────────────────────────────
  app.get("/api/rooms/:roomId/maps/:mapId/cover", (req, res) => {
    const { roomId, mapId } = req.params;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    // Same merging the rest of the server uses (editor + factory defaults if needed).
    res.json(getRoomCover(room, mapId));
  });
  app.post("/api/rooms/:roomId/maps/:mapId/cover", (req, res) => {
    const { roomId, mapId } = req.params;
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: "Sala não encontrada" });
    room.coverData[mapId] = req.body;
    res.json({ success: true });
  });
  app.get("/api/maps/:mapId/cover", (req, res) => { res.json(globalCoverData[req.params.mapId] || {}); });
  app.post("/api/maps/:mapId/cover", (req, res) => {
    globalCoverData[req.params.mapId] = req.body;
    saveMapCover(req.params.mapId, req.body).catch(() => {});
    res.json({ success: true });
  });

  // ── Per-map grid display settings (Map Editor) ───────────────────────────
  app.get("/api/maps/:mapId/grid-settings", (req, res) => {
    res.json(globalGridSettings[req.params.mapId] || DEFAULT_GRID_SETTINGS);
  });
  app.post("/api/maps/:mapId/grid-settings", (req, res) => {
    if (!isValidGridSettings(req.body)) {
      return res.status(400).json({ error: "Configurações inválidas. Esperado { cellSize: 10–400, opacity: 0–1 }." });
    }
    globalGridSettings[req.params.mapId] = req.body;
    saveMapGridSettings(req.params.mapId, req.body).catch(() => {});
    res.json({ success: true });
  });
  app.delete("/api/maps/:mapId/grid-settings", async (req, res) => {
    delete globalGridSettings[req.params.mapId];
    if (pgPool) {
      try { await pgPool.query("DELETE FROM map_grid_settings WHERE map_id = $1", [req.params.mapId]); }
      catch (err) { console.error(`⚠️ Falha ao remover configurações de grid do mapa ${req.params.mapId}:`, err); }
    }
    res.json({ success: true });
  });

  // ── AI Map Drafts ────────────────────────────────────────────────────────
  app.get("/api/ai-maps/drafts", async (req, res) => {
    const drafts = await loadAIMapDrafts();
    res.json(drafts.sort((a, b) => b.updatedAt - a.updatedAt));
  });

  app.post("/api/ai-maps/drafts", async (req, res) => {
    const { id, name, gridWidth, gridHeight, coverData, userPrompt } = req.body as AIMapDraft;
    if (!name || !gridWidth || !gridHeight || !coverData) {
      return res.status(400).json({ error: "Dados incompletos para rascunho." });
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

  // ── AI Maps — save / list / delete ──────────────────────────────────────

  /** List all AI-generated maps (metadata only, no image data). */
  app.get("/api/ai-maps/list", async (_req, res) => {
    const maps = await loadAIMapRecords();
    res.json(maps.map(({ id, name, imagePath, gridWidth, gridHeight, createdAt }) => ({
      id, name, imagePath, gridWidth, gridHeight, createdAt,
    })));
  });

  /**
   * Save a generated map: upload the image to Firebase Storage, persist
   * the metadata to data/ai-maps.json, and register the map in the runtime
   * MAPS table so it's immediately available for match creation.
   */
  app.post("/api/ai-maps/save", async (req, res) => {
    const { name, imageBase64, mimeType, coverData, gridWidth, gridHeight } = req.body as {
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
      return res.status(400).json({ error: "Dados de cobertura são obrigatórios." });
    }
    if (!Number.isFinite(gridWidth) || !Number.isFinite(gridHeight) ||
        (gridWidth ?? 0) < 5 || (gridHeight ?? 0) < 5) {
      return res.status(400).json({ error: "Tamanho de grid inválido." });
    }

    const sanitizedName = name.replace(/[^a-zA-Z0-9À-ÿ _\-]/g, "").trim();
    if (!sanitizedName) {
      return res.status(400).json({ error: "Nome inválido após sanitização." });
    }

    const existing = await loadAIMapRecords();
    if (existing.some((m) => m.name.toLowerCase() === sanitizedName.toLowerCase())) {
      return res.status(409).json({ error: "Já existe um mapa com esse nome." });
    }

    const mapId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const safeName = sanitizedName.replace(/\s+/g, "_").toLowerCase();
    const ext = (mimeType === "image/jpeg" || mimeType === "image/jpg") ? "jpg" : "png";
    const fileName = `${Date.now()}_${safeName}.${ext}`;

    try {
      const imagePath = await uploadToFirebaseStorage(
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
      const message = err instanceof Error ? err.message : "Erro desconhecido ao salvar mapa.";
      res.status(500).json({ error: message });
    }
  });

  /** Manual registration of a map with an existing image URL or path. */
  app.post("/api/ai-maps/register-manual", async (req, res) => {
    const { id, name, imagePath, gridWidth, gridHeight, coverData } = req.body as {
      id: string;
      name: string;
      imagePath: string;
      gridWidth: number;
      gridHeight: number;
      coverData?: Record<string, string>;
    };

    if (!id || !name || !imagePath) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes (id, name, imagePath)." });
    }

    const mapId = id.startsWith("ai_") ? id : `ai_manual_${id}`;
    
    const record: AIMapRecord = {
      id: mapId,
      name,
      imagePath,
      gridWidth: gridWidth || 40,
      gridHeight: gridHeight || 40,
      coverData: coverData || {},
      createdAt: Date.now(),
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

      console.log(`🗺️ Mapa registrado manualmente: "${record.name}" (${mapId})`);
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
    if (pgPool) {
      pgPool
        .query("DELETE FROM map_covers WHERE map_id = $1", [mapId])
        .catch((e) => console.warn("⚠️ Falha ao limpar cobertura do banco para mapa IA:", e));
    }

    // Remove image from Firebase Storage — best-effort
    deleteFromFirebaseStorage(map.imagePath).catch(() => {});

    console.log(`🗑️ Mapa IA removido: "${map.name}" (${mapId})`);
    res.json({ success: true });
  });

  // Serve generated map images
  app.get("/api/maps/img/:fileName", (req, res) => {
    const fileName = req.params.fileName;
    const targetPath = path.join(__dirname, "data", "maps", decodeURIComponent(fileName));
    if (fs.existsSync(targetPath)) {
      res.sendFile(targetPath);
    } else {
      res.status(404).send("Image not found");
    }
  });

  // ── AI Map Generator ─────────────────────────────────────────────────────
  // Status endpoint so the client can show a live "X/8 in last minute" counter
  // and disable the Generate button when the limiter is empty.
  app.get("/api/ai-maps/status", (_req, res) => {
    const status = geminiRateLimiter.getStatus();
    res.json({ ...status, configured: isGeminiConfigured() });
  });

  // Generates a tactical map from the painted legend, then runs cover detection
  // on the generated image. Returns a single payload so the client can render
  // the preview + overlay in one shot.
  app.post("/api/ai-maps/generate", async (req, res) => {
    const { legendImage, userPrompt, gridWidth, gridHeight, mapGenModel } = req.body as {
      legendImage?: string;
      userPrompt?: string;
      gridWidth?: number;
      gridHeight?: number;
      mapGenModel?: string;
    };
    if (!legendImage || typeof legendImage !== "string") {
      return res.status(400).json({ error: "Imagem de legenda ausente." });
    }
    if (!Number.isFinite(gridWidth) || !Number.isFinite(gridHeight) || (gridWidth ?? 0) < 5 || (gridHeight ?? 0) < 5) {
      return res.status(400).json({ error: "Tamanho de grid inválido." });
    }
    try {
      const generated = await generateMapFromLegend(
        legendImage,
        (userPrompt || "").toString(),
        gridWidth!,
        gridHeight!,
        mapGenModel
      );
      // Cover detection consumes a second slot from the limiter on purpose
      // (the user spec accounts for it in the 8 req/min cap).
      const detectedCover = await detectCoverFromImage(
        generated.imageBase64,
        gridWidth!,
        gridHeight!,
      );
      return res.json({
        generatedImage: generated.imageBase64,
        mimeType: generated.mimeType,
        detectedCover,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      if (err instanceof GeminiRateLimitError) {
        return res.status(429).json({
          error: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        });
      }
      if (err instanceof GeminiConfigurationError) {
        return res.status(503).json({ error: err.message });
      }
      console.error("⚠️ Falha na geração de mapa pela IA:", err);
      const message = err?.message || "Erro desconhecido na geração.";
      const details = err?.status || err?.stack || JSON.stringify(err) || "Sem detalhes da API Google";
      return res.status(500).json({ error: message, details });
    }
  });

  // ── Vite ─────────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Call of War VTT rodando em http://localhost:${PORT}`));
}

startServer();
