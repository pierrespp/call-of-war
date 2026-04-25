import { GameState, MapCoverData, PendingGuardShot, DraftUnit, RoomPhase, DeployZone } from "../types/game";

export interface RoomStateResponse {
  gameState: GameState;
  currentTurn: "A" | "B";
  status: "waiting" | "active";
  phase: RoomPhase;
  players: { A?: { name: string }; B?: { name: string }; };
  draft: {
    selectedMap: string;
    teams: { A: DraftUnit[]; B: DraftUnit[] };
    ready: { A: boolean; B: boolean };
  };
  deploy: {
    chosenZone: { A: string | null; B: string | null };
    positions: { A: Record<string, { gx: number; gy: number }>; B: Record<string, { gx: number; gy: number }> };
    ready: { A: boolean; B: boolean };
  };
  pendingGuardShots: PendingGuardShot[];
  winner?: "A" | "B" | null;
}

export interface PlayerSession {
  playerName: string;
  roomId: string;
  playerToken: string;
  playerTeam: "A" | "B";
  sandboxTokens?: { A: string; B: string };
}

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro desconhecido");
  return data as T;
}

export const apiService = {
  async createRoom(playerName: string) {
    return request<{ roomId: string; playerToken: string; team: "A" }>("/rooms", {
      method: "POST",
      body: JSON.stringify({ playerName }),
    });
  },
  async joinRoom(roomId: string, playerName: string) {
    return request<{ roomId: string; playerToken: string; team: "B" }>(`/rooms/${roomId}/join`, {
      method: "POST",
      body: JSON.stringify({ playerName }),
    });
  },
  async getRoomState(roomId: string) {
    return request<RoomStateResponse>(`/rooms/${roomId}/state`);
  },

  // ── Draft ──────────────────────────────────────────────────────────────
  async setDraftTeam(roomId: string, playerToken: string, units: DraftUnit[]) {
    return request<{ success: boolean }>(`/rooms/${roomId}/draft/team`, {
      method: "POST",
      body: JSON.stringify({ playerToken, units }),
    });
  },
  async setDraftMap(roomId: string, playerToken: string, mapId: string) {
    return request<{ success: boolean }>(`/rooms/${roomId}/draft/map`, {
      method: "POST",
      body: JSON.stringify({ playerToken, mapId }),
    });
  },
  async setDraftReady(roomId: string, playerToken: string, ready: boolean) {
    return request<{ success: boolean }>(`/rooms/${roomId}/draft/ready`, {
      method: "POST",
      body: JSON.stringify({ playerToken, ready }),
    });
  },

  // ── Deploy ─────────────────────────────────────────────────────────────
  async getDeployZones(roomId: string) {
    return request<{ A: DeployZone[]; B: DeployZone[] }>(`/rooms/${roomId}/deploy/zones`);
  },
  async setDeployZone(roomId: string, playerToken: string, zoneId: string) {
    return request<{ success: boolean }>(`/rooms/${roomId}/deploy/zone`, {
      method: "POST",
      body: JSON.stringify({ playerToken, zoneId }),
    });
  },
  async setDeployPositions(roomId: string, playerToken: string, positions: Record<string, { gx: number; gy: number }>) {
    return request<{ success: boolean }>(`/rooms/${roomId}/deploy/positions`, {
      method: "POST",
      body: JSON.stringify({ playerToken, positions }),
    });
  },
  async setDeployReady(roomId: string, playerToken: string, ready: boolean) {
    return request<{ success: boolean }>(`/rooms/${roomId}/deploy/ready`, {
      method: "POST",
      body: JSON.stringify({ playerToken, ready }),
    });
  },

  // ── Battle actions ─────────────────────────────────────────────────────
  async moveUnit(roomId: string, playerToken: string, unitId: string, path: { gx: number; gy: number }[]) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/move`, {
      method: "POST",
      body: JSON.stringify({ playerToken, unitId, path }),
    });
  },
  // Note: `coverLevel` is no longer sent — the server recomputes cover from
  // the authoritative map state (Etapa 4). The client still sends
  // `distancePenalty` because it depends only on weapon stats.
  async shootUnit(
    roomId: string, playerToken: string,
    attackerId: string, targetId: string,
    distancePenalty: number,
  ) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/shoot`, {
      method: "POST",
      body: JSON.stringify({ playerToken, attackerId, targetId, distancePenalty }),
    });
  },
  async healUnit(roomId: string, playerToken: string, healerId: string, targetId: string) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/heal`, {
      method: "POST",
      body: JSON.stringify({ playerToken, healerId, targetId }),
    });
  },
  async reloadUnit(roomId: string, playerToken: string, unitId: string) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/reload`, {
      method: "POST", body: JSON.stringify({ playerToken, unitId }),
    });
  },
  async chargeUnit(roomId: string, playerToken: string, unitId: string) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/charge`, {
      method: "POST", body: JSON.stringify({ playerToken, unitId }),
    });
  },
  async guardUnit(roomId: string, playerToken: string, unitId: string, watchAngle: number) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/guard`, {
      method: "POST", body: JSON.stringify({ playerToken, unitId, watchAngle }),
    });
  },
  async toggleProne(roomId: string, playerToken: string, unitId: string) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/prone`, {
      method: "POST", body: JSON.stringify({ playerToken, unitId }),
    });
  },
  async setFacing(roomId: string, playerToken: string, unitId: string, rotation: number) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/facing`, {
      method: "POST", body: JSON.stringify({ playerToken, unitId, rotation }),
    });
  },
  async resolveGuardShot(
    roomId: string, playerToken: string, pendingId: string, accept: boolean,
    distancePenalty: number,
  ) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/guard-shot`, {
      method: "POST",
      body: JSON.stringify({ playerToken, pendingId, accept, distancePenalty }),
    });
  },
  async endTurn(roomId: string, playerToken: string) {
    return request<{ success: boolean; gameState: GameState; currentTurn: "A" | "B" }>(`/rooms/${roomId}/endturn`, {
      method: "POST", body: JSON.stringify({ playerToken }),
    });
  },
  async markTarget(roomId: string, playerToken: string, sniperId: string, targetId: string) {
    return request<{ success: boolean; gameState: GameState }>(`/rooms/${roomId}/mark-target`, {
      method: "POST", body: JSON.stringify({ playerToken, sniperId, targetId }),
    });
  },
  async getMapCover(roomId: string, mapId: string): Promise<MapCoverData> {
    try { return await request<MapCoverData>(`/rooms/${roomId}/maps/${mapId}/cover`); }
    catch { return {}; }
  },

  // ── Session storage ────────────────────────────────────────────────────
  saveSession(session: PlayerSession) { localStorage.setItem("cowSession", JSON.stringify(session)); },
  loadSession(): PlayerSession | null {
    try { const raw = localStorage.getItem("cowSession"); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  clearSession() { localStorage.removeItem("cowSession"); },
};
