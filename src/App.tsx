import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Unit, MapCoverData } from '@/src/types/game';
import { CELL_SIZE, CLASSES, WEAPONS, ARMORS, MAPS } from '@/src/core/data/constants';
import { cn } from '@/src/lib/utils';
import { useImages } from '@/src/core/contexts/ImageContext';
import { useAuth } from '@/src/features/auth/contexts/AuthContext';
import { LoginScreen } from '@/src/features/auth/components/LoginScreen';
import { CreateMatchMenu } from '@/src/features/match-setup/components/CreateMatchMenu';
import { DeployScreen } from '@/src/features/match-setup/components/DeployScreen';
import { SoldiersInfoMenu } from '@/src/features/combat/components/SoldiersInfoMenu';
import { MapEditorMenu } from '@/src/features/map-editor/components/MapEditorMenu';
import { AdminPanel } from '@/src/features/admin/components/AdminPanel';
import { BattleCanvas2D } from '@/src/features/combat/components/BattleCanvas2D';
import { PvEPanel } from '@/src/features/combat/components/PvEPanel';
import { BattleSidebar, BattleSidebarProps } from '@/src/components/BattleSidebar';
import { apiService, RoomStateResponse, PlayerSession } from '@/src/core/services/apiService';
import {
  computeReachable, reconstructPath, ReachableCell,
} from '@/src/features/combat/utils/pathfinding';
import { computeShotCover } from '@/src/features/combat/utils/cover';
import { usePveEngine } from '@/src/features/combat/hooks/usePveEngine';
import { useMaps } from '@/src/core/contexts/MapContext';
import { LogOut, Users, UserPlus, Map as MapIcon, Copy, Check, ShieldAlert, Settings, Eye, Ghost, RotateCw } from 'lucide-react';

// ─── App State ───────────────────────────────────────────────────────────────
type AppState =
  | 'login' | 'lobby' | 'createMatch' | 'deploy'
  | 'waiting' | 'battle' | 'soldiers' | 'editor' | 'admin';

// ─── Screen Wrapper ──────────────────────────────────────────────────────────
function ScreenWrapper({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('h-screen w-full bg-neutral-950 text-neutral-200 flex flex-col relative overflow-y-auto custom-scrollbar', className)}>
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,41,59,0.4)_0%,rgba(10,10,10,1)_100%)] pointer-events-none" />
      <div className="fixed -top-[10%] -left-[10%] w-[70%] h-[70%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed -bottom-[10%] -right-[10%] w-[70%] h-[70%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="relative z-10 w-full flex-1 flex flex-col items-center py-8">
        {children}
      </div>
    </div>
  );
}


// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading: authLoading, logout, commanderName } = useAuth();
  const { getRoleImage, getMapImage, roleImages } = useImages();
  const { maps } = useMaps();

  // ── App routing ────────────────────────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>('lobby');

  // ── Session / Room ─────────────────────────────────────────────────────────
  const [session, setSession] = useState<PlayerSession | null>(() => apiService.loadSession());
  const [roomState, setRoomState] = useState<RoomStateResponse | null>(null);
  const [mapCoverConfig, setMapCoverConfig] = useState<MapCoverData>({});

  // ── Battle selection ────────────────────────────────────────────────────────
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<'move' | 'shoot' | 'mark' | 'grenade' | 'heal' | 'suppress' | 'smoke' | null>(null);
  const [reachableMap, setReachableMap] = useState<Map<string, ReachableCell>>(new Map());
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Pending shoot preview ───────────────────────────────────────────────────
  const [pendingShootAction, setPendingShootAction] = useState<{
    sourceId: string; targetId: string;
    coverLevel: import('@/src/types/game').CoverType | 'none';
    hitRate: number; distanceMeters: number; distancePenalty: number;
    contributingHalfCells: string[]; contributingFullCells: string[];
  } | null>(null);

  // ── Facing mode ─────────────────────────────────────────────────────────────
  const [facingMode, setFacingMode] = useState<'facing' | 'guard' | null>(null);

  // ── Guard Shot decision ─────────────────────────────────────────────────────
  const [guardShotDecision, setGuardShotDecision] = useState<import('@/src/types/game').PendingGuardShot | null>(null);
  const [pendingGuardShots, setPendingGuardShots] = useState<import('@/src/types/game').PendingGuardShot[]>([]);

  // ── Phase transition loading flag ────────────────────────────────────────
  const [phaseTransitioning, setPhaseTransitioning] = useState<null | 'deploy' | 'battle'>(null);

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [coverHoverLabel, setCoverHoverLabel] = useState<string | null>(null);
  const [mouseScreenPos, setMouseScreenPos] = useState({ x: 0, y: 0 });
  const [revealMap, setRevealMap] = useState(false);

  // ── PvE Engine UI ─────────────────────────────────────────────────────────
  const [showPvEPanel, setShowPvEPanel] = useState(false);


  // ── 2D Camera / Pan / Zoom ──────────────────────────────────────────────────
  const [zoom, setZoom] = useState(0.45);
  const [camera, setCamera] = useState({ x: 1000, y: 1000 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, cx: 0, cy: 0 });
  const canvasContainerRef = React.useRef<HTMLDivElement | null>(null);

  // ── Move sub-states ─────────────────────────────────────────────────────────
  const [moveSubMode, setMoveSubMode] = useState<'auto' | 'manual'>('auto');
  const [moveHoverCell, setMoveHoverCell] = useState<{ gx: number; gy: number } | null>(null);
  const [moveManualPath, setMoveManualPath] = useState<import('@/src/features/combat/utils/pathfinding').PathStep[] | null>(null);

  // ── Sandbox Mode ────────────────────────────────────────────────────────────
  const [sandboxTokens, setSandboxTokens] = useState<{ A: string; B: string } | null>(null);

  // ── Derived state ──────────────────────────────────────────────────────────
  const gameState = roomState?.gameState ?? null;
  const currentTurn = roomState?.currentTurn ?? 'A';
  const playerTeam = session?.playerTeam ?? 'A';
  const units = useMemo(() => Object.values(gameState?.units ?? {}), [gameState]);
  const selectedUnit = useMemo(
    () => (selectedUnitId ? gameState?.units[selectedUnitId] ?? null : null),
    [selectedUnitId, gameState],
  );
  const logs = gameState?.logs ?? [];

  // Map definition
  const mapId = gameState?.mapId ?? roomState?.draft?.selectedMap ?? '';
  const mapDef = MAPS[mapId as keyof typeof MAPS];
  const gridWidth = mapDef?.gridWidth ?? 40;
  const gridHeight = mapDef?.gridHeight ?? 40;

  // Custom setters for engine sync
  const setRoomStateInternal = useCallback((s: RoomStateResponse) => setRoomState(s), []);
  const setGameStateInternal = useCallback((gs: import('@/src/types/game').GameState) => 
    setRoomState(prev => prev ? { ...prev, gameState: gs } : prev), []);

  usePveEngine(
    roomState,
    gameState,
    playerTeam,
    session?.playerToken ?? null,
    setRoomStateInternal,
    setGameStateInternal
  );
  const isPveMode = roomState?.draft?.gameMode === 'pve';

  // ── Polling ────────────────────────────────────────────────────────────────
  const fetchRoomState = useCallback(async () => {
    if (!session?.roomId) return;
    try {
      const data = await apiService.getRoomState(session.roomId);
      setRoomState(data);

      // Sincroniza tiros de guarda
      const incoming = data.pendingGuardShots || [];
      if (!guardShotDecision) {
        setPendingGuardShots(incoming);
      } else {
        const stillExists = incoming.some(p => p.id === guardShotDecision.id);
        setPendingGuardShots(incoming);
        if (!stillExists) setGuardShotDecision(null);
      }

      // Phase transitions
      const phase = data.phase;
      if (phase === 'draft' && appState !== 'createMatch' && appState !== 'lobby') {
        setAppState('createMatch');
      } else if (phase === 'deploy' && appState !== 'deploy' && appState !== 'createMatch' && appState !== 'lobby') {
        setPhaseTransitioning('deploy');
        setAppState('deploy');
        setTimeout(() => setPhaseTransitioning(null), 600);
      } else if (phase === 'active' && appState !== 'battle' && appState !== 'lobby') {
        setPhaseTransitioning('battle');
        const coverData = await apiService.getMapCover(session.roomId, data.gameState.mapId);
        setMapCoverConfig(coverData || {});
        setAppState('battle');
        setTimeout(() => setPhaseTransitioning(null), 600);
      }
    } catch {
      // polling error
    }
  }, [session, appState, guardShotDecision]);

  useEffect(() => {
    if (appState !== 'waiting' && appState !== 'createMatch' && appState !== 'deploy' && appState !== 'battle') return;
    fetchRoomState();
    const interval = setInterval(fetchRoomState, 1500);
    return () => clearInterval(interval);
  }, [appState, fetchRoomState]);

  // Abre modal de guarda automaticamente
  const shownGuardShotIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (guardShotDecision) return;
    const mine = pendingGuardShots.find(p => p.guardTeam === playerTeam && !shownGuardShotIdsRef.current.has(p.id));
    if (mine) {
      shownGuardShotIdsRef.current.add(mine.id);
      setGuardShotDecision(mine);
    }
  }, [pendingGuardShots, playerTeam, guardShotDecision]);

  // ── Auth redirect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading) {
      if (!user && appState !== 'login') {
        setAppState('login');
      } else if (user && appState === 'login') {
        setAppState('lobby');
      }
    }
  }, [user, authLoading, appState]);

  // ── Map cover loader ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.roomId || !mapId) return;
    apiService.getMapCover(session.roomId, mapId).then(setMapCoverConfig);
  }, [session?.roomId, mapId]);

  // ── Reachable cells calculator ─────────────────────────────────────────────
  const calcReachable = useCallback((unit: Unit) => {
    const classMove = CLASSES[unit.className]?.movement ?? 10;
    const armorPenal = unit.armorName
      ? ((Object.values(ARMORS) as any[]).find((a) => a.name === unit.armorName)?.movePenal ?? 0)
      : 0;
    const maxMove = classMove - armorPenal + unit.extraMoveMeters - unit.movedThisTurn;
    if (maxMove <= 0) { setReachableMap(new Map()); return; }

    const gx = Math.floor(unit.x / CELL_SIZE);
    const gy = Math.floor(unit.y / CELL_SIZE);
    const enemyOccupied = new Set<string>(
      units.filter(u => u.team !== unit.team && u.hp > 0).map(u => `${Math.floor(u.x / CELL_SIZE)},${Math.floor(u.y / CELL_SIZE)}`),
    );
    const allyOccupied = new Set<string>(
      units.filter(u => u.team === unit.team && u.hp > 0 && u.id !== unit.id).map(u => `${Math.floor(u.x / CELL_SIZE)},${Math.floor(u.y / CELL_SIZE)}`),
    );
    const reachable = computeReachable(gx, gy, gridWidth, gridHeight, mapCoverConfig, enemyOccupied, allyOccupied, maxMove);
    setReachableMap(reachable);
  }, [units, mapCoverConfig, gridWidth, gridHeight]);

  // ── Error helper ───────────────────────────────────────────────────────────
  const withError = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try { await fn(); }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Erro desconhecido'); }
  };

  // ── Action Handlers ────────────────────────────────────────────────────────
  const handleMove = useCallback(() => {
    if (!selectedUnit || !selectedUnit.actions.move) return;
    setTargetMode('move');
    calcReachable(selectedUnit);
  }, [selectedUnit, calcReachable]);

  const handleSetFacingClick = useCallback((worldX: number, worldY: number) => {
    if (!session || !selectedUnit) return;
    const dx = worldX - selectedUnit.x;
    const dy = worldY - selectedUnit.y;
    const angle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI));
    setFacingMode(null);
    withError(() => apiService.setFacing(session.roomId, session.playerToken, selectedUnit.id, angle));
  }, [session, selectedUnit]);

  const handleCellClick = useCallback(async (gx: number, gy: number) => {
    if (!session || !selectedUnit || targetMode !== 'move') return;
    const startGx = Math.floor(selectedUnit.x / CELL_SIZE);
    const startGy = Math.floor(selectedUnit.y / CELL_SIZE);
    // Use manual path if set, else reconstruct from reachableMap
    let path = moveManualPath;
    if (!path) {
      path = reconstructPath(reachableMap, startGx, startGy, gx, gy);
    }
    if (!path) { setActionError('Célula fora do alcance.'); return; }
    setTargetMode(null);
    setReachableMap(new Map());
    setMoveManualPath(null);
    setMoveHoverCell(null);
    await withError(() => apiService.moveUnit(session.roomId, session.playerToken, selectedUnit.id, path!));
  }, [session, selectedUnit, targetMode, reachableMap, moveManualPath]);

  const handleShoot = useCallback(() => {
    if (!selectedUnit?.actions.intervention) return;
    setTargetMode('shoot');
  }, [selectedUnit]);

  const handleUnitClick = useCallback(async (unitId: string) => {
    if (!session || !selectedUnit) { setSelectedUnitId(unitId); return; }
    const target = gameState?.units[unitId];
    if (!target) return;

    if (targetMode === 'shoot' || targetMode === 'suppress') {
      if (target.team === playerTeam) { setActionError('Alvo inválido.'); return; }
      const atk = selectedUnit;
      const dx = target.x - atk.x; const dy = target.y - atk.y;
      const distM = (Math.sqrt(dx * dx + dy * dy) / CELL_SIZE) * 1.5;
      const weapon = WEAPONS[atk.activeWeaponSlot === 'secondary' ? atk.secondaryWeapon ?? '' : atk.primaryWeapon ?? ''];
      let distPenalty = 0;
      if (weapon) {
        const range = weapon.range === 'Curto' ? 20 : weapon.range === 'Médio' ? 40 : 60;
        const perM = weapon.range === 'Curto' ? 2 : weapon.range === 'Médio' ? 1 : 0.5;
        distPenalty = Math.max(0, (distM - range) * perM);
      }
      setTargetMode(null);
      if (targetMode === 'suppress') {
        await withError(() => apiService.suppressUnit(session.roomId, session.playerToken, atk.id, unitId));
      } else {
        await withError(() => apiService.shootUnit(session.roomId, session.playerToken, atk.id, unitId, distPenalty));
      }
    } else if (targetMode === 'heal') {
      if (target.team !== playerTeam) { setActionError('Só pode curar aliados.'); return; }
      setTargetMode(null);
      await withError(() => apiService.healUnit(session.roomId, session.playerToken, selectedUnit.id, unitId));
    } else {
      setSelectedUnitId(unitId);
      setTargetMode(null);
      setReachableMap(new Map());
    }
  }, [session, selectedUnit, gameState, targetMode, playerTeam]);

  const handleReload = useCallback(async () => {
    if (!session || !selectedUnit?.actions.intervention) return;
    await withError(() => apiService.reloadUnit(session.roomId, session.playerToken, selectedUnit.id));
  }, [session, selectedUnit]);

  const handleGuard = useCallback(async () => {
    if (!session || !selectedUnit?.actions.intervention) return;
    await withError(() => apiService.guardUnit(session.roomId, session.playerToken, selectedUnit.id, selectedUnit.rotation));
  }, [session, selectedUnit]);

  const handleToggleProne = useCallback(async () => {
    if (!session || !selectedUnit?.actions.tactical) return;
    await withError(() => apiService.toggleProne(session.roomId, session.playerToken, selectedUnit.id));
  }, [session, selectedUnit]);

  const handleHeal = useCallback(() => {
    if (!selectedUnit?.actions.intervention) return;
    setTargetMode('heal');
  }, [selectedUnit]);

  const handleGrenade = useCallback(() => {
    if (!selectedUnit?.actions.intervention) return;
    setTargetMode('grenade');
  }, [selectedUnit]);

  const handleSmoke = useCallback(() => {
    if (!selectedUnit?.actions.intervention || !selectedUnit.hasSmokeGrenade) return;
    setTargetMode('smoke');
  }, [selectedUnit]);

  const handleSuppress = useCallback(() => {
    if (!selectedUnit?.actions.intervention) return;
    setTargetMode('suppress');
  }, [selectedUnit]);

  const handleMarkTarget = useCallback(async () => {
    if (!session || !selectedUnit?.actions.tactical) return;
    setTargetMode('mark');
  }, [session, selectedUnit]);

  const handleCharge = useCallback(async () => {
    if (!session || !selectedUnit?.actions.move) return;
    await withError(() => apiService.chargeUnit(session.roomId, session.playerToken, selectedUnit.id));
  }, [session, selectedUnit]);

  const resolveGuardShot = useCallback(async (accept: boolean) => {
    if (!guardShotDecision || !session) return;
    const decidingId = guardShotDecision.id;
    setGuardShotDecision(null);
    await withError(() => apiService.resolveGuardShot(session.roomId, session.playerToken, decidingId, accept, 0));
  }, [guardShotDecision, session]);

  const handleHailOfBullets = useCallback(async () => {
    if (!session || !selectedUnit?.actions.intervention) return;
    setTargetMode('shoot');
  }, [session, selectedUnit]);

  const computeGuardShotInfo = useCallback((pending: import('@/src/types/game').PendingGuardShot) => {
    if (!gameState) return null;
    const guard = gameState.units[pending.guardUnitId];
    const target = gameState.units[pending.targetUnitId];
    if (!guard || !target) return null;
    const lineCheck = computeShotCover(guard.x, guard.y, target.x, target.y, mapCoverConfig);
    if (lineCheck.hasWall) return null;
    const coverLevel = lineCheck.cover;
    const distance = Math.hypot(target.x - guard.x, target.y - guard.y);
    const distanceMeters = Math.round((distance / CELL_SIZE) * 1.5); // METERS_PER_CELL
    
    // Simplificado para UI, backend calcula real
    let hitRate = (CLASSES[guard.className]?.hit ?? 60) - 10;
    if (coverLevel === 'half') hitRate -= 20;
    if (coverLevel === 'full') hitRate -= 40;
    return { guard, target, coverLevel, distanceMeters, hitRate };
  }, [gameState, mapCoverConfig]);

  const handleRotate = useCallback(() => {
    if (!selectedUnit) return;
    setTargetMode(null);
    setFacingMode('facing');
  }, [selectedUnit]);

  const handleEndTurn = useCallback(async () => {
    if (!session || currentTurn !== playerTeam) return;
    setSelectedUnitId(null);
    setTargetMode(null);
    setReachableMap(new Map());
    setMoveManualPath(null);
    setMoveHoverCell(null);
    setPendingShootAction(null);
    setFacingMode(null);
    await withError(() => apiService.endTurn(session.roomId, session.playerToken));
  }, [session, currentTurn, playerTeam]);

  const handleDeselect = useCallback(() => {
    setSelectedUnitId(null);
    setTargetMode(null);
    setReachableMap(new Map());
    setMoveManualPath(null);
    setMoveHoverCell(null);
    setPendingShootAction(null);
    setActionError(null);
    setFacingMode(null);
  }, []);

  // ── getFovState ──────────────────────────────────────────────────────────────
  const getFovState = useCallback((observer: Unit | null, target: Unit): 'visible' | 'marked' | 'obstructed' | 'out_of_cone' | null => {
    if (!observer || observer.team === target.team) return null;
    // Marked target
    if (observer.markedTargetId === target.id) return 'marked';
    // Compute cover — wall blocks
    const coverResult = computeShotCover(observer.x, observer.y, target.x, target.y, mapCoverConfig);
    if (coverResult.hasWall) return 'obstructed';
    // FOV cone check (90° arc)
    const dx = target.x - observer.x;
    const dy = target.y - observer.y;
    const angleToTarget = Math.atan2(dy, dx) * (180 / Math.PI);
    const facingAngle = observer.rotation ?? 0;
    let diff = Math.abs(angleToTarget - facingAngle) % 360;
    if (diff > 180) diff = 360 - diff;
    if (diff > 45) return 'out_of_cone';
    // Distance check
    const dist = (Math.sqrt(dx * dx + dy * dy) / CELL_SIZE) * 1.5;
    if (dist > 40) return 'out_of_cone';
    return 'visible';
  }, [mapCoverConfig]);

  // ── 2D Camera handlers ───────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(8, Math.max(0.05, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown2D = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || (!targetMode && !selectedUnit)) {
      setIsPanning(true);
      setPanStart({ mx: e.clientX, my: e.clientY, cx: camera.x, cy: camera.y });
    }
  }, [camera, targetMode, selectedUnit]);

  const handleMouseMove2D = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = (e.clientX - panStart.mx) / zoom;
      const dy = (e.clientY - panStart.my) / zoom;
      setCamera({ x: panStart.cx - dx, y: panStart.cy - dy });
      return;
    }
    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left) / zoom + camera.x - (rect.width / 2 / zoom);
      const worldY = (e.clientY - rect.top) / zoom + camera.y - (rect.height / 2 / zoom);
      const gx = Math.floor(worldX / CELL_SIZE);
      const gy = Math.floor(worldY / CELL_SIZE);
      
      setMouseScreenPos({ x: e.clientX, y: e.clientY });
      
      if (targetMode === 'move') {
        setMoveHoverCell({ gx, gy });
      } else {
        setMoveHoverCell(null);
      }

      const cellType = mapCoverConfig[`${gx},${gy}`];
      if (cellType && cellType !== 'none') {
        const labels: Record<string, string> = {
          half: 'Meia Cobertura', full: 'Cobertura Total', wall: 'Parede',
          water: 'Água', deployA: 'Zona Deploy A', deployB: 'Zona Deploy B',
          doorOpen: 'Porta (Aberta)', doorClose: 'Porta (Fechada)', window: 'Janela'
        };
        setCoverHoverLabel(labels[cellType] || null);
      } else {
        setCoverHoverLabel(null);
      }
    }
  }, [isPanning, panStart, zoom, camera, targetMode, mapCoverConfig]);

  const handleMouseUp2D = useCallback(() => setIsPanning(false), []);

  const handleCanvasClick2D = useCallback((e: React.MouseEvent) => {
    if (isPanning || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) / zoom + camera.x - (rect.width / 2 / zoom);
    const worldY = (e.clientY - rect.top) / zoom + camera.y - (rect.height / 2 / zoom);
    const gx = Math.floor(worldX / CELL_SIZE);
    const gy = Math.floor(worldY / CELL_SIZE);

    if (facingMode) {
      handleSetFacingClick(worldX, worldY);
      return;
    }

    if (targetMode === 'move') {
      if (moveSubMode === 'manual' && moveManualPath) {
        const last = moveManualPath[moveManualPath.length - 1];
        const dx = Math.abs(gx - last.gx);
        const dy = Math.abs(gy - last.gy);
        if (dx + dy !== 1) return; // apenas células adjacentes
        if (!reachableMap.has(`${gx},${gy}`)) return;
        if (moveManualPath.some(p => p.gx === gx && p.gy === gy)) return; // sem loops
        setMoveManualPath([...moveManualPath, { gx, gy }]);
      } else {
        handleCellClick(gx, gy);
      }
      return;
    }
  }, [isPanning, zoom, camera, targetMode, moveSubMode, moveManualPath, reachableMap, facingMode, handleCellClick, handleSetFacingClick]);

  const SandboxToggle = () => {
    if (!sandboxTokens || !session) return null;
    const isA = session.playerTeam === 'A';
    return (
      <button
        onClick={() => {
          const nextTeam = isA ? 'B' : 'A';
          const nextToken = sandboxTokens[nextTeam];
          setSession({ ...session, playerTeam: nextTeam, playerToken: nextToken });
          apiService.saveSession({ ...session, playerTeam: nextTeam, playerToken: nextToken, sandboxTokens });
        }}
        className="fixed top-4 left-4 z-[999] bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg border border-orange-400 flex items-center gap-2 transition-all hover:scale-105"
      >
        <Users size={16} /> Sandbox: Equipe {session.playerTeam} (Clique para mudar)
      </button>
    );
  };

  const handleUnitClick2D = useCallback((e: React.MouseEvent, unit: Unit) => {
    e.stopPropagation();
    handleUnitClick(unit.id);
  }, [handleUnitClick]);

  // ── Create / Join Room ─────────────────────────────────────────────────────
  const handleCreateRoom = useCallback(async () => {
    if (!commanderName) return;
    try {
      const result = await apiService.createRoom(commanderName);
      setSession({
        roomId: result.roomId,
        playerToken: result.playerToken,
        playerTeam: 'A',
        playerName: commanderName,
      });
      setAppState('createMatch');
    } catch {
      setActionError('Erro ao criar sala.');
    }
  }, [commanderName]);

  const handleCreateSandboxRoom = useCallback(async () => {
    if (!commanderName) return;
    try {
      const result = await apiService.createRoom(`${commanderName} (A)`);
      const joinResult = await apiService.joinRoom(result.roomId, `${commanderName} (B)`);
      const st = { A: result.playerToken, B: joinResult.playerToken };
      setSandboxTokens(st);
      setSession({
        roomId: result.roomId,
        playerToken: result.playerToken,
        playerTeam: 'A',
        playerName: `${commanderName} (OnyX Sandbox)`,
        sandboxTokens: st,
      });
      setAppState('createMatch');
    } catch {
      setActionError('Erro ao criar sandbox.');
    }
  }, [commanderName]);

  const handleJoinRoom = useCallback(async (roomId: string) => {
    if (!commanderName) return;
    setRoomState(null); // Limpa resquícios da sessão anterior
    
    const res = await apiService.joinRoom(roomId, commanderName);
    const sess: PlayerSession = { playerName: commanderName, roomId: res.roomId, playerToken: res.playerToken, playerTeam: res.team };
    apiService.saveSession(sess);
    setSession(sess);
    setAppState('waiting');
  }, [commanderName]);

  const handleLeaveMatch = useCallback(() => {
    if (window.confirm("Deseja realmente sair da partida?")) {
      apiService.clearSession();
      setSession(null);
      setRoomState(null);
      setAppState('lobby');
    }
  }, []);

  const handleLogout = useCallback(async () => {
    apiService.clearSession();
    setSession(null);
    setRoomState(null);
    setAppState('login');
    await logout();
  }, [logout]);

  // ── Copy room ID ───────────────────────────────────────────────────────────
  const copyRoomId = useCallback(() => {
    if (!session?.roomId) return;
    navigator.clipboard.writeText(session.roomId);
    setCopiedRoomId(true);
    setTimeout(() => setCopiedRoomId(false), 2000);
  }, [session]);

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-600 font-mono text-xs animate-pulse">Inicializando Sistema...</div>
      </div>
    );
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!user || appState === 'login') {
    return <LoginScreen onLoginSuccess={() => setAppState('lobby')} />;
  }

  // ── Soldiers Info ──────────────────────────────────────────────────────────
  if (appState === 'soldiers') {
    return (
      <ScreenWrapper>
        <SoldiersInfoMenu onBack={() => setAppState('lobby')} />
      </ScreenWrapper>
    );
  }

  // ── Map Editor ─────────────────────────────────────────────────────────────
  if (appState === 'editor') {
    return (
      <ScreenWrapper>
        <MapEditorMenu onBack={() => setAppState('lobby')} />
      </ScreenWrapper>
    );
  }

  // ── Admin Panel ────────────────────────────────────────────────────────────
  if (appState === 'admin') {
    return (
      <ScreenWrapper>
        <AdminPanel onClose={() => setAppState('lobby')} />
      </ScreenWrapper>
    );
  }

  // ── Create Match ───────────────────────────────────────────────────────────
  if (appState === 'createMatch' && session) {
    if (!roomState) {
      return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
          <div className="text-neutral-500 font-mono text-xs animate-pulse">Conectando à sala...</div>
        </div>
      );
    }
    return (
      <ScreenWrapper>
        <CreateMatchMenu
          roomId={session.roomId}
          playerToken={session.playerToken}
          playerTeam={playerTeam}
          state={roomState}
          onBack={() => {
            apiService.clearSession();
            setSession(null);
            setRoomState(null);
            setAppState('lobby');
          }}
          onMatchReady={() => setAppState('deploy')}
        />
      </ScreenWrapper>
    );
  }

  // ── Deploy ─────────────────────────────────────────────────────────────────
  if ((appState === 'deploy' || appState === 'waiting') && session) {
    return (
      <div className="min-h-screen w-full bg-neutral-950 flex flex-col">
        <DeployScreen
          roomId={session.roomId}
          playerToken={session.playerToken}
          playerTeam={playerTeam}
          state={roomState!}
          onLeave={() => { apiService.clearSession(); setSession(null); setRoomState(null); setAppState('lobby'); }}
        />
      </div>
    );
  }

  // ── Battle ─────────────────────────────────────────────────────────────────
  if (appState === 'battle' && session && gameState) {
    return (
      <div
        className="relative w-screen h-screen overflow-hidden bg-neutral-950 flex"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Canvas 2D */}
        <BattleCanvas2D
          gameState={gameState}
          mapCoverConfig={mapCoverConfig}
          selectedUnitId={selectedUnitId}
          targetMode={targetMode}
          playerTeam={playerTeam}
          isMyTurn={currentTurn === playerTeam}
          zoom={zoom}
          camera={camera}
          moveReachable={reachableMap}
          moveHoverCell={moveHoverCell}
          moveManualPath={moveManualPath}
          pendingShootAction={pendingShootAction}
          facingMode={facingMode}
          revealMap={revealMap}
          getFovState={getFovState}
          onCanvasClick={handleCanvasClick2D}
          onUnitClick={handleUnitClick2D}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown2D}
          onMouseMove={handleMouseMove2D}
          onMouseUp={handleMouseUp2D}
          onMouseLeave={handleMouseUp2D}
          onContextMenu={(e) => e.preventDefault()}
          setCanvasRef={(el) => { canvasContainerRef.current = el; }}
        />

        {/* Sidebar HUD — overlay 2D */}
        <BattleSidebar
          selectedUnit={selectedUnit}
          playerTeam={playerTeam}
          currentTurn={currentTurn}
          logs={logs}
          targetMode={targetMode}
          pendingGuardCount={pendingGuardShots.length}
          actionError={actionError}
          onMove={handleMove}
          onShoot={handleShoot}
          onRotate={handleRotate}
          onReload={handleReload}
          onGuard={handleGuard}
          onToggleProne={handleToggleProne}
          onHeal={handleHeal}
          onGrenade={handleGrenade}
          onSmoke={handleSmoke}
          onSuppress={handleSuppress}
          onHailOfBullets={handleHailOfBullets}
          onCharge={handleCharge}
          onMarkTarget={handleMarkTarget}
          onEndTurn={handleEndTurn}
          onDeselect={handleDeselect}
          onLeave={handleLeaveMatch}
          moveSubMode={moveSubMode}
          onToggleMoveMode={setMoveSubMode}
        />

        {/* Manual Move Bar */}
        {moveSubMode === 'manual' && moveManualPath && moveManualPath.length >= 1 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-neutral-900/90 backdrop-blur border border-cyan-700 rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4">
            <div className="text-sm">
              <div className="font-bold text-white">Modo Manual</div>
              <div className="text-xs text-neutral-400">
                {moveManualPath.length - 1} célula(s) · clique em uma célula adjacente
              </div>
            </div>
            <button
              onClick={() => setMoveManualPath(moveManualPath.length > 1 ? moveManualPath.slice(0, -1) : moveManualPath)}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded text-xs font-bold"
            >
              Desfazer
            </button>
            <button
              onClick={() => {
                const path = moveManualPath;
                setMoveManualPath(null);
                setMoveSubMode('auto');
                apiService.moveUnit(session!.roomId, session!.playerToken, selectedUnit!.id, path);
              }}
              disabled={moveManualPath.length < 2}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded text-xs font-bold disabled:opacity-40"
            >
              ✓ Confirmar
            </button>
          </div>
        )}

        <SandboxToggle />

        {/* PvE Control Buttons (Radar & Control) */}
        {isPveMode && playerTeam === 'A' && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 flex gap-3 bg-neutral-900/60 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-2xl">
            <button
              onClick={() => setRevealMap(!revealMap)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-xs uppercase tracking-tighter",
                revealMap 
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" 
                  : "hover:bg-white/5 text-neutral-500"
              )}
              title="Revelar Mapa (Radar)"
            >
              <Eye size={16} />
              <span>Radar</span>
            </button>
            <div className="w-px h-8 bg-white/10 my-auto" />
            <button
              onClick={() => setShowPvEPanel(!showPvEPanel)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-xs uppercase tracking-tighter",
                showPvEPanel
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "hover:bg-white/5 text-neutral-400"
              )}
              title="Controle de Zumbis"
            >
              <Ghost size={16} />
              <span>Horda</span>
            </button>
          </div>
        )}

        {/* PvE Panel */}
        {showPvEPanel && isPveMode && roomState?.pveConfig && (
          <div className="fixed top-20 right-80 z-[100]">
            <PvEPanel
              config={roomState.pveConfig}
              onSpawnZombie={(type, x, y) => apiService.spawnZombie(session!.roomId, session!.playerToken, type, x, y).then(res => res.success && setRoomStateInternal(res.roomState))}
              onUpdateConfig={(cfg) => apiService.updatePveConfig(session!.roomId, session!.playerToken, cfg).then(res => res.success && setRoomStateInternal(res.roomState))}
              onClose={() => setShowPvEPanel(false)}
            />
          </div>
        )}

        {/* Phase Transition */}
        {phaseTransitioning && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-4 bg-neutral-900 border border-neutral-700 rounded-xl px-8 py-6 shadow-2xl">
              <div className="w-10 h-10 border-4 border-neutral-700 border-t-cyan-400 rounded-full animate-spin" />
              <div className="text-sm text-neutral-200 font-mono tracking-wide">
                {phaseTransitioning === 'deploy' ? 'Preparando posicionamento...' : 'Iniciando combate...'}
              </div>
            </div>
          </div>
        )}

        {/* Guard Shot Modal */}
        {guardShotDecision && (() => {
          const info = computeGuardShotInfo(guardShotDecision);
          return (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-neutral-900 border-2 border-amber-600/50 rounded-xl p-6 shadow-2xl max-w-md w-full">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-800">
                  <div className="w-10 h-10 bg-amber-600/20 rounded-full flex items-center justify-center">
                    <Eye className="text-amber-400" size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">Tiro de Guarda disponível</h3>
                    <p className="text-xs text-neutral-500">
                      {info?.guard.name || 'Sentinela'} detectou {info?.target.name || 'Inimigo'}
                    </p>
                  </div>
                </div>
                {info ? (
                  <div className="space-y-2 text-sm mb-6">
                    <div className="flex justify-between text-neutral-400">
                      <span>Distância:</span>
                      <span className="text-neutral-200">{info.distanceMeters}m</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>Cobertura:</span>
                      <span className="text-neutral-200">{info.coverLevel === 'full' ? 'Total' : info.coverLevel === 'half' ? 'Meia' : 'Nenhuma'}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2 border-t border-neutral-800">
                      <span>Chance de Acerto:</span>
                      <span className={info.hitRate < 30 ? 'text-red-500' : 'text-green-500'}>{info.hitRate}%</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-400 mb-6">Linha de tiro obstruída por obstáculo.</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => resolveGuardShot(false)} className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                    Ignorar
                  </button>
                  <button onClick={() => resolveGuardShot(true)} disabled={!info} className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors shadow-lg shadow-red-600/20">
                    Atirar Agora
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Cover Tooltip */}
        {coverHoverLabel && (
          <div
            className="fixed z-[200] pointer-events-none px-2.5 py-1 rounded text-xs font-semibold text-white bg-black/85 border border-neutral-600 shadow-lg whitespace-nowrap"
            style={{ left: mouseScreenPos.x + 14, top: mouseScreenPos.y - 30 }}
          >
            {coverHoverLabel}
          </div>
        )}



        {/* Room ID badge */}
        {session && (
          <button
            onClick={copyRoomId}
            className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-[9px] font-mono text-neutral-500 hover:text-white transition-colors"
          >
            {copiedRoomId ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            {session.roomId.slice(0, 8)}...
          </button>
        )}
      </div>
    );
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <div className="w-full max-w-md mx-auto space-y-6 px-4">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-black text-white tracking-tighter">CALL OF WAR</h1>
          <p className="text-neutral-600 text-xs font-mono uppercase tracking-widest mt-1">Simulador Tático VTT</p>
          {commanderName && (
            <p className="text-indigo-400 text-sm font-bold mt-2">Comandante {commanderName}</p>
          )}
        </div>

        {/* Menu */}
        <div
          className="rounded-2xl p-6 border border-white/5 space-y-3"
          style={{ background: 'rgba(15,15,20,0.8)', backdropFilter: 'blur(20px)' }}
        >
          <button
            id="btn-create-match"
            onClick={handleCreateRoom}
            className="w-full flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-5 rounded-xl transition-all shadow-lg shadow-indigo-600/10"
          >
            <UserPlus size={18} /> Criar Partida
          </button>

          <button
            onClick={handleCreateSandboxRoom}
            className="w-full flex items-center gap-3 bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-5 rounded-xl transition-all shadow-lg shadow-orange-600/10"
          >
            <Users size={18} /> Modo Sandbox (OnyX)
          </button>

          <div className="flex gap-2">
            <input
              id="input-room-id"
              type="text"
              placeholder="ID da Sala"
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) await handleJoinRoom(val);
                }
              }}
            />
            <button
              className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-4 rounded-xl border border-white/5 transition-all"
              onClick={async () => {
                const input = document.getElementById('input-room-id') as HTMLInputElement;
                if (input?.value.trim()) await handleJoinRoom(input.value.trim());
              }}
            >
              <Users size={16} />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setAppState('soldiers')}
              className="flex-1 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-white/5 text-neutral-300 font-bold py-3 px-4 rounded-xl transition-all text-sm"
            >
              <ShieldAlert size={15} /> Soldados
            </button>
            <button
              onClick={() => setAppState('editor')}
              className="flex-1 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-white/5 text-neutral-300 font-bold py-3 px-4 rounded-xl transition-all text-sm"
            >
              <MapIcon size={15} /> Editor
            </button>
            <button
              onClick={() => setAppState('admin')}
              className="flex-1 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-white/5 text-neutral-300 font-bold py-3 px-4 rounded-xl transition-all text-sm"
            >
              <Settings size={15} /> Admin
            </button>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 text-neutral-700 hover:text-red-400 text-xs font-mono uppercase tracking-widest transition-colors py-2"
        >
          <LogOut size={12} /> Desconectar
        </button>
      </div>
    </ScreenWrapper>
  );
}
