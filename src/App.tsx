import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { GameState, Unit, MapCoverData, CoverType, PendingGuardShot } from "./types/game";
import { SCALE, CELL_SIZE, METERS_PER_CELL, ARMORS, WEAPONS, SKILLS, ATTACHMENTS, MAPS, CLASSES } from "./data/constants";
import { cn } from "./lib/utils";
// ... 
import { getImageUrl } from "./lib/utils";
import { useImages } from "./contexts/ImageContext";
import { Crosshair, Move, Shield, Heart, Activity, Info, X, Map as MapIcon, Copy, Check, LogOut, Users, UserPlus, RotateCcw, Zap, Eye, ChevronsDown } from "lucide-react";
import { SoldiersInfoMenu } from "./components/SoldiersInfoMenu";
import { CreateMatchMenu } from "./components/CreateMatchMenu";
import { MapEditorMenu } from "./components/MapEditorMenu";
import { AIMapCreatorMenu } from "./components/AIMapCreatorMenu";
import { DeployScreen } from "./components/DeployScreen";
import { FOVOverlay } from "./components/FOVOverlay";
import { apiService, RoomStateResponse } from "./services/apiService";
import { computeReachable, reconstructPath, pathCostMeters, ReachableCell, PathStep } from "./utils/pathfinding";
import { computeShotCover } from "./utils/cover";

type AppState = "login" | "lobby" | "createMatch" | "deploy" | "waiting" | "battle" | "soldiers" | "editor" | "aiMapCreator";

export default function App() {
  const { getMapImage, getRoleImage } = useImages();
  // ── Auth / Session ────────────────────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("login");
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [playerTeam, setPlayerTeam] = useState<"A" | "B" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // ── Room / Game State ─────────────────────────────────────────────────────
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentTurn, setCurrentTurn] = useState<"A" | "B">("A");
  const [roomStatus, setRoomStatus] = useState<"waiting" | "active">("waiting");
  const [roomPlayers, setRoomPlayers] = useState<{ A?: { name: string }; B?: { name: string } }>({});
  const [mapCoverConfig, setMapCoverConfig] = useState<MapCoverData>({});
  const [roomState, setRoomState] = useState<RoomStateResponse | null>(null);

  // ── Movement Preview State ───────────────────────────────────────────────
  const [moveReachable, setMoveReachable] = useState<Map<string, ReachableCell> | null>(null);
  const [moveHoverCell, setMoveHoverCell] = useState<{ gx: number; gy: number } | null>(null);
  const [moveManualPath, setMoveManualPath] = useState<PathStep[] | null>(null);    // active manual mode
  const [isMoving, setIsMoving] = useState(false);

  // ── Phase transition loading flag ────────────────────────────────────────
  const [phaseTransitioning, setPhaseTransitioning] = useState<null | "deploy" | "battle">(null);

  // ── Battle UI State ───────────────────────────────────────────────────────
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<"move" | "shoot" | "mark" | "heal" | null>(null);
  const [zoom, setZoom] = useState(0.4);
  const [camera, setCamera] = useState({ x: 1000, y: 1000 });
  const [isPanning, setIsPanning] = useState(false);
  const [modalData, setModalData] = useState<{ title: string; content: string[] } | null>(null);
  const [pendingShootAction, setPendingShootAction] = useState<{
    sourceId: string; targetId: string; coverLevel: CoverType; hitRate: number; distanceMeters: number; distancePenalty: number;
    /** Half-cover cells along the line that are actively granting the bonus
     *  under the new proximity rule (Etapa 4). Highlighted in the preview. */
    contributingHalfCells: string[];
    /** Full-cover cells along the line. Highlighted in the preview. */
    contributingFullCells: string[];
  } | null>(null);
  const [pendingGuardShots, setPendingGuardShots] = useState<PendingGuardShot[]>([]);
  const [guardShotDecision, setGuardShotDecision] = useState<PendingGuardShot | null>(null);
  const [facingMode, setFacingMode] = useState<"facing" | "guard" | null>(null);
  const [moveSubMode, setMoveSubMode] = useState<"auto" | "manual">("auto");

  // ── Cover Hover Tooltip (battle only) ────────────────────────────────────
  const [coverHoverLabel, setCoverHoverLabel] = useState<string | null>(null);
  const [mouseScreenPos, setMouseScreenPos] = useState({ x: 0, y: 0 });
  const [sandboxTokens, setSandboxTokens] = useState<{ A: string, B: string } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const isMyTurn = playerTeam === currentTurn;

  // ── Session Restoration ───────────────────────────────────────────────────
  useEffect(() => {
    const session = apiService.loadSession();
    if (session) {
      setPlayerName(session.playerName);
      setRoomId(session.roomId);
      setPlayerToken(session.playerToken);
      setPlayerTeam(session.playerTeam);
      if (session.sandboxTokens) setSandboxTokens(session.sandboxTokens);
      setAppState("battle");
    }
  }, []);

  // ── Room Polling ──────────────────────────────────────────────────────────
  const fetchRoomState = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await apiService.getRoomState(roomId);
      setRoomState(data);
      setGameState(data.gameState);
      setCurrentTurn(data.currentTurn);
      setRoomPlayers(data.players);
      // Only update pendingGuardShots when no guard-shot modal is open,
      // to prevent the polling from dismissing a decision the player hasn't answered yet.
      setGuardShotDecision(prev => {
        const incoming = data.pendingGuardShots || [];
        if (!prev) {
          // No modal open — sync freely
          setPendingGuardShots(incoming);
          return null;
        }
        // Modal is open — keep it open as long as the pending still exists on the server.
        // If the server removed it (someone else resolved it), then close.
        const stillExists = incoming.some(p => p.id === prev.id);
        setPendingGuardShots(incoming);
        return stillExists ? prev : null;
      });
      if (data.status !== roomStatus) setRoomStatus(data.status);

      // Phase-based routing
      const phase = data.phase;
      const inFlowState = appState === "waiting" || appState === "createMatch" || appState === "deploy" || appState === "battle";
      if (inFlowState) {
        if (phase === "draft" && appState !== "createMatch") {
          setPhaseTransitioning(null);
          setAppState("createMatch");
        }
        else if (phase === "deploy" && appState !== "deploy") {
          setPhaseTransitioning("deploy");
          setAppState("deploy");
          // brief loading shimmer; cleared after the next successful poll
          setTimeout(() => setPhaseTransitioning(null), 600);
        }
        else if (phase === "active" && appState !== "battle") {
          setPhaseTransitioning("battle");
          const coverData = await apiService.getMapCover(roomId, data.gameState.mapId);
          setMapCoverConfig(coverData || {});
          setAppState("battle");
          setTimeout(() => setPhaseTransitioning(null), 600);
        }
      }

      if (phase === "active" && appState === "battle" && data.gameState.mapId) {
        const coverData = await apiService.getMapCover(roomId, data.gameState.mapId);
        setMapCoverConfig(coverData || {});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("não encontrada") || msg.includes("not found") || msg.includes("404")) {
        apiService.clearSession();
        setRoomId(null);
        setPlayerToken(null);
        setPlayerTeam(null);
        setGameState(null);
        setRoomState(null);
        setAppState("login");
      }
    }
  }, [roomId, appState, roomStatus]);

  useEffect(() => {
    if (appState !== "waiting" && appState !== "createMatch" && appState !== "deploy" && appState !== "battle") return;
    fetchRoomState();
    const interval = setInterval(fetchRoomState, 1500);
    return () => clearInterval(interval);
  }, [appState, fetchRoomState]);

  // Auto-open guard shot decision modal when a new pending shot for my team appears.
  // Uses a ref to track which IDs have already been shown, preventing the modal from
  // reopening for the same pending shot on every poll cycle.
  const shownGuardShotIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (guardShotDecision) return; // already showing one
    const mine = pendingGuardShots.find(
      (p) => p.guardTeam === playerTeam && !shownGuardShotIdsRef.current.has(p.id)
    );
    if (mine) {
      shownGuardShotIdsRef.current.add(mine.id);
      setGuardShotDecision(mine);
    }
  }, [pendingGuardShots, playerTeam, guardShotDecision]);

  // Global keyboard shortcuts: Esc cancels move/shoot/facing/modal · Enter confirms move modal
  useEffect(() => {
    if (appState !== "battle") return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs/textareas
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      if (e.key === "Escape") {
        if (facingMode) { setFacingMode(null); return; }
        if (targetMode) {
          setTargetMode(null);
          setMoveReachable(null);
          setMoveHoverCell(null);
          setMoveManualPath(null);
          return;
        }
        if (selectedUnitId) { setSelectedUnitId(null); return; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, facingMode, targetMode, selectedUnitId, isMoving]);

  // ── Room Actions ──────────────────────────────────────────────────────────
  const handleCreateRoom = async () => {
    if (!playerName.trim()) return;
    setIsLoading(true);
    try {
      const result = await apiService.createRoom(playerName.trim());
      setRoomId(result.roomId);
      setPlayerToken(result.playerToken);
      setPlayerTeam("A");
      apiService.saveSession({ playerName: playerName.trim(), roomId: result.roomId, playerToken: result.playerToken, playerTeam: "A" });
      setAppState("createMatch");
    } catch (e) {
      alert("Erro ao criar sala: " + (e instanceof Error ? e.message : "Erro desconhecido"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSandboxRoom = async () => {
    if (!playerName.trim()) return;
    setIsLoading(true);
    try {
      const result = await apiService.createRoom(playerName.trim() + " (A)");
      const joinResult = await apiService.joinRoom(result.roomId, playerName.trim() + " (B)");
      setRoomId(result.roomId);
      setPlayerToken(result.playerToken);
      setPlayerTeam("A");
      setSandboxTokens({ A: result.playerToken, B: joinResult.playerToken });
      apiService.saveSession({ 
        playerName: playerName.trim() + " (OnyX Sandbox)", 
        roomId: result.roomId, 
        playerToken: result.playerToken, 
        playerTeam: "A",
        sandboxTokens: { A: result.playerToken, B: joinResult.playerToken }
      });
      setAppState("createMatch");
    } catch (e) {
      alert("Erro ao criar sandbox: " + (e instanceof Error ? e.message : "Erro desconhecido"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim() || !joinCode.trim()) return;
    setIsLoading(true);
    setJoinError("");
    try {
      const result = await apiService.joinRoom(joinCode.trim().toUpperCase(), playerName.trim());
      setRoomId(result.roomId);
      setPlayerToken(result.playerToken);
      setPlayerTeam("B");
      apiService.saveSession({ playerName: playerName.trim(), roomId: result.roomId, playerToken: result.playerToken, playerTeam: "B" });
      setRoomStatus("waiting");
      setAppState("createMatch");
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Erro ao entrar na sala");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMatchStarted = () => {
    setAppState("battle");
  };

  const handleEndTurn = async () => {
    if (!roomId || !playerToken || !isMyTurn) return;
    try {
      const result = await apiService.endTurn(roomId, playerToken);
      setGameState(result.gameState);
      setCurrentTurn(result.currentTurn);
      setSelectedUnitId(null);
      setTargetMode(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao encerrar turno");
    }
  };

  const handleLeave = () => {
    apiService.clearSession();
    setRoomId(null);
    setPlayerToken(null);
    setPlayerTeam(null);
    setGameState(null);
    setAppState("login");
  };

  const copyRoomCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ── Combat Helpers ────────────────────────────────────────────────────────
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

  // Wraps the shared, server-authoritative cover computation (Etapa 4) so the
  // client preview matches what the server will calculate at /shoot time.
  const checkLineCover = (source: Unit, target: Unit) =>
    computeShotCover(source.x, source.y, target.x, target.y, mapCoverConfig);

  const isInFOVClient = (observer: Unit, target: Unit): boolean => {
    const state = getFOVState(observer, target);
    return state === "visible" || state === "marked";
  };

  const getFOVState = (observer: Unit | null, target: Unit) => {
    if (!observer || observer.team === target.team) return null;

    const isMarked = observer.className === "Sniper" && 
                     observer.attachments.includes("Objetiva") && 
                     observer.markedTargetId === target.id;
    if (isMarked) return "marked";

    const dist = distanceMeters(observer.x, observer.y, target.x, target.y);
    const watch = observer.guardWatchAngle ?? observer.rotation ?? 0;
    const ang = angleDegBetween(observer.x, observer.y, target.x, target.y);
    const diff = Math.abs(normalizeAngle(ang - watch));

    let inCone = false;
    if (dist <= SCALE.RAIO_VISAO_BASE) {
      if (diff <= 45) inCone = true;
    }
    const isSniper = observer.className === "Sniper";
    const hasObjetiva = observer.attachments.includes("Objetiva");
    if (isSniper && hasObjetiva && diff <= 10) {
      inCone = true;
    }

    const coverInfo = checkLineCover(observer, target);
    if (coverInfo.hasWall || coverInfo.cover === "full") {
      // It can still be obstructed outside cone, but the specs differentiate 
      // obstructed (inside cone but blocked) vs out_of_cone (just outside).
      if (!inCone) return "out_of_cone";
      return "obstructed";
    }

    if (!inCone) return "out_of_cone";
    return "visible";
  };

  // ── Movement Preview ──────────────────────────────────────────────────────
  const cancelMove = useCallback(() => {
    setMoveReachable(null);
    setMoveHoverCell(null);
    setMoveManualPath(null);
    setIsMoving(false);
  }, []);

  const sendMovePath = useCallback(async (path: PathStep[]) => {
    if (!roomId || !playerToken || !selectedUnitId) return;
    setIsMoving(true);
    try {
      const result = await apiService.moveUnit(roomId, playerToken, selectedUnitId, path);
      setGameState(result.gameState);
      cancelMove();
      setTargetMode(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao mover");
      setIsMoving(false);
    }
  }, [roomId, playerToken, selectedUnitId, cancelMove]);

  // Reset move-preview state ONCE when entering move mode or switching unit.
  useEffect(() => {
    if (targetMode !== "move") {
      cancelMove();
      return;
    }
    setMoveManualPath(null);
    setMoveHoverCell(null);
  }, [targetMode, selectedUnitId, cancelMove]);

  // Recompute reachable cells whenever movement-relevant data changes
  // (gameState, cover config). This effect MUST NOT clear moveManualPath
  useEffect(() => {
    if (targetMode !== "move" || !selectedUnitId || !gameState) return;
    const unit = gameState.units[selectedUnitId];
    if (!unit) return;
    const mapInfo = MAPS[gameState.mapId];
    if (!mapInfo) return;
    const armorPenal = unit.armorName ? (ARMORS[unit.armorName]?.movePenal || 0) : 0;
    const classInfo = CLASSES[unit.className];
    let baseMove = (classInfo?.movement || SCALE.MOVIMENTO_BASE) - armorPenal;
    if (unit.stance === "prone") baseMove = Math.min(baseMove, 3);
    const remaining = Math.max(0, baseMove + (unit.extraMoveMeters || 0) - (unit.movedThisTurn || 0));
    const occupied = new Set<string>();
    for (const u of Object.values(gameState.units) as Unit[]) {
      if (u.id === unit.id) continue;
      occupied.add(`${Math.floor(u.x / CELL_SIZE)},${Math.floor(u.y / CELL_SIZE)}`);
    }
    const startGx = Math.floor(unit.x / CELL_SIZE);
    const startGy = Math.floor(unit.y / CELL_SIZE);
    const reach = computeReachable(startGx, startGy, mapInfo.gridWidth, mapInfo.gridHeight, mapCoverConfig, occupied, remaining);
    setMoveReachable(reach);
  }, [targetMode, selectedUnitId, gameState, mapCoverConfig]);

  const handleCanvasClick = async (e: React.MouseEvent) => {
    if (isPanning || !canvasRef.current || !gameState) return;
    if (!isMyTurn || !selectedUnitId) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) / zoom;
    const worldY = (e.clientY - rect.top) / zoom;

    if (facingMode) {
      handleSetFacingClick(worldX, worldY);
      return;
    }

    if (targetMode !== "move" || !moveReachable) return;
    const gx = Math.floor(worldX / CELL_SIZE);
    const gy = Math.floor(worldY / CELL_SIZE);

    // Manual mode: append adjacent cell to the path
    if (moveManualPath) {
      const last = moveManualPath[moveManualPath.length - 1];
      const dx = Math.abs(gx - last.gx); const dy = Math.abs(gy - last.gy);
      if (dx + dy !== 1) return;  // not orthogonally adjacent
      const key = `${gx},${gy}`;
      if (!moveReachable.has(key)) return;
      // Avoid revisiting cells (no loops)
      if (moveManualPath.some(p => p.gx === gx && p.gy === gy)) return;
      // Track cumulative cost: walking cost from each step
      const next = [...moveManualPath, { gx, gy }];
      const cost = pathCostMeters(next, mapCoverConfig);
      const unit = gameState.units[selectedUnitId];
      const armorPenal = unit.armorName ? (ARMORS[unit.armorName]?.movePenal || 0) : 0;
      const classInfo = CLASSES[unit.className];
      let baseMove = (classInfo?.movement || SCALE.MOVIMENTO_BASE) - armorPenal;
      if (unit.stance === "prone") baseMove = Math.min(baseMove, 3);
      const remaining = baseMove + (unit.extraMoveMeters || 0) - (unit.movedThisTurn || 0);
      if (cost > remaining + 0.01) return;
      setMoveManualPath(next);
      return;
    }

    // Auto mode: clicking a reachable cell sends movement directly 
    const key = `${gx},${gy}`;
    const target = moveReachable.get(key);
    if (!target) return;
    const unit = gameState.units[selectedUnitId];
    const startGx = Math.floor(unit.x / CELL_SIZE);
    const startGy = Math.floor(unit.y / CELL_SIZE);
    if (gx === startGx && gy === startGy) return;
    const path = reconstructPath(moveReachable, startGx, startGy, gx, gy);
    if (!path) return;
    sendMovePath(path);
  };

  const confirmManualMove = () => {
    if (moveManualPath && moveManualPath.length >= 2) sendMovePath(moveManualPath);
  };

  const handleUnitClick = async (e: React.MouseEvent, unit: Unit) => {
    e.stopPropagation();

    if (targetMode === "heal" && selectedUnitId && gameState && roomId && appState.session?.token) {
      if (unit.id === selectedUnitId) return;
      const source = gameState.units[selectedUnitId];
      if (source.team !== unit.team) {
        alert("Você só pode curar aliados.");
        return;
      }
      
      try {
        const res = await apiService.healUnit(roomId, appState.session.token, source.id, unit.id);
        setGameState(res.gameState);
        setTargetMode(null);
      } catch (err: any) {
        alert(err.message || "Erro ao curar alvo");
      }
      return;
    }

    if (targetMode === "mark" && selectedUnitId && gameState && roomId && appState.session?.token) {
      if (unit.id === selectedUnitId) return;
      const source = gameState.units[selectedUnitId];
      if (source.team === unit.team) return;

      try {
        const res = await apiService.markTarget(roomId, appState.session.token, source.id, unit.id);
        if (res.success) {
          setGameState(res.gameState);
          setTargetMode(null);
        } else if ((res as any).error) {
          alert((res as any).error);
        }
      } catch (err: any) {
        alert(err.message || "Erro ao marcar alvo");
      }
      return;
    }

    if (targetMode === "shoot" && selectedUnitId && gameState) {
      if (unit.id === selectedUnitId) return;
      const source = gameState.units[selectedUnitId];
      if (source.team === unit.team) return;

      const lineCheck = checkLineCover(source, unit);
      if (lineCheck.hasWall) { alert("Há paredes bloqueando o caminho!"); return; }

      const inFOV = isInFOVClient(source, unit);
      if (!inFOV) return; // Ignore click on out-of-FOV enemies

      const coverLevel: CoverType = lineCheck.cover;
      const distance = Math.hypot(unit.x - source.x, unit.y - source.y);
      const distanceMeters = Math.round((distance / CELL_SIZE) * METERS_PER_CELL);
      const weapon = source.weaponName ? WEAPONS[source.weaponName] : null;
      let distancePenalty = 0;
      if (weapon) {
        const isCompensado = source.skills?.includes("Disparo Compensado") && weapon.weaponClass === "Rifle";
        const extraRange = isCompensado ? 10 : 0;
        
        if (weapon.range === "Curto") {
          const limit = SCALE.ALCANCE_CURTO + extraRange;
          if (distanceMeters > limit) distancePenalty = Math.max(0, Math.floor((distanceMeters - limit) * 2));
        } else if (weapon.range === "Médio") {
          const limit = SCALE.ALCANCE_MEDIO + extraRange;
          if (distanceMeters > limit) distancePenalty = Math.max(0, Math.floor((distanceMeters - limit) * 1));
        } else if (weapon.range === "Longo") {
          const limit = SCALE.ALCANCE_LONGO + extraRange;
          if (distanceMeters > limit) distancePenalty = Math.max(0, Math.floor((distanceMeters - limit) * 0.5));
        }
      }
      
      // Calculate attachment bonuses
      let attHitBonus = 0;
      for (const attName of source.attachments || []) {
        const attInfo = ATTACHMENTS[attName];
        if (!attInfo) continue;
        const weaponMatches = !attInfo.weaponClasses || (weapon && attInfo.weaponClasses.includes(weapon.weaponClass));
        const minRangeOk = attInfo.minRange === undefined || distanceMeters > attInfo.minRange;
        const maxRangeOk = attInfo.maxRange === undefined || distanceMeters <= attInfo.maxRange;
        const proneOk = !attInfo.requireProne || source.stance === "prone";
        if (weaponMatches && minRangeOk && maxRangeOk && proneOk) {
          attHitBonus += attInfo.hitBonus || 0;
        }
      }

      let hitRate = (CLASSES[source.className]?.hit ?? 60) + attHitBonus - distancePenalty;
      if (coverLevel === "half") hitRate -= 20;
      if (coverLevel === "full") hitRate -= 40;
      if (hitRate < 5) hitRate = 5;

      setPendingShootAction({
        sourceId: source.id,
        targetId: unit.id,
        coverLevel,
        hitRate,
        distanceMeters,
        distancePenalty,
        contributingHalfCells: lineCheck.contributingHalfCells,
        contributingFullCells: lineCheck.contributingFullCells,
      });
    } else {
      if (!isMyTurn || unit.team !== playerTeam) return;
      setSelectedUnitId(unit.id);
      setTargetMode(null);
    }
  };

  const handleReload = async () => {
    if (!roomId || !playerToken || !selectedUnitId) return;
    try {
      const result = await apiService.reloadUnit(roomId, playerToken, selectedUnitId);
      setGameState(result.gameState);
    } catch (e) { alert(e instanceof Error ? e.message : "Erro ao recarregar"); }
  };

  const handleCharge = async () => {
    if (!roomId || !playerToken || !selectedUnitId) return;
    try {
      const result = await apiService.chargeUnit(roomId, playerToken, selectedUnitId);
      setGameState(result.gameState);
    } catch (e) { alert(e instanceof Error ? e.message : "Erro na Investida"); }
  };

  const handleProne = async () => {
    if (!roomId || !playerToken || !selectedUnitId) return;
    try {
      const result = await apiService.toggleProne(roomId, playerToken, selectedUnitId);
      setGameState(result.gameState);
    } catch (e) { alert(e instanceof Error ? e.message : "Erro ao trocar postura"); }
  };

  const handleGuardActivate = () => {
    if (!selectedUnitId || !gameState) return;
    const u = gameState.units[selectedUnitId];
    if (!u) return;
    if (!u.actions.intervention) { alert("Sem Ação de Intervenção disponível."); return; }
    setFacingMode("guard");
  };

  const handleSetFacingClick = (worldX: number, worldY: number) => {
    if (!selectedUnitId || !gameState || !roomId || !playerToken) return;
    const u = gameState.units[selectedUnitId];
    if (!u) return;
    const angleDeg = (Math.atan2(worldY - u.y, worldX - u.x) * 180) / Math.PI;

    if (facingMode === "guard") {
      apiService
        .guardUnit(roomId, playerToken, selectedUnitId, angleDeg)
        .then((r) => setGameState(r.gameState))
        .catch((e) => alert(e instanceof Error ? e.message : "Erro"))
        .finally(() => setFacingMode(null));
    } else if (facingMode === "facing") {
      apiService
        .setFacing(roomId, playerToken, selectedUnitId, angleDeg)
        .then((r) => setGameState(r.gameState))
        .catch((e) => alert(e instanceof Error ? e.message : "Erro"))
        .finally(() => setFacingMode(null));
    }
  };

  const computeGuardShotInfo = (pending: PendingGuardShot) => {
    if (!gameState) return null;
    const guard = gameState.units[pending.guardUnitId];
    const target = gameState.units[pending.targetUnitId];
    if (!guard || !target) return null;
    const lineCheck = checkLineCover(guard, target);
    if (lineCheck.hasWall) return null;
    const coverLevel = lineCheck.cover;
    const distance = Math.hypot(target.x - guard.x, target.y - guard.y);
    const distanceMeters = Math.round((distance / CELL_SIZE) * METERS_PER_CELL);
    const weapon = guard.weaponName ? WEAPONS[guard.weaponName] : null;
    let distancePenalty = 0;
    if (weapon) {
      const isCompensado = guard.skills?.includes("Disparo Compensado") && weapon.weaponClass === "Rifle";
      const extraRange = isCompensado ? 10 : 0;
      
      if (weapon.range === "Curto") {
        const limit = SCALE.ALCANCE_CURTO + extraRange;
        if (distanceMeters > limit) distancePenalty = Math.max(0, Math.floor((distanceMeters - limit) * 2));
      } else if (weapon.range === "Médio") {
        const limit = SCALE.ALCANCE_MEDIO + extraRange;
        if (distanceMeters > limit) distancePenalty = Math.max(0, Math.floor((distanceMeters - limit) * 1));
      } else if (weapon.range === "Longo") {
        const limit = SCALE.ALCANCE_LONGO + extraRange;
        if (distanceMeters > limit) distancePenalty = Math.max(0, Math.floor((distanceMeters - limit) * 0.5));
      }
    }

    let attHitBonus = 0;
    for (const attName of guard.attachments || []) {
      const attInfo = ATTACHMENTS[attName];
      if (!attInfo) continue;
      const weaponMatches = !attInfo.weaponClasses || (weapon && attInfo.weaponClasses.includes(weapon.weaponClass));
      const minRangeOk = attInfo.minRange === undefined || distanceMeters > attInfo.minRange;
      const maxRangeOk = attInfo.maxRange === undefined || distanceMeters <= attInfo.maxRange;
      const proneOk = !attInfo.requireProne || guard.stance === "prone";
      if (weaponMatches && minRangeOk && maxRangeOk && proneOk) {
        attHitBonus += attInfo.hitBonus || 0;
      }
    }

    let hitRate = (CLASSES[guard.className]?.hit ?? 60) + attHitBonus - distancePenalty - 10; // -10 from guard
    if (coverLevel === "half") hitRate -= 20;
    if (coverLevel === "full") hitRate -= 40;
    if (target.stance === "prone") hitRate -= 10;
    if (hitRate < 5) hitRate = 5;
    return { guard, target, coverLevel, distanceMeters, distancePenalty, hitRate, weapon };
  };

  const resolveGuardShot = async (accept: boolean) => {
    if (!guardShotDecision || !roomId || !playerToken) return;
    const info = computeGuardShotInfo(guardShotDecision);
    const decidingId = guardShotDecision.id;
    // Close the modal immediately — the pending will be cleaned up on next poll
    setGuardShotDecision(null);
    try {
      await apiService.resolveGuardShot(
        roomId,
        playerToken,
        decidingId,
        accept,
        info?.distancePenalty ?? 0,
      );
    } catch (e) {
      // If the server couldn't find it, it was already resolved (e.g. by endTurn).
      // Just silently ignore — the next poll will sync state.
      console.warn("resolveGuardShot error:", e instanceof Error ? e.message : e);
    }
  };

  const executeShoot = async () => {
    if (!pendingShootAction || !gameState || !roomId || !playerToken) return;
    try {
      const result = await apiService.shootUnit(
        roomId, playerToken,
        pendingShootAction.sourceId, pendingShootAction.targetId,
        pendingShootAction.distancePenalty
      );
      setGameState(result.gameState);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao atirar");
    }
    setPendingShootAction(null);
    setTargetMode(null);
  };

  // ── Screens ───────────────────────────────────────────────────────────────

  if (appState === "login") {
    return (
      <div className="flex bg-neutral-900 justify-center h-screen items-center px-4 w-full text-white">
        <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 shadow-2xl w-full max-w-md text-center">
          <h1 className="text-3xl font-black mb-2">CALL OF WAR</h1>
          <p className="text-sm text-neutral-500 tracking-widest font-mono mb-8">SIMULADOR TÁTICO VTT</p>
          <form onSubmit={(e) => { e.preventDefault(); if (playerName.trim()) setAppState("lobby"); }}>
            <input
              type="text"
              placeholder="Insira seu nome de comandante"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-white mb-4 text-center focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!playerName.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (appState === "lobby") {
    return (
      <div className="flex bg-neutral-900 justify-center min-h-screen items-center px-4 w-full text-white">
        <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 shadow-2xl w-full max-w-lg">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-black">Bem-vindo(a), {playerName}</h2>
              <p className="text-neutral-500 text-sm mt-1">Escolha como quer jogar</p>
            </div>
            <button onClick={() => setAppState("login")} className="text-neutral-500 hover:text-white transition-colors">
              <LogOut size={20} />
            </button>
          </div>

          <div className="space-y-4 mb-8">
            <button
              onClick={handleCreateRoom}
              disabled={isLoading}
              className="w-full flex items-center gap-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 p-5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-600/20"
            >
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <Users size={24} />
              </div>
              <div className="text-left">
                <div className="font-bold text-lg">Criar Sala</div>
                <div className="text-sm text-indigo-200">Você configura os exércitos e compartilha o código</div>
              </div>
            </button>

            <button
              onClick={handleCreateSandboxRoom}
              disabled={isLoading}
              className="w-full flex items-center gap-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 p-5 rounded-xl transition-all hover:shadow-lg hover:shadow-orange-600/20"
            >
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <Users size={24} />
              </div>
              <div className="text-left">
                <div className="font-bold text-lg">Modo Single Player / Sandbox</div>
                <div className="text-sm text-orange-200">Teste o jogo localmente controlando as duas equipes</div>
              </div>
            </button>

            <div className="bg-neutral-900 border border-neutral-700 p-5 rounded-xl space-y-3">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center shrink-0">
                  <UserPlus size={20} />
                </div>
                <div>
                  <div className="font-bold">Entrar em Sala</div>
                  <div className="text-xs text-neutral-500">Insira o código de 6 dígitos</div>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="CÓDIGO DA SALA"
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 text-white text-center tracking-[0.3em] font-mono text-lg focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={isLoading || joinCode.length < 6}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2 rounded-lg transition-colors"
                >
                  Entrar
                </button>
              </div>
              {joinError && <p className="text-sm text-red-400">{joinError}</p>}
            </div>
          </div>

          <div className="border-t border-neutral-700 pt-4 space-y-2">
            <div className="flex gap-3">
              <button onClick={() => setAppState("soldiers")} className="flex-1 text-sm text-neutral-400 hover:text-white py-2 transition-colors">
                Ver Soldados
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAppState("editor")} className="flex-1 text-sm text-neutral-400 hover:text-white py-2 transition-colors">
                Editor de Mapa
              </button>
              <button onClick={() => setAppState("aiMapCreator")} className="flex-1 text-sm text-neutral-400 hover:text-white py-2 transition-colors">
                Gerador de Mapa
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === "soldiers") return <SoldiersInfoMenu onBack={() => setAppState("lobby")} />;
  if (appState === "editor") return <MapEditorMenu onBack={() => setAppState("lobby")} />;
  if (appState === "aiMapCreator") return <AIMapCreatorMenu onBack={() => setAppState("lobby")} />;

  const SandboxToggle = () => {
    if (!sandboxTokens || !playerTeam) return null;
    const isA = playerTeam === "A";
    return (
      <button 
        onClick={() => {
          const nextTeam = isA ? "B" : "A";
          setPlayerTeam(nextTeam);
          setPlayerToken(sandboxTokens[nextTeam]);
          apiService.saveSession({
            playerName,
            roomId: roomId!,
            playerToken: sandboxTokens[nextTeam],
            playerTeam: nextTeam,
            sandboxTokens
          });
        }}
        className="fixed top-4 left-4 z-[999] bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg border border-orange-400 flex items-center gap-2 transition-all hover:scale-105"
      >
        <Users size={16} /> Sandbox: Equipe {playerTeam} (Clique para mudar)
      </button>
    );
  };

  if (appState === "createMatch" && roomId && playerToken) {
    return (
      <div className="relative">
        <SandboxToggle />
        <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 rounded-xl p-3 flex items-center gap-3 shadow-xl">
          <div>
            <div className="text-xs text-neutral-500 font-mono uppercase tracking-wider mb-0.5">Código da Sala</div>
            <div className="font-mono font-black text-xl text-white tracking-widest">{roomId}</div>
          </div>
          <button
            onClick={copyRoomCode}
            className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded-lg flex items-center justify-center transition-colors"
            title="Copiar código"
          >
            {codeCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-neutral-400" />}
          </button>
        </div>
        <CreateMatchMenu
          roomId={roomId}
          playerToken={playerToken}
          playerTeam={playerTeam!}
          state={roomState}
          onBack={handleLeave}
        />
      </div>
    );
  }

  if (appState === "deploy" && roomId && playerToken && playerTeam && roomState) {
    return (
      <div className="relative">
        <SandboxToggle />
        <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 rounded-xl p-3 flex items-center gap-3 shadow-xl">
          <div>
            <div className="text-xs text-neutral-500 font-mono uppercase tracking-wider mb-0.5">Sala</div>
            <div className="font-mono font-black text-xl text-white tracking-widest">{roomId}</div>
          </div>
          <button
            onClick={copyRoomCode}
            className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded-lg flex items-center justify-center transition-colors"
            title="Copiar código"
          >
            {codeCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-neutral-400" />}
          </button>
        </div>
        <DeployScreen
          roomId={roomId}
          playerToken={playerToken}
          playerTeam={playerTeam}
          state={roomState}
          onLeave={handleLeave}
        />
        {phaseTransitioning && <PhaseTransitionOverlay phase={phaseTransitioning} />}
      </div>
    );
  }

  if (appState === "waiting") {
    return (
      <div className="flex bg-neutral-900 justify-center h-screen items-center px-4 w-full text-white">
        <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 shadow-2xl w-full max-w-md text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          {playerTeam === "A" ? (
            <>
              <h2 className="text-2xl font-bold mb-2">Aguardando Jogador B</h2>
              <p className="text-neutral-400 mb-6">Compartilhe o código com seu adversário</p>
              <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 mb-6">
                <div className="text-xs text-neutral-500 font-mono uppercase tracking-wider mb-2">Código da Sala</div>
                <div className="font-mono font-black text-4xl text-white tracking-[0.3em]">{roomId}</div>
              </div>
              <button onClick={copyRoomCode} className="flex items-center gap-2 mx-auto bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded-lg text-sm transition-colors">
                {codeCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                {codeCopied ? "Copiado!" : "Copiar código"}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-2">Entrando na sala...</h2>
              <p className="text-neutral-400">Aguardando o Jogador A iniciar a batalha</p>
              <div className="mt-4 text-sm text-neutral-600 font-mono">{roomId}</div>
            </>
          )}
          <button onClick={handleLeave} className="mt-8 text-sm text-neutral-600 hover:text-neutral-400 transition-colors">
            Sair da sala
          </button>
        </div>
      </div>
    );
  }

  // ── Battle Screen ─────────────────────────────────────────────────────────

  if (!gameState) return (
    <div className="h-screen bg-neutral-900 flex items-center justify-center text-white font-mono">
      Buscando inteligência...
    </div>
  );

  // ── End-of-game overlay ──────────────────────────────────────────────────
  if (roomState?.winner) {
    const won = roomState.winner === playerTeam;
    const winnerName = roomPlayers[roomState.winner]?.name;
    return (
      <div className="h-screen bg-neutral-900 flex flex-col items-center justify-center text-white font-mono gap-6 px-6">
        <div className={"text-6xl font-bold tracking-widest " + (won ? "text-emerald-400" : "text-red-500")}>
          {won ? "VITÓRIA" : "DERROTA"}
        </div>
        <div className="text-lg text-neutral-300 text-center max-w-xl">
          Equipe <span className="font-bold">{roomState.winner}</span>
          {winnerName ? ` (${winnerName})` : ""} venceu a partida — todas as unidades adversárias foram eliminadas.
        </div>
        <button
          onClick={handleLeave}
          className="mt-4 px-6 py-3 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-bold tracking-wide shadow-lg"
        >
          Voltar ao menu
        </button>
      </div>
    );
  }

  const selectedUnit = selectedUnitId ? gameState.units[selectedUnitId] : null;
  const myPlayerName = roomPlayers[playerTeam!]?.name || playerName;
  const opponentTeam = playerTeam === "A" ? "B" : "A";
  const opponentName = roomPlayers[opponentTeam]?.name;

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-200 overflow-hidden font-sans">
      <SandboxToggle />
      {/* Canvas Area */}
      <div
        className={
          "flex-1 relative bg-neutral-900 overflow-hidden border-r border-neutral-700 m-4 rounded-xl shadow-2xl flex items-center justify-center " +
          (targetMode === "move" && moveReachable && moveHoverCell && !moveReachable.has(`${moveHoverCell.gx},${moveHoverCell.gy}`)
            ? "cursor-not-allowed"
            : "cursor-crosshair")
        }
        onWheel={(e) => {
          const newZoom = e.deltaY < 0 ? zoom * 1.08 : zoom / 1.08;
          setZoom(Math.min(Math.max(0.05, newZoom), 8));
        }}
        onMouseDown={(e) => { if (e.button === 0 && !targetMode) setIsPanning(true); if (e.button === 1 || e.button === 2) setIsPanning(true); }}
        onMouseMove={(e) => {
          if (isPanning) setCamera(prev => ({ x: prev.x - e.movementX / zoom, y: prev.y - e.movementY / zoom }));
          if (canvasRef.current) {
            const r = canvasRef.current.getBoundingClientRect();
            const wx = (e.clientX - r.left) / zoom;
            const wy = (e.clientY - r.top) / zoom;
            const gx = Math.floor(wx / CELL_SIZE);
            const gy = Math.floor(wy / CELL_SIZE);
            if (targetMode === "move") {
              if (!moveHoverCell || moveHoverCell.gx !== gx || moveHoverCell.gy !== gy) setMoveHoverCell({ gx, gy });
            }
            if (appState === "battle") {
              const cellType = mapCoverConfig[`${gx},${gy}`];
              setMouseScreenPos({ x: e.clientX, y: e.clientY });
              if (cellType && cellType !== "none") {
                const labelMap: Record<string, string> = {
                  half: "Meia Cobertura", full: "Cobertura Total", wall: "Parede",
                  water: "Água", deployA: "Zona Deploy A", deployB: "Zona Deploy B",
                };
                setCoverHoverLabel(labelMap[cellType] ?? null);
              } else {
                setCoverHoverLabel(null);
              }
            }
          }
        }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => { setIsPanning(false); setMoveHoverCell(null); setCoverHoverLabel(null); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Top Bar */}
        <div className="absolute top-4 left-4 flex gap-2 z-50 pointer-events-auto">
          <button onClick={handleLeave} className="bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-300 px-3 py-1 text-xs rounded transition-colors font-bold shadow-lg flex items-center gap-1">
            <LogOut size={12} /> Sair
          </button>
          <div className="bg-black/80 px-3 py-1 rounded text-xs text-neutral-400 font-mono pointer-events-none shadow-lg border border-neutral-800 flex items-center gap-2">
            <span>SALA: {roomId}</span>
            <span className="text-neutral-600">|</span>
            <span>ESCALA: 1 qua. = {METERS_PER_CELL}m</span>
            <span className="text-neutral-600">|</span>
            <span>ZOOM: {Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Turn Banner */}
        <div className={cn(
          "absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-2 rounded-full font-bold text-sm shadow-lg border transition-all",
          isMyTurn
            ? "bg-green-600/90 border-green-500 text-white"
            : "bg-neutral-800/90 border-neutral-700 text-neutral-400"
        )}>
          {isMyTurn
            ? "⚡ Seu turno!"
            : `⏳ Vez de ${opponentName || "Adversário"}`}
        </div>

        {/* Pan/Zoom container */}
        <div
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="absolute"
          style={{
            left: "50%", top: "50%",
            transformOrigin: "0 0",
            transform: `scale(${zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
            width: MAPS[gameState.mapId] ? MAPS[gameState.mapId].gridWidth * CELL_SIZE : 4000,
            height: MAPS[gameState.mapId] ? MAPS[gameState.mapId].gridHeight * CELL_SIZE : 4000,
            backgroundColor: "#1a1a1a",
          }}
        >
          {/* Map image using img tag for better rendering */}
          {MAPS[gameState.mapId] && (
            <img
              src={getMapImage(gameState.mapId)}
              alt={`Map ${MAPS[gameState.mapId].name}`}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}

          {/* Grid */}
          {zoom > 0.15 && (
            <div className="absolute inset-0 pointer-events-none z-10 mix-blend-overlay opacity-80" style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,${zoom < 0.4 ? 0.3 : 0.6}) ${Math.max(1, 2 / zoom)}px, transparent ${Math.max(1, 2 / zoom)}px), linear-gradient(to bottom, rgba(255,255,255,${zoom < 0.4 ? 0.3 : 0.6}) ${Math.max(1, 2 / zoom)}px, transparent ${Math.max(1, 2 / zoom)}px)`,
              backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
            }} />
          )}

          {/* Cover Cells (visual only — pointer-events-none so units stay clickable)
              In battle phase overlays are hidden; only the data remains for gameplay logic.
              In deploy phase overlays remain fully visible to help the player position units. */}
          {appState !== "battle" && Object.entries(mapCoverConfig).map(([key, type]) => {
            if (type === "none") return null;
            const [gx, gy] = key.split(",").map(Number);
            let bgColor = "transparent";
            let borderColor = "transparent";
            let label = "";
            if (type === "half") { bgColor = "rgba(234,179,8,0.18)"; borderColor = "rgba(234,179,8,0.45)"; label = "Meia Cobertura"; }
            else if (type === "full") { bgColor = "rgba(239,68,68,0.18)"; borderColor = "rgba(239,68,68,0.45)"; label = "Cobertura Total"; }
            else if (type === "wall") { bgColor = "rgba(64,64,64,0.6)"; borderColor = "rgba(115,115,115,0.8)"; label = "Parede"; }
            else if (type === "deployA") { bgColor = "rgba(96,165,250,0.18)"; borderColor = "rgba(96,165,250,0.45)"; label = "Deploy Equipe A"; }
            else if (type === "deployB") { bgColor = "rgba(252,165,165,0.18)"; borderColor = "rgba(252,165,165,0.45)"; label = "Deploy Equipe B"; }
            else if (type === "water") { bgColor = "rgba(30,64,175,0.4)"; borderColor = "rgba(30,64,175,0.7)"; label = "Água (-2)"; }
            return (
              <div
                key={key}
                title={label}
                className="absolute pointer-events-none border-2 rounded-sm z-10"
                style={{ left: gx * CELL_SIZE, top: gy * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE, backgroundColor: bgColor, borderColor }}
              />
            );
          })}

          {/* Move Reachable Cells (green tint, darker at edge) */}
          {targetMode === "move" && moveReachable && Array.from(moveReachable.entries()).map(([key, cell]) => {
            const isStart = key === `${Math.floor((selectedUnit?.x || 0) / CELL_SIZE)},${Math.floor((selectedUnit?.y || 0) / CELL_SIZE)}`;
            if (isStart) return null;
            const ratio = cell.maxRange > 0 ? Math.min(1, cell.cost / cell.maxRange) : 0;
            const alpha = 0.10 + 0.30 * ratio;  // edge darker
            return (
              <div key={`reach-${key}`} className="absolute pointer-events-none z-[11] border"
                style={{
                  left: cell.gx * CELL_SIZE, top: cell.gy * CELL_SIZE,
                  width: CELL_SIZE, height: CELL_SIZE,
                  backgroundColor: `rgba(34,197,94,${alpha})`,
                  borderColor: `rgba(34,197,94,${0.3 + 0.3 * ratio})`,
                }} />
            );
          })}

          {/* Hover dotted path (auto, before clicking) */}
          {targetMode === "move" && moveReachable && moveHoverCell && !moveManualPath && selectedUnit && (() => {
            const startGx = Math.floor(selectedUnit.x / CELL_SIZE);
            const startGy = Math.floor(selectedUnit.y / CELL_SIZE);
            const path = reconstructPath(moveReachable, startGx, startGy, moveHoverCell.gx, moveHoverCell.gy);
            if (!path) return null;
            return (
              <svg className="absolute inset-0 pointer-events-none z-[12]" style={{ width: "100%", height: "100%" }}>
                <polyline
                  points={path.map(p => `${p.gx * CELL_SIZE + CELL_SIZE/2},${p.gy * CELL_SIZE + CELL_SIZE/2}`).join(" ")}
                  fill="none"
                  stroke="rgba(34,197,94,0.95)"
                  strokeWidth={Math.max(2, 4 / zoom)}
                  strokeDasharray={`${10 / zoom} ${6 / zoom}`}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          })()}

          {/* Manual path (in progress) */}
          {targetMode === "move" && moveManualPath && moveManualPath.length >= 2 && (
            <svg className="absolute inset-0 pointer-events-none z-[12]" style={{ width: "100%", height: "100%" }}>
              <polyline
                points={moveManualPath.map(p => `${p.gx * CELL_SIZE + CELL_SIZE/2},${p.gy * CELL_SIZE + CELL_SIZE/2}`).join(" ")}
                fill="none"
                stroke="rgba(56,189,248,0.95)"
                strokeWidth={Math.max(3, 5 / zoom)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* FOV Overlay */}
          <FOVOverlay unit={selectedUnit} />

          {/* Shoot Line */}
          {pendingShootAction && gameState.units[pendingShootAction.sourceId] && gameState.units[pendingShootAction.targetId] && (
            <>
              {/* Highlight the cells that are actually granting cover to the
                  target under the new proximity rule (Etapa 4). Half-cover
                  cells in orange, full-cover cells in red. */}
              {pendingShootAction.contributingHalfCells.map((key) => {
                const [gx, gy] = key.split(",").map(Number);
                return (
                  <div
                    key={`half-${key}`}
                    className="absolute pointer-events-none z-10 border-2 border-orange-400 bg-orange-400/30 animate-pulse"
                    style={{ left: gx * CELL_SIZE, top: gy * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE }}
                  />
                );
              })}
              {pendingShootAction.contributingFullCells.map((key) => {
                const [gx, gy] = key.split(",").map(Number);
                return (
                  <div
                    key={`full-${key}`}
                    className="absolute pointer-events-none z-10 border-2 border-red-500 bg-red-500/30 animate-pulse"
                    style={{ left: gx * CELL_SIZE, top: gy * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE }}
                  />
                );
              })}
              <svg className="absolute inset-0 pointer-events-none z-20" style={{ width: "100%", height: "100%" }}>
                <line
                  x1={gameState.units[pendingShootAction.sourceId].x} y1={gameState.units[pendingShootAction.sourceId].y}
                  x2={gameState.units[pendingShootAction.targetId].x} y2={gameState.units[pendingShootAction.targetId].y}
                  stroke={pendingShootAction.coverLevel === "full" ? "rgba(239,68,68,0.8)" : pendingShootAction.coverLevel === "half" ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"}
                  strokeWidth="4" strokeDasharray="8 4" className="animate-pulse" strokeLinecap="round"
                />
              </svg>
            </>
          )}

          {/* Units */}
          {Object.values(gameState.units).map((unit: Unit) => {
            const isSelected = unit.id === selectedUnitId;
            const isEnemy = unit.team !== (selectedUnit?.team ?? unit.team);
            const isMyUnit = unit.team === playerTeam;
            const unitClassInfo = CLASSES[unit.className];
            const maxHp = unitClassInfo?.hp ?? unit.hp;
            const hpPercent = maxHp > 0 ? Math.max(0, Math.min(100, (unit.hp / maxHp) * 100)) : 0;
            const weapon = unit.weaponName ? WEAPONS[unit.weaponName] : null;
            let rangePx = 0;
            if (isSelected && targetMode === "shoot" && weapon) {
              if (weapon.range === "Curto") rangePx = (SCALE.ALCANCE_CURTO / METERS_PER_CELL) * CELL_SIZE;
              else if (weapon.range === "Médio") rangePx = (SCALE.ALCANCE_MEDIO / METERS_PER_CELL) * CELL_SIZE;
              else if (weapon.range === "Longo") rangePx = (SCALE.ALCANCE_LONGO / METERS_PER_CELL) * CELL_SIZE;
            }

            // Token fills ~88% of the cell so it sits snugly inside the grid square.
            const TOKEN_SIZE = Math.round(CELL_SIZE * 0.88);   // e.g. 44px for a 50px cell
            const HP_BAR_W  = Math.round(CELL_SIZE * 0.92);   // slightly wider than token

            const fovState = targetMode === "shoot" && selectedUnit && isEnemy
              ? getFOVState(selectedUnit, unit)
              : null;

            return (
              <div
                key={unit.id}
                onClick={(e) => handleUnitClick(e, unit)}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-transform duration-300 flex items-center justify-center shadow-lg",
                  unit.team === "A" ? "bg-blue-600 border-blue-300" : "bg-red-600 border-red-300",
                  isSelected && "ring-4 ring-white ring-opacity-50 scale-110 z-10",
                  targetMode === "shoot" && isEnemy && fovState === "visible" && "animate-pulse ring-4 ring-green-500 cursor-crosshair",
                  targetMode === "shoot" && isEnemy && fovState === "marked" && "animate-pulse ring-4 ring-amber-500 cursor-crosshair",
                  targetMode === "shoot" && isEnemy && (fovState === "out_of_cone" || fovState === "obstructed") && "ring-4 ring-red-500/50 opacity-60 cursor-not-allowed",
                  targetMode === "mark" && isEnemy && "animate-pulse ring-4 ring-amber-500 cursor-crosshair",
                  targetMode === "heal" && !isEnemy && !isSelected && "animate-pulse ring-4 ring-green-400 cursor-crosshair",
                  isMyUnit && isMyTurn && !targetMode && "cursor-pointer hover:scale-105",
                  !isMyUnit && !targetMode && "cursor-default opacity-90",
                )}
                style={{ left: unit.x, top: unit.y, width: TOKEN_SIZE, height: TOKEN_SIZE }}
              >
                <div
                  className="absolute left-1/2 -translate-x-1/2 flex flex-col gap-0.5 items-center pointer-events-none"
                  style={{ top: -(Math.round(CELL_SIZE * 0.18)), width: HP_BAR_W }}
                >
                  <div className="w-full h-1.5 bg-black border border-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-300", hpPercent > 60 ? "bg-green-500" : hpPercent > 30 ? "bg-yellow-500" : "bg-red-500")}
                      style={{ width: `${hpPercent}%` }}
                    />
                  </div>
                </div>

                <div
                  className="w-full h-full rounded-full bg-cover bg-center flex items-center justify-center overflow-hidden relative z-0"
                  style={{ backgroundImage: `url("${getRoleImage(CLASSES[unit.className]?.name || "")}")`, boxShadow: "inset 0 0 10px rgba(0,0,0,0.5)" }}
                >
                  {!["assalto", "suporte", "médico", "granadeiro", "sniper"].includes(CLASSES[unit.className]?.name.toLowerCase()) && (
                    <div className="text-[10px] font-bold text-white tracking-tighter drop-shadow-md">
                      {CLASSES[unit.className]?.name.substring(0, 3).toUpperCase()}
                    </div>
                  )}
                  {fovState === "obstructed" && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 text-white font-bold opacity-80" style={{ fontSize: TOKEN_SIZE * 0.5 }}>
                      🚫
                    </div>
                  )}
                </div>

                {isSelected && !targetMode && (() => {
                  const armorPenal = unit.armorName ? (ARMORS[unit.armorName]?.movePenal || 0) : 0;
                  let baseMove = (unitClassInfo?.movement ?? SCALE.MOVIMENTO_BASE) - armorPenal;
                  if (unit.stance === "prone") baseMove = Math.min(baseMove, 3);
                  const remaining = Math.max(0, baseMove + (unit.extraMoveMeters || 0) - (unit.movedThisTurn || 0));
                  const radiusPx = (remaining / METERS_PER_CELL) * CELL_SIZE;
                  return (
                    <div
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-green-400/60 bg-green-400/5 pointer-events-none"
                      style={{ width: radiusPx * 2, height: radiusPx * 2 }}
                    />
                  );
                })()}
                {isSelected && targetMode === "shoot" && rangePx > 0 && (
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-500/30 bg-red-500/5 pointer-events-none"
                    style={{ width: rangePx * 2, height: rangePx * 2 }} />
                )}
                {isSelected && targetMode === "heal" && (
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-green-400/40 bg-green-400/5 pointer-events-none"
                    style={{ width: (4.5 / METERS_PER_CELL) * CELL_SIZE * 2, height: (4.5 / METERS_PER_CELL) * CELL_SIZE * 2 }} />
                )}
                {isSelected && targetMode === "move" && (
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-green-500/50 bg-green-500/10 pointer-events-none"
                    style={{
                      width: (((unitClassInfo?.movement ?? SCALE.MOVIMENTO_BASE) - (ARMORS[unit.armorName ?? ""]?.movePenal ?? 0)) / METERS_PER_CELL) * CELL_SIZE * 2,
                      height: (((unitClassInfo?.movement ?? SCALE.MOVIMENTO_BASE) - (ARMORS[unit.armorName ?? ""]?.movePenal ?? 0)) / METERS_PER_CELL) * CELL_SIZE * 2,
                    }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-[400px] flex flex-col h-full bg-neutral-900 border-l border-neutral-800">

        {/* Player Info / Turn */}
        <div className={cn(
          "px-4 py-3 border-b border-neutral-800 flex items-center justify-between",
          isMyTurn ? "bg-green-900/20" : "bg-neutral-900"
        )}>
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-widest font-mono">
              {isMyTurn ? "Seu turno" : "Aguardando..."}
            </div>
            <div className="font-bold text-sm text-white">
              {myPlayerName} <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", playerTeam === "A" ? "bg-blue-500/30 text-blue-400" : "bg-red-500/30 text-red-400")}>
                Equipe {playerTeam}
              </span>
            </div>
          </div>
          {isMyTurn && (
            <button
              onClick={handleEndTurn}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Fim de Turno
            </button>
          )}
        </div>

        {/* Unit Info */}
        <div className="p-6 border-b border-neutral-800">
          <h2 className="text-xl font-bold mb-4 font-mono uppercase tracking-widest text-neutral-500">Operador</h2>

          {selectedUnit ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedUnit.name}</h3>
                  <p className="text-sm text-neutral-400">
                    {CLASSES[selectedUnit.className]?.name} · Equipe {selectedUnit.team}
                  </p>
                </div>
                <div className={cn("px-3 py-1 rounded font-bold text-lg", selectedUnit.team === "A" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400")}>
                  {selectedUnit.hp} HP
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-800 p-3 rounded-lg flex flex-col gap-1 relative group">
                  <span className="text-xs text-neutral-500 uppercase tracking-widest flex items-center justify-between w-full">
                    <span className="flex items-center gap-2"><Shield size={14} /> Colete</span>
                    <Info size={14} className="cursor-pointer text-neutral-600 hover:text-white" onClick={(e) => {
                      e.stopPropagation();
                      const armor = ARMORS[selectedUnit.armorName || ""];
                      if (armor) setModalData({ title: `Colete: ${armor.name}`, content: [`Redução de Dano: ${armor.reduction}`, `Penalidade de Movimento: ${armor.movePenal}m`, `Slots: ${armor.slots}`] });
                    }} />
                  </span>
                  <span className="font-semibold text-neutral-200">{selectedUnit.armorName || "Nenhum"}</span>
                </div>
                <div className="bg-neutral-800 p-3 rounded-lg flex flex-col gap-1 relative group">
                  <span className="text-xs text-neutral-500 uppercase tracking-widest flex items-center justify-between w-full">
                    <span className="flex items-center gap-2"><Crosshair size={14} /> Arma</span>
                    <Info size={14} className="cursor-pointer text-neutral-600 hover:text-white" onClick={(e) => {
                      e.stopPropagation();
                      const weapon = WEAPONS[selectedUnit.weaponName || ""];
                      if (weapon) setModalData({ title: `Arma: ${weapon.name}`, content: [`Classe: ${weapon.weaponClass}`, `Facção: ${weapon.weaponFaction}`, `Classes permitidas: ${weapon.allowedClasses.length === 0 ? "Todas" : weapon.allowedClasses.join(", ")}`, `Dano Base: ${weapon.damage}`, `Dano Crítico: ${weapon.critical}`, `Chance de Crítico: ${weapon.criticalChance}%`, `Alcance: ${weapon.range}`, `Disparos por turno: ${weapon.shots}`, `Munição/Carregador: ${weapon.reload}`] });
                    }} />
                  </span>
                  <span className="font-semibold text-neutral-200">{selectedUnit.weaponName || "Desarmado"}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs text-neutral-500 uppercase tracking-widest border-b border-neutral-700 pb-1">
                  Acessórios & Habilidades
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedUnit.attachments.map((a) => (
                    <span key={a} className="bg-neutral-800 px-2 py-1 rounded text-xs text-neutral-300 border border-neutral-700 flex items-center gap-1">
                      {a}
                      <Info size={12} className="cursor-pointer opacity-50 hover:opacity-100" onClick={(e) => {
                        e.stopPropagation();
                        const att = ATTACHMENTS[a];
                        if (att) setModalData({ title: `Acessório: ${att.name}`, content: [`Custo: ${att.points} pontos`, `Descrição: ${att.description}`] });
                      }} />
                    </span>
                  ))}
                  {selectedUnit.skills.map((s) => (
                    <span key={s} className="bg-indigo-900/40 text-indigo-300 border border-indigo-800 px-2 py-1 rounded text-xs flex items-center gap-1">
                      {s}
                      <Info size={12} className="cursor-pointer opacity-50 hover:opacity-100" onClick={(e) => {
                        e.stopPropagation();
                        const skill = SKILLS[s];
                        if (skill) setModalData({ title: `Habilidade: ${skill.name}`, content: [`Classe: ${skill.classRequired}`, `Custo: ${skill.points} pontos`, `Descrição: ${skill.description}`] });
                      }} />
                    </span>
                  ))}
                </div>
              </div>

              {/* Status: ações, munição, postura */}
              {(() => {
                const w = selectedUnit.weaponName ? WEAPONS[selectedUnit.weaponName] : null;
                const stanceLabel = selectedUnit.stance === "guard" ? "🛡️ Guarda" : selectedUnit.stance === "prone" ? "🪖 Deitado" : "🧍 Em pé";
                return (
                  <div className="bg-neutral-800/50 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                        Ações
                        <Info size={12} className="cursor-pointer text-neutral-600 hover:text-white" onClick={(e) => {
                          e.stopPropagation();
                          setModalData({
                            title: "Ações por Turno",
                            content: [
                              "Cada unidade dispõe de 3 ações por turno, que se renovam ao final do turno.",
                              `M — Movimento: ${selectedUnit.actions.move ? "disponível" : "já utilizada"}. Permite uma movimentação por turno.`,
                              `I — Intervenção: ${selectedUnit.actions.intervention ? "disponível" : "já utilizada"}. Necessária para o primeiro tiro, recarregar, investida ou ativar Guarda.`,
                              `T — Tática: ${selectedUnit.actions.tactical ? "disponível" : "já utilizada"}. Necessária para deitar/levantar ou redefinir ângulo após mover.`,
                            ],
                          });
                        }} />
                      </span>
                      <div className="flex gap-1">
                        <span className={cn("px-2 py-0.5 rounded font-bold", selectedUnit.actions.move ? "bg-green-600/30 text-green-300" : "bg-neutral-700 text-neutral-500 line-through")}>M</span>
                        <span className={cn("px-2 py-0.5 rounded font-bold", selectedUnit.actions.intervention ? "bg-red-600/30 text-red-300" : "bg-neutral-700 text-neutral-500 line-through")}>I</span>
                        <span className={cn("px-2 py-0.5 rounded font-bold", selectedUnit.actions.tactical ? "bg-yellow-600/30 text-yellow-300" : "bg-neutral-700 text-neutral-500 line-through")}>T</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                        Munição
                        <Info size={12} className="cursor-pointer text-neutral-600 hover:text-white" onClick={(e) => {
                          e.stopPropagation();
                          setModalData({
                            title: "Munição",
                            content: [
                              `No carregador: ${selectedUnit.ammoInMag}${w ? ` / ${w.reload}` : ""}`,
                              w ? `Disparos neste turno: ${selectedUnit.shotsThisTurn} de ${w.shots} permitidos.` : "Unidade desarmada.",
                              "Cada disparo consome 1 munição. O primeiro disparo do turno custa Intervenção; os demais respeitam o limite de disparos da arma.",
                              "Recarregar (Intervenção) reabastece o carregador até a capacidade total.",
                            ],
                          });
                        }} />
                      </span>
                      <span className="font-mono text-neutral-200">
                        {selectedUnit.ammoInMag}/{w?.reload ?? 0}
                        {w && <span className="text-neutral-600 ml-2">({selectedUnit.shotsThisTurn}/{w.shots} disp.)</span>}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                        Postura
                        <Info size={12} className="cursor-pointer text-neutral-600 hover:text-white" onClick={(e) => {
                          e.stopPropagation();
                          setModalData({
                            title: "Postura",
                            content: [
                              `Postura atual: ${stanceLabel}`,
                              "🧍 Em pé — postura padrão, sem modificadores.",
                              "🛡️ Guarda — vigilância reativa: dispara contra inimigos que entrarem no arco de visão. Tiro reativo paga apenas munição (-10% de acerto). Encerra ao disparar.",
                              "🪖 Deitado — limita o movimento a 3m, mas concede +10% de defesa e bônus de crítico ao usar bipé.",
                            ],
                          });
                        }} />
                      </span>
                      <span className="font-bold text-neutral-200">{stanceLabel}</span>
                    </div>
                  </div>
                );
              })()}

              {isMyTurn && selectedUnit.team === playerTeam && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="relative flex flex-col gap-1">
                    <button
                      onClick={() => {
                        if (targetMode === "move") {
                          setTargetMode(null);
                          setMoveManualPath(null);
                          setMoveSubMode("auto");
                        } else {
                          setTargetMode("move");
                          setFacingMode(null);
                          setMoveSubMode("auto");
                          setMoveManualPath(null);
                        }
                      }}
                      disabled={!selectedUnit.actions.move && selectedUnit.extraMoveMeters <= selectedUnit.movedThisTurn}
                      className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed", targetMode === "move" ? "bg-green-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300")}
                    >
                      <Move size={16} /> Mover
                    </button>
                    {targetMode === "move" && (
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          onClick={() => {
                            setMoveSubMode("auto");
                            setMoveManualPath(null);
                          }}
                          className={cn("py-1 rounded text-xs font-bold transition-all", moveSubMode === "auto" ? "bg-green-700 text-white" : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300")}
                        >
                          Automático
                        </button>
                        <button
                          onClick={() => {
                            setMoveSubMode("manual");
                            const sgx = Math.floor(selectedUnit.x / CELL_SIZE);
                            const sgy = Math.floor(selectedUnit.y / CELL_SIZE);
                            setMoveManualPath([{ gx: sgx, gy: sgy }]);
                          }}
                          className={cn("py-1 rounded text-xs font-bold transition-all", moveSubMode === "manual" ? "bg-green-700 text-white" : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300")}
                        >
                          Manual
                        </button>
                      </div>
                    )}
                    <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                      e.stopPropagation();
                      setModalData({
                        title: "Mover",
                        content: [
                          "Custo: 1 ação de Movimento (M).",
                          "Automático: passe o mouse para pré-visualizar o caminho mais curto e clique para confirmar.",
                          "Manual: clique em células adjacentes para traçar o caminho livremente, depois confirme.",
                          "Após mover, o ângulo de visada fica travado — alterá-lo passa a custar Tática.",
                          "Se já tiver movimento extra disponível (ex.: Investida), poderá mover novamente sem gastar M.",
                        ],
                      });
                    }} />
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => { setTargetMode(targetMode === "shoot" ? null : "shoot"); setFacingMode(null); }}
                      disabled={selectedUnit.ammoInMag <= 0 || (selectedUnit.shotsThisTurn === 0 && !selectedUnit.actions.intervention && !selectedUnit.skills?.includes("Linha de Frente"))}
                      className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed", targetMode === "shoot" ? "bg-red-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300")}
                    >
                      <Crosshair size={16} /> Atirar
                    </button>
                    <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                      e.stopPropagation();
                      setModalData({
                        title: "Atirar",
                        content: [
                          selectedUnit.skills?.includes("Linha de Frente") ? "Custo: habilidade Linha de Frente permite atirar sem consumir Intervenção." : "Custo: o primeiro disparo do turno consome 1 Intervenção (I).",
                          "Disparos adicionais respeitam o limite de tiros por turno da arma e consomem apenas munição.",
                          "Cálculo de acerto: d100 vs (precisão da classe − penalidade de distância − cobertura − modificadores de postura).",
                          "Em caso de acerto, segunda rolagem d100 verifica crítico (com bônus de Sniper, Objetiva, bipé+prone, etc.).",
                        ],
                      });
                    }} />
                  </div>
                  <div className="relative">
                    <button
                      onClick={handleReload}
                      disabled={!selectedUnit.actions.intervention}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RotateCcw size={16} /> Recarregar
                    </button>
                    <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                      e.stopPropagation();
                      setModalData({
                        title: "Recarregar",
                        content: [
                          "Custo: 1 ação de Intervenção (I).",
                          "Reabastece o carregador da arma até a capacidade total.",
                          "Necessário sempre que a munição no carregador chegar a zero — sem munição, não é possível atirar.",
                        ],
                      });
                    }} />
                  </div>
                  
                  {selectedUnit.className.includes("Médico") && (
                    <div className="relative">
                      <button
                        onClick={() => { setTargetMode(targetMode === "heal" ? null : "heal"); setFacingMode(null); }}
                        disabled={!selectedUnit.actions.intervention}
                        className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed", targetMode === "heal" ? "bg-green-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300")}
                      >
                        <Heart size={16} /> Curar
                      </button>
                      <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                        e.stopPropagation();
                        setModalData({
                          title: "Curar",
                          content: [
                            "Custo: 1 ação de Intervenção (I).",
                            "Cura um aliado dentro do alcance (3 células de distância).",
                            selectedUnit.skills?.includes("Médico de Combate") ? "Você tem a habilidade Médico de Combate, curando 4 HP por uso." : "Cura base: 2 HP.",
                          ],
                        });
                      }} />
                    </div>
                  )}
                  
                  {selectedUnit.className === "Sniper" && selectedUnit.attachments?.includes("Objetiva") && (
                    <div className="relative">
                      <button
                        onClick={() => { setTargetMode(targetMode === "mark" ? null : "mark"); setFacingMode(null); }}
                        disabled={!selectedUnit.actions.tactical}
                        className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed", targetMode === "mark" ? "bg-amber-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300")}
                      >
                        <Crosshair size={16} /> Marcar Alvo
                      </button>
                      <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                        e.stopPropagation();
                        setModalData({
                          title: "Marcar Alvo",
                          content: [
                            "Custo: 1 ação Tática.",
                            "Apenas para Snipers com Objetiva.",
                            "Marca um alvo visível. O alvo permanecerá marcado até o fim do seu próximo turno, ignorando as restrições de FOV para você."
                          ],
                        });
                      }} />
                    </div>
                  )}
                  <div className="relative">
                    <button
                      onClick={handleCharge}
                      disabled={!selectedUnit.actions.intervention || selectedUnit.actions.chargeUsed}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Zap size={16} /> Investida
                    </button>
                    <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                      e.stopPropagation();
                      setModalData({
                        title: "Investida",
                        content: [
                          "Custo: 1 ação de Intervenção (I).",
                          "Concede um movimento extra equivalente ao deslocamento base da unidade.",
                          "Pode ser usada apenas uma vez por turno.",
                          "Útil para fechar distância rapidamente ou reposicionar após já ter usado a ação de Movimento.",
                        ],
                      });
                    }} />
                  </div>
                  <div className="relative">
                    <button
                      onClick={handleGuardActivate}
                      disabled={!selectedUnit.actions.intervention}
                      className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed", facingMode === "guard" ? "bg-amber-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300")}
                    >
                      <Eye size={16} /> Guarda
                    </button>
                    <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                      e.stopPropagation();
                      setModalData({
                        title: "Postura de Guarda",
                        content: [
                          "Custo: 1 ação de Intervenção (I) para ativar e definir o arco de vigilância.",
                          "Quando um inimigo entra no campo de visão da guarda, o jogador é notificado e pode confirmar ou pular o tiro reativo.",
                          "O tiro reativo paga apenas munição, mas tem -10% de chance de acerto.",
                          "A postura de Guarda é encerrada após disparar.",
                        ],
                      });
                    }} />
                  </div>
                  <div className="relative">
                    <button
                      onClick={handleProne}
                      disabled={!selectedUnit.actions.tactical}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronsDown size={16} /> {selectedUnit.stance === "prone" ? "Levantar" : "Deitar"}
                    </button>
                    <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                      e.stopPropagation();
                      setModalData({
                        title: selectedUnit.stance === "prone" ? "Levantar" : "Deitar",
                        content: [
                          "Custo: 1 ação de Tática (T).",
                          "Alterna a postura entre 🧍 Em pé e 🪖 Deitado.",
                          "Deitado: movimento limitado a 3m, mas concede +10% de defesa.",
                          "Bipés concedem bônus de crítico extra quando a unidade está deitada.",
                        ],
                      });
                    }} />
                  </div>
                  <div className="relative col-span-2">
                    <button
                      onClick={() => { setFacingMode(facingMode === "facing" ? null : "facing"); setTargetMode(null); }}
                      disabled={selectedUnit.facingLockedThisTurn && !selectedUnit.actions.tactical}
                      className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed", facingMode === "facing" ? "bg-cyan-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300")}
                    >
                      🎯 Definir Ângulo {selectedUnit.facingLockedThisTurn && "(Tática)"}
                    </button>
                    <Info size={12} className="absolute top-1 right-1.5 cursor-pointer text-neutral-500 hover:text-white z-10" onClick={(e) => {
                      e.stopPropagation();
                      setModalData({
                        title: "Definir Ângulo",
                        content: [
                          "Altera o sentido para o qual a unidade está voltada (campo de visão).",
                          "Custo: gratuito antes de mover no turno.",
                          "Após mover, redefinir o ângulo passa a custar 1 ação de Tática (T).",
                          "Importante para reagir a flancos e otimizar a Postura de Guarda.",
                        ],
                      });
                    }} />
                  </div>
                </div>
              )}
              {targetMode === "move" && <div className="text-xs text-center text-green-400 mt-2 animate-pulse">Selecione um ponto no mapa para mover.</div>}
              {targetMode === "shoot" && <div className="text-xs text-center text-red-400 mt-2 animate-pulse">Selecione um inimigo para atirar.</div>}
              {targetMode === "mark" && <div className="text-xs text-center text-amber-400 mt-2 animate-pulse">Selecione um inimigo visível para marcar.</div>}
              {targetMode === "heal" && <div className="text-xs text-center text-green-400 mt-2 animate-pulse">Selecione um aliado dentro do alcance para curar.</div>}
              {facingMode === "guard" && <div className="text-xs text-center text-amber-400 mt-2 animate-pulse">Clique no mapa para escolher o ângulo de vigilância.</div>}
              {facingMode === "facing" && <div className="text-xs text-center text-cyan-400 mt-2 animate-pulse">Clique no mapa para escolher o novo ângulo.</div>}
            </div>
          ) : (
            <div className="text-neutral-600 text-sm h-40 flex flex-col items-center justify-center border-2 border-dashed border-neutral-800 rounded-xl gap-2">
              <span>Nenhuma unidade selecionada.</span>
              {!isMyTurn && <span className="text-xs text-neutral-700">Aguardando seu turno...</span>}
            </div>
          )}
        </div>

        {/* Combat Log */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b border-neutral-800 bg-neutral-900 z-10 flex items-center gap-2">
            <Activity className="text-neutral-500" size={16} />
            <h3 className="uppercase tracking-widest text-xs font-bold text-neutral-500">Log de Combate</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col-reverse bg-black/20 shadow-inner">
            {[...gameState.logs].reverse().map((log) => (
              <div key={log.id} className="text-sm flex flex-col gap-1 border-l-2 border-neutral-700 pl-3">
                <span className="text-[10px] text-neutral-600 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="text-neutral-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shoot Confirmation HUD */}
      {pendingShootAction && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-4 flex gap-4 items-center pointer-events-auto">
            <div className="flex flex-col items-center border-r border-neutral-800 pr-4">
              <span className="font-bold text-white flex items-center gap-2"><Crosshair size={18} className="text-red-500" /> Confirmar Ataque</span>
            </div>
            <div className="flex flex-col min-w-40">
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Cálculo de Acerto</span>
              <div className="text-xs space-y-1 mb-2">
                <div className="flex justify-between text-neutral-400">
                  <span>Distância ({pendingShootAction.distanceMeters}m):</span>
                  <span className={pendingShootAction.distancePenalty > 0 ? "text-red-400" : ""}>{pendingShootAction.distancePenalty > 0 ? `-${pendingShootAction.distancePenalty}%` : "Sem penalidade"}</span>
                </div>
                <div className="flex justify-between text-neutral-400 border-b border-neutral-800 pb-1">
                  <span>Cobertura:</span>
                  <span>
                    {pendingShootAction.coverLevel === "full" && <span className="text-red-500">-40% (Total)</span>}
                    {pendingShootAction.coverLevel === "half" && <span className="text-yellow-500">-20% (Meia)</span>}
                    {pendingShootAction.coverLevel === "none" && <span className="text-green-500">Nenhuma</span>}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm text-white pt-1">
                  <span>Chance Hit:</span>
                  <span className={pendingShootAction.hitRate < 30 ? "text-red-500" : pendingShootAction.hitRate > 60 ? "text-green-500" : "text-yellow-500"}>{pendingShootAction.hitRate}%</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pl-2">
              <button onClick={() => setPendingShootAction(null)} className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors">Cancelar</button>
              <button onClick={executeShoot} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold text-xs transition-colors shadow-lg shadow-red-600/20">Atirar</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Guard Shot Modal */}
      {guardShotDecision && (() => {
        const info = computeGuardShotInfo(guardShotDecision);
        const guardName = info?.guard.name ?? "Sentinela";
        const targetName = info?.target.name ?? "Inimigo";
        const blocked = !info;
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-neutral-900 border-2 border-amber-600/50 rounded-xl p-6 shadow-2xl max-w-md w-full">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-800">
                <div className="w-10 h-10 bg-amber-600/20 rounded-full flex items-center justify-center">
                  <Eye className="text-amber-400" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">Tiro de Guarda disponível</h3>
                  <p className="text-xs text-neutral-500">{guardName} detectou {targetName} em seu arco de visão</p>
                </div>
              </div>
              {blocked ? (
                <p className="text-sm text-red-400 mb-4">Linha de tiro bloqueada por parede. Não é possível atirar.</p>
              ) : (
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between text-neutral-400">
                    <span>Arma:</span>
                    <span className="text-neutral-200">{info?.weapon?.name ?? "—"}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Distância:</span>
                    <span className="text-neutral-200">{info?.distanceMeters}m {info?.distancePenalty ? `(-${info.distancePenalty}%)` : ""}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Cobertura:</span>
                    <span>{info?.coverLevel === "full" ? "Total (-40%)" : info?.coverLevel === "half" ? "Meia (-20%)" : "Nenhuma"}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Penalidade Guarda:</span>
                    <span className="text-amber-400">-10%</span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t border-neutral-800">
                    <span>Chance Final:</span>
                    <span className={(info?.hitRate ?? 0) < 30 ? "text-red-500" : (info?.hitRate ?? 0) > 60 ? "text-green-500" : "text-yellow-500"}>{info?.hitRate}%</span>
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => resolveGuardShot(false)} className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-bold text-sm">
                  Não atirar
                </button>
                <button onClick={() => resolveGuardShot(true)} disabled={blocked} className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-6 py-2 rounded-lg font-bold text-sm">
                  Atirar agora
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Manual move bar */}
      {moveManualPath && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-neutral-900 border border-cyan-700 rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4">
          <div className="text-sm">
            <div className="font-bold text-white">Modo Manual</div>
            <div className="text-xs text-neutral-400">
              {moveManualPath.length - 1} célula(s) · {pathCostMeters(moveManualPath, mapCoverConfig).toFixed(1)} m · clique em uma célula adjacente
            </div>
          </div>
          <button
            onClick={() => setMoveManualPath(moveManualPath.length > 1 ? moveManualPath.slice(0, -1) : moveManualPath)}
            disabled={moveManualPath.length <= 1}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-2 rounded text-xs font-bold disabled:opacity-40"
          >
            Desfazer
          </button>
          <button onClick={cancelMove} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-2 rounded text-xs font-bold">
            Cancelar
          </button>
          <button
            onClick={confirmManualMove}
            disabled={moveManualPath.length < 2 || isMoving}
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-xs font-bold shadow disabled:opacity-40"
          >
            ✓ Confirmar
          </button>
        </div>
      )}

      {/* Info Modal */}
      {phaseTransitioning && <PhaseTransitionOverlay phase={phaseTransitioning} />}

      {modalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModalData(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 shadow-2xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-lg text-white">{modalData.title}</h3>
              <button onClick={() => setModalData(null)} className="text-neutral-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-2 text-sm text-neutral-300">
              {modalData.content.map((line, i) => <p key={i}>{line}</p>)}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setModalData(null)} className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Cover cell hover tooltip — only in battle phase */}
      {appState === "battle" && coverHoverLabel && (
        <div
          className="fixed z-[200] pointer-events-none px-2.5 py-1 rounded text-xs font-semibold text-white bg-black/85 border border-neutral-600 shadow-lg whitespace-nowrap"
          style={{ left: mouseScreenPos.x + 14, top: mouseScreenPos.y - 30 }}
        >
          {coverHoverLabel}
        </div>
      )}
    </div>
  );
}

function PhaseTransitionOverlay({ phase }: { phase: "deploy" | "battle" }) {
  const label = phase === "deploy" ? "Preparando posicionamento..." : "Iniciando o combate...";
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-4 bg-neutral-900 border border-neutral-700 rounded-xl px-8 py-6 shadow-2xl">
        <div className="w-10 h-10 border-4 border-neutral-700 border-t-cyan-400 rounded-full animate-spin" />
        <div className="text-sm text-neutral-200 font-mono tracking-wide">{label}</div>
      </div>
    </div>
  );
}
