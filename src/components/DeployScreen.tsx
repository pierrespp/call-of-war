import React, { useEffect, useMemo, useRef, useState } from "react";
import { CELL_SIZE, MAPS, CLASSES } from "../data/constants";
import { apiService, RoomStateResponse } from "../services/apiService";
import { DeployZone, DraftUnit, MapCoverData } from "../types/game";
import { Check, X, ArrowLeft } from "lucide-react";

interface Props {
  roomId: string;
  playerToken: string;
  playerTeam: "A" | "B";
  state: RoomStateResponse;
  onLeave: () => void;
}

export function DeployScreen({ roomId, playerToken, playerTeam, state, onLeave }: Props) {
  const mapId = state.draft.selectedMap;
  const mapInfo = MAPS[mapId];
  const myDraft: DraftUnit[] = state.draft.teams[playerTeam] || [];
  const myReady = state.deploy.ready[playerTeam];
  const opponentTeam = playerTeam === "A" ? "B" : "A";
  const opponentReady = state.deploy.ready[opponentTeam];
  const opponentName = state.players[opponentTeam]?.name;

  const [zones, setZones] = useState<{ A: DeployZone[]; B: DeployZone[] }>({ A: [], B: [] });
  const [mapCover, setMapCover] = useState<MapCoverData>({});
  const [zoom, setZoom] = useState(0.4);
  const [camera, setCamera] = useState({ x: 1000, y: 1000 });
  const [isPanning, setIsPanning] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingReady, setSavingReady] = useState(false);

  // Local positions (synced with server). On server change we hydrate.
  const [positions, setPositions] = useState<Record<string, { gx: number; gy: number }>>({});
  const hydratedRef = useRef(false);

  useEffect(() => {
    apiService.getDeployZones(roomId).then(setZones).catch(() => {});
    apiService.getMapCover(roomId, mapId).then(setMapCover).catch(() => {});
  }, [roomId, mapId]);

  useEffect(() => {
    if (!hydratedRef.current) {
      setPositions(state.deploy.positions[playerTeam] || {});
      hydratedRef.current = true;
    }
  }, [state, playerTeam]);

  const myZones = zones[playerTeam] || [];
  const myChosenZoneId = state.deploy.chosenZone[playerTeam];
  const myZone = myZones.find(z => z.id === myChosenZoneId) || null;

  // Auto-pick the first zone if only one exists and none selected yet
  useEffect(() => {
    if (myChosenZoneId) return;
    if (myZones.length === 1) {
      apiService.setDeployZone(roomId, playerToken, myZones[0].id).catch(() => {});
    }
  }, [myZones, myChosenZoneId, roomId, playerToken]);

  const pickZone = async (zoneId: string) => {
    try {
      await apiService.setDeployZone(roomId, playerToken, zoneId);
      setPositions({});  // clear local positions; server clears too
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro");
    }
  };

  const placeOrSwap = async (gx: number, gy: number) => {
    if (!myZone || !selectedUnitId) return;
    const cellKey = `${gx},${gy}`;
    if (!myZone.cells.includes(cellKey)) { setErrorMsg("Célula fora da sua zona."); return; }
    // Etapa 3: tokens não podem ser posicionados em cobertura parcial/total.
    const cellCover = mapCover[cellKey];
    if (cellCover === "half" || cellCover === "full") {
      setErrorMsg(cellCover === "full"
        ? "Cobertura total: não é possível posicionar tokens aqui."
        : "Cobertura parcial: não é possível posicionar tokens aqui.");
      return;
    }
    const occupiedBy = Object.entries(positions).find(([, p]) => p.gx === gx && p.gy === gy);
    let next: Record<string, { gx: number; gy: number }>;
    if (occupiedBy && occupiedBy[0] !== selectedUnitId) {
      // Swap: the other unit takes the selected unit's previous spot (if any)
      const myOldPos = positions[selectedUnitId];
      next = { ...positions, [selectedUnitId]: { gx, gy } };
      if (myOldPos) next[occupiedBy[0]] = myOldPos;
      else delete next[occupiedBy[0]];
    } else {
      next = { ...positions, [selectedUnitId]: { gx, gy } };
    }
    setPositions(next);
    try {
      await apiService.setDeployPositions(roomId, playerToken, next);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao posicionar");
    }
  };

  const removePlacement = async (unitId: string) => {
    const next = { ...positions };
    delete next[unitId];
    setPositions(next);
    try { await apiService.setDeployPositions(roomId, playerToken, next); }
    catch (e) { setErrorMsg(e instanceof Error ? e.message : "Erro"); }
  };

  const handleToggleReady = async () => {
    setSavingReady(true);
    setErrorMsg(null);
    try { await apiService.setDeployReady(roomId, playerToken, !myReady); }
    catch (e) { setErrorMsg(e instanceof Error ? e.message : "Erro"); }
    finally { setSavingReady(false); }
  };

  const placedCount = Object.keys(positions).length;
  const canBeReady = !!myZone && placedCount === myDraft.length && myDraft.length > 0;

  const unitsByPosition = useMemo(() => {
    const m = new Map<string, string>();
    for (const [uid, p] of Object.entries(positions)) m.set(`${p.gx},${p.gy}`, uid);
    return m;
  }, [positions]);

  const teamColor = playerTeam === "A" ? "bg-blue-600 border-blue-300" : "bg-red-600 border-red-300";

  if (!mapInfo) return <div className="p-8 text-white">Mapa inválido.</div>;

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-200 overflow-hidden">
      {/* Sidebar */}
      <div className="w-96 bg-neutral-800 border-r border-neutral-700 flex flex-col shadow-xl z-10">
        <div className="p-5 border-b border-neutral-700">
          <button onClick={onLeave} className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-4 text-sm">
            <ArrowLeft size={14} /> Sair da sala
          </button>
          <h2 className="text-2xl font-black mb-1">Posicionamento</h2>
          <p className="text-neutral-500 text-sm">Escolha sua zona e posicione cada unidade.</p>
        </div>

        {/* Opponent banner */}
        <div className="p-3 border-b border-neutral-700 bg-neutral-900 flex items-center justify-between text-sm">
          <span className="text-neutral-400">{opponentName || "Adversário"} (Equipe {opponentTeam})</span>
          <span className={`flex items-center gap-1 font-bold ${opponentReady ? "text-emerald-400" : "text-neutral-500"}`}>
            {opponentReady ? <><Check size={14} /> Pronto</> : <><X size={14} /> Aguardando</>}
          </span>
        </div>

        {/* Zones picker */}
        <div className="p-5 border-b border-neutral-700">
          <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Zonas Disponíveis (Equipe {playerTeam})</h3>
          {myZones.length === 0 ? (
            <p className="text-xs text-red-400">Nenhuma zona de deploy definida no editor.</p>
          ) : (
            <div className="space-y-2">
              {myZones.map((z, i) => {
                const isActive = myChosenZoneId === z.id;
                return (
                  <button
                    key={z.id}
                    onClick={() => pickZone(z.id)}
                    className={`w-full text-left p-2 rounded border-2 text-xs font-bold transition-all ${
                      isActive ? "ring-2 ring-indigo-400 bg-indigo-600/20 border-indigo-500" : "bg-neutral-900 border-neutral-700 hover:border-neutral-500"
                    }`}
                  >
                    Zona {i + 1} ({z.id}) — {z.cells.length} células
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Units list */}
        <div className="p-5 flex-1 overflow-y-auto">
          <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Suas Unidades — clique para selecionar</h3>
          <p className="text-xs text-neutral-500 mb-3">Posicionadas: {placedCount} / {myDraft.length}</p>
          {myDraft.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">Nenhuma unidade no draft.</p>
          ) : (
            <div className="space-y-1">
              {myDraft.map(u => {
                const placed = !!positions[u.id];
                const isSel = selectedUnitId === u.id;
                return (
                  <div key={u.id} className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedUnitId(u.id)}
                      className={`flex-1 text-left p-2 rounded text-sm transition-colors border ${
                        isSel ? "bg-indigo-600 border-indigo-400 text-white" :
                        placed ? "bg-neutral-900 border-emerald-600/40 text-neutral-300 hover:bg-neutral-800" :
                        "bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold">{u.name}</span>
                        <span className="text-[10px]">{placed ? "✓" : "—"}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500">{CLASSES[u.className]?.name}</div>
                    </button>
                    {placed && (
                      <button onClick={() => removePlacement(u.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-900/20 rounded">x</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="m-4 p-2 bg-red-900/40 border border-red-700 rounded text-xs text-red-200">{errorMsg}</div>
        )}

        {/* Ready button */}
        <div className="p-4 border-t border-neutral-700 bg-neutral-800">
          <button
            onClick={handleToggleReady}
            disabled={savingReady || (!myReady && !canBeReady)}
            className={`w-full py-3 rounded-xl font-black text-white tracking-wide shadow-lg transition-all ${
              myReady ? "bg-amber-600 hover:bg-amber-500" :
              canBeReady ? "bg-green-600 hover:bg-green-500" :
              "bg-neutral-700 text-neutral-500 cursor-not-allowed"
            }`}
          >
            {myReady ? "✕ CANCELAR PRONTO" : "✓ PRONTO PARA INICIAR"}
          </button>
          {!canBeReady && !myReady && (
            <p className="text-xs text-neutral-500 text-center mt-2">
              {myZone ? `Posicione todas as ${myDraft.length} unidades.` : "Escolha uma zona primeiro."}
            </p>
          )}
        </div>
      </div>

      {/* Map area */}
      <div
        className="flex-1 relative bg-neutral-900 overflow-hidden cursor-crosshair"
        onWheel={(e) => {
          const newZoom = e.deltaY < 0 ? zoom * 1.08 : zoom / 1.08;
          setZoom(Math.min(Math.max(0.05, newZoom), 8));
        }}
        onMouseDown={(e) => { if (e.button === 1 || e.button === 2) setIsPanning(true); }}
        onMouseMove={(e) => { if (isPanning) setCamera(prev => ({ x: prev.x - e.movementX / zoom, y: prev.y - e.movementY / zoom })); }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => setIsPanning(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="absolute"
          style={{
            left: "50%", top: "50%",
            transformOrigin: "0 0",
            transform: `scale(${zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
            width: mapInfo.gridWidth * CELL_SIZE,
            height: mapInfo.gridHeight * CELL_SIZE,
            backgroundColor: "#1a1a1a",
            backgroundImage: `url(${mapInfo.imagePath})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "0 0",
          }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const wx = (e.clientX - rect.left) / zoom;
            const wy = (e.clientY - rect.top) / zoom;
            const gx = Math.floor(wx / CELL_SIZE);
            const gy = Math.floor(wy / CELL_SIZE);
            if (gx < 0 || gy < 0 || gx >= mapInfo.gridWidth || gy >= mapInfo.gridHeight) return;
            placeOrSwap(gx, gy);
          }}
        >
          {/* Grid */}
          {zoom > 0.15 && (
            <div className="absolute inset-0 pointer-events-none z-10 mix-blend-overlay opacity-80" style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,${zoom < 0.4 ? 0.3 : 0.6}) ${Math.max(1, 2 / zoom)}px, transparent ${Math.max(1, 2 / zoom)}px), linear-gradient(to bottom, rgba(255,255,255,${zoom < 0.4 ? 0.3 : 0.6}) ${Math.max(1, 2 / zoom)}px, transparent ${Math.max(1, 2 / zoom)}px)`,
              backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
            }} />
          )}

          {/* Cover overlay (read-only display) */}
          {Object.entries(mapCover).map(([key, type]) => {
            if (!type || type === "none") return null;
            const [gx, gy] = key.split(",").map(Number);
            let bgColor = "transparent", borderColor = "transparent";
            if (type === "half") { bgColor = "rgba(234,179,8,0.18)"; borderColor = "rgba(234,179,8,0.45)"; }
            else if (type === "full") { bgColor = "rgba(239,68,68,0.18)"; borderColor = "rgba(239,68,68,0.45)"; }
            else if (type === "wall") { bgColor = "rgba(64,64,64,0.6)"; borderColor = "rgba(115,115,115,0.8)"; }
            else if (type === "deployA") { bgColor = "rgba(96,165,250,0.18)"; borderColor = "rgba(96,165,250,0.5)"; }
            else if (type === "deployB") { bgColor = "rgba(252,165,165,0.18)"; borderColor = "rgba(252,165,165,0.5)"; }
            else if (type === "water") { bgColor = "rgba(30,64,175,0.4)"; borderColor = "rgba(30,64,175,0.7)"; }
            return (
              <div key={key} className="absolute pointer-events-none border-2 z-10"
                style={{ left: gx * CELL_SIZE, top: gy * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE, backgroundColor: bgColor, borderColor }} />
            );
          })}

          {/* Highlight my chosen zone cells (brighter).
              Cells inside the zone that are also marked as half/full cover are
              flagged in red — the player cannot place a token there (Etapa 3). */}
          {myZone && myZone.cells.map(cellKey => {
            const [gx, gy] = cellKey.split(",").map(Number);
            const isOccupied = unitsByPosition.has(cellKey);
            const cellCover = mapCover[cellKey];
            const isForbidden = cellCover === "half" || cellCover === "full";
            const baseBg = isOccupied
              ? "rgba(34,197,94,0.15)"
              : (playerTeam === "A" ? "rgba(96,165,250,0.40)" : "rgba(252,165,165,0.45)");
            const baseBorder = playerTeam === "A" ? "rgba(96,165,250,0.95)" : "rgba(252,165,165,0.95)";
            return (
              <div key={`zh-${cellKey}`} className="absolute pointer-events-none z-20 border-2"
                style={{
                  left: gx * CELL_SIZE, top: gy * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE,
                  backgroundColor: isForbidden ? "rgba(220,38,38,0.18)" : baseBg,
                  backgroundImage: isForbidden
                    ? "repeating-linear-gradient(45deg, rgba(220,38,38,0.55) 0 6px, transparent 6px 12px)"
                    : undefined,
                  borderColor: isForbidden ? "rgba(220,38,38,0.95)" : baseBorder,
                }}
                title={isForbidden ? `Bloqueado: cobertura ${cellCover === "full" ? "total" : "parcial"}` : undefined} />
            );
          })}

          {/* Placed units */}
          {Object.entries(positions).map(([uid, p]) => {
            const u = myDraft.find(x => x.id === uid);
            if (!u) return null;
            const cx = p.gx * CELL_SIZE + CELL_SIZE / 2;
            const cy = p.gy * CELL_SIZE + CELL_SIZE / 2;
            const isSel = selectedUnitId === uid;
            return (
              <div
                key={uid}
                onClick={(e) => { e.stopPropagation(); setSelectedUnitId(uid); }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${teamColor} flex items-center justify-center text-white text-xs font-bold shadow-lg z-30 cursor-pointer ${isSel ? "ring-4 ring-yellow-400" : ""}`}
                style={{ left: cx, top: cy, width: Math.round(CELL_SIZE * 0.88), height: Math.round(CELL_SIZE * 0.88) }}
                title={u.name}
              >
                {u.name.substring(0, 2).toUpperCase()}
              </div>
            );
          })}
        </div>

        {/* Hint overlay */}
        {!selectedUnitId && myDraft.length > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm pointer-events-none z-50 border border-neutral-700 shadow-lg">
            Selecione uma unidade na lista lateral para posicionar.
          </div>
        )}
        {selectedUnitId && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-600/90 text-white px-4 py-2 rounded-full text-sm pointer-events-none z-50 border border-indigo-400 shadow-lg">
            Clique numa célula da sua zona para posicionar <b>{myDraft.find(x => x.id === selectedUnitId)?.name}</b>.
          </div>
        )}
      </div>
    </div>
  );
}
