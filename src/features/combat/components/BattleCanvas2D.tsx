import React from 'react';
import { Shield, ShieldHalf } from 'lucide-react';
import { Unit, MapCoverData, CoverType, GameState } from '@/src/types/game';
import { CELL_SIZE } from '@/src/core/data/constants';
import { cn } from '@/src/lib/utils';
import { ReachableCell, PathStep, reconstructPath } from '@/src/features/combat/utils/pathfinding';
import { FOVOverlay } from './FOVOverlay';
import { UnitToken2D } from './UnitToken2D';
import { ShootLineOverlay } from './ShootLineOverlay';
import { useMaps } from '@/src/core/contexts/MapContext';
import { useImages } from '@/src/core/contexts/ImageContext';

// ─── Types ─────────────────────────────────────────────────────────────────

interface PendingShootAction {
  sourceId: string;
  targetId: string;
  coverLevel: CoverType | 'none';
  hitRate: number;
  distanceMeters: number;
  distancePenalty: number;
  contributingHalfCells: string[];
  contributingFullCells: string[];
}

type FovState = 'visible' | 'marked' | 'obstructed' | 'out_of_cone' | null;
type TargetMode = 'move' | 'shoot' | 'mark' | 'heal' | 'suppress' | 'smoke' | 'grenade' | null;

interface BattleCanvas2DProps {
  gameState: GameState;
  mapCoverConfig: MapCoverData;
  selectedUnitId: string | null;
  targetMode: TargetMode;
  playerTeam: 'A' | 'B';
  isMyTurn: boolean;
  zoom: number;
  camera: { x: number; y: number };
  moveReachable: Map<string, ReachableCell> | null;
  moveHoverCell: { gx: number; gy: number } | null;
  moveManualPath: PathStep[] | null;
  pendingShootAction: PendingShootAction | null;
  facingMode: 'facing' | 'guard' | null;
  revealMap?: boolean;
  getFovState: (observer: Unit | null, target: Unit) => FovState;
  onCanvasClick: (e: React.MouseEvent) => void;
  onUnitClick: (e: React.MouseEvent, unit: Unit) => void;
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  setCanvasRef: (el: HTMLDivElement | null) => void;
}

// ─── Cover cell colors ──────────────────────────────────────────────────────
function getCoverStyle(type: CoverType): { bg: string; border: string; label: string } | null {
  switch (type) {
    case 'half':    return { bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.45)',   label: 'Meia Cobertura' };
    case 'full':    return { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.45)',   label: 'Cobertura Total' };
    case 'wall':    return { bg: 'rgba(64,64,64,0.55)',    border: 'rgba(115,115,115,0.8)',  label: 'Parede' };
    case 'deployA': return { bg: 'rgba(96,165,250,0.15)',  border: 'rgba(96,165,250,0.45)', label: 'Deploy A' };
    case 'deployB': return { bg: 'rgba(252,165,165,0.15)',border: 'rgba(252,165,165,0.45)',label: 'Deploy B' };
    case 'water':   return { bg: 'rgba(30,64,175,0.35)',   border: 'rgba(30,64,175,0.7)',   label: 'Água' };
    case 'doorOpen':  return { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.4)', label: 'Porta (Aberta)' };
    case 'doorClose': return { bg: 'rgba(120,53,15,0.3)',   border: 'rgba(120,53,15,0.7)',  label: 'Porta (Fechada)' };
    case 'window':  return { bg: 'rgba(147,197,253,0.1)',  border: 'rgba(147,197,253,0.4)', label: 'Janela' };
    default: return null;
  }
}

// ─── Cover edge icon colors ─────────────────────────────────────────────────
function getCoverEdgeColor(type: CoverType): string | null {
  switch (type) {
    case 'half':      return '#eab308'; // amarelo
    case 'full':      return '#ef4444'; // vermelho
    case 'wall':      return '#6b7280'; // cinza
    case 'doorClose': return '#92400e'; // marrom
    default: return null;
  }
}

/** Renderiza mini-ícones de escudo nas bordas de um tile, indicando coberturas adjacentes */
function renderCoverEdgeIcons(
  gx: number, gy: number,
  mapCoverConfig: MapCoverData,
  gridWidth: number, gridHeight: number,
): React.ReactNode[] {
  const dirs = [
    { dx:  0, dy: -1, dir: 'N', left: gx * CELL_SIZE + CELL_SIZE / 2, top: gy * CELL_SIZE },
    { dx:  0, dy:  1, dir: 'S', left: gx * CELL_SIZE + CELL_SIZE / 2, top: (gy + 1) * CELL_SIZE },
    { dx:  1, dy:  0, dir: 'E', left: (gx + 1) * CELL_SIZE,           top: gy * CELL_SIZE + CELL_SIZE / 2 },
    { dx: -1, dy:  0, dir: 'W', left: gx * CELL_SIZE,                  top: gy * CELL_SIZE + CELL_SIZE / 2 },
  ];
  return dirs.flatMap(({ dx, dy, dir, left, top }) => {
    const nx = gx + dx;
    const ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) return [];
    const coverType = mapCoverConfig[`${nx},${ny}`] as CoverType | undefined;
    const iconColor = coverType ? getCoverEdgeColor(coverType) : null;
    if (!iconColor) return [];
    const isHalf = coverType === 'half';
    return [
      <div
        key={`ce-${gx}-${gy}-${dir}`}
        className="absolute pointer-events-none flex items-center justify-center rounded-full"
        style={{
          left, top,
          transform: 'translate(-50%, -50%)',
          width: 16, height: 16,
          background: 'rgba(0,0,0,0.88)',
          border: `1px solid ${iconColor}`,
          boxShadow: `0 0 6px ${iconColor}50`,
          zIndex: 20,
        }}
      >
        {isHalf
          ? <ShieldHalf size={9} style={{ color: iconColor }} />
          : <Shield size={9} style={{ color: iconColor }} />
        }
      </div>,
    ];
  });
}

// ─── BattleCanvas2D ─────────────────────────────────────────────────────────

export const BattleCanvas2D: React.FC<BattleCanvas2DProps> = ({
  gameState, mapCoverConfig, selectedUnitId, targetMode, playerTeam, isMyTurn,
  zoom, camera, moveReachable, moveHoverCell, moveManualPath, pendingShootAction,
  facingMode, revealMap, getFovState, onCanvasClick, onUnitClick, onWheel, onMouseDown,
  onMouseMove, onMouseUp, onMouseLeave, onContextMenu, setCanvasRef,
}) => {
  const { maps } = useMaps();
  const { getRoleImage } = useImages();

  const mapDef = maps[gameState.mapId];
  const gridWidth = mapDef?.gridWidth ?? 40;
  const gridHeight = mapDef?.gridHeight ?? 40;
  const mapW = gridWidth * CELL_SIZE;
  const mapH = gridHeight * CELL_SIZE;

  const selectedUnit = selectedUnitId ? gameState.units[selectedUnitId] : null;
  const allUnits = Object.values(gameState.units) as Unit[];

  // ── Tiles que precisam de ícones de cobertura nas bordas ─────────────────
  const coverEdgeTiles = (() => {
    const seen = new Set<string>();
    const add = (gx: number, gy: number) => seen.add(`${gx},${gy}`);
    if (selectedUnit) add(Math.floor(selectedUnit.x / CELL_SIZE), Math.floor(selectedUnit.y / CELL_SIZE));
    if (moveHoverCell) add(moveHoverCell.gx, moveHoverCell.gy);
    allUnits.forEach(u => { if (u.hp > 0) add(Math.floor(u.x / CELL_SIZE), Math.floor(u.y / CELL_SIZE)); });
    return Array.from(seen).map(k => { const [gx, gy] = k.split(',').map(Number); return { gx, gy }; });
  })();

  // ── Hover path preview ───────────────────────────────────────────────────
  const hoverPath = (() => {
    if (targetMode !== 'move' || !moveReachable || !moveHoverCell || moveManualPath || !selectedUnit) return null;
    const sgx = Math.floor(selectedUnit.x / CELL_SIZE);
    const sgy = Math.floor(selectedUnit.y / CELL_SIZE);
    return reconstructPath(moveReachable, sgx, sgy, moveHoverCell.gx, moveHoverCell.gy);
  })();

  // ── Cursor ───────────────────────────────────────────────────────────────
  const isOutOfRange =
    targetMode === 'move' && moveReachable && moveHoverCell &&
    !moveReachable.has(`${moveHoverCell.gx},${moveHoverCell.gy}`);
  const cursor = isOutOfRange ? 'cursor-not-allowed' : facingMode ? 'cursor-crosshair' : 'cursor-crosshair';

  return (
    <div
      ref={setCanvasRef}
      className={cn('flex-1 relative overflow-hidden', cursor)}
      style={{
        background: 'radial-gradient(ellipse at 50% 50%, #1e293b 0%, #0a0a0a 100%)',
        borderRadius: 16,
        margin: 16,
        boxShadow: '0 0 40px rgba(0,0,0,0.8), inset 0 0 1px rgba(255,255,255,0.05)',
      }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
    >
      {/* ── Pan/Zoom world container ── */}
      <div
        onClick={onCanvasClick}
        className="absolute"
        style={{
          left: '50%', top: '50%',
          transformOrigin: '0 0',
          transform: `scale(${zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
          width: mapW, height: mapH,
          backgroundColor: '#111827',
        }}
      >
        {/* Map image */}
        {mapDef && (
          <img
            src={mapDef.imagePath}
            alt={mapDef.name}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ zIndex: 0 }}
          />
        )}

        {/* Grid overlay */}
        {zoom > 0.12 && (
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay"
            style={{
              zIndex: 1,
              opacity: zoom < 0.4 ? 0.5 : 0.8,
              backgroundImage: [
                `linear-gradient(to right, rgba(255,255,255,0.5) ${Math.max(1, 1.5 / zoom)}px, transparent ${Math.max(1, 1.5 / zoom)}px)`,
                `linear-gradient(to bottom, rgba(255,255,255,0.5) ${Math.max(1, 1.5 / zoom)}px, transparent ${Math.max(1, 1.5 / zoom)}px)`,
              ].join(', '),
              backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
            }}
          />
        )}

        {/* Cover cells overlay (sempre visível em batalha para hover) */}
        {Object.entries(mapCoverConfig).map(([key, type]) => {
          const style = getCoverStyle(type as CoverType);
          if (!style) return null;
          const [gx, gy] = key.split(',').map(Number);
          return (
            <div
              key={key}
              title={style.label}
              className="absolute pointer-events-none border rounded-sm"
              style={{
                left: gx * CELL_SIZE, top: gy * CELL_SIZE,
                width: CELL_SIZE, height: CELL_SIZE,
                backgroundColor: style.bg,
                borderColor: style.border,
                zIndex: 2,
                borderWidth: 1.5,
              }}
            />
          );
        })}

        {/* Reachable cells */}
        {targetMode === 'move' && moveReachable && Array.from(moveReachable.entries()).map(([key, cell]) => {
          const isStart = key === `${Math.floor((selectedUnit?.x ?? 0) / CELL_SIZE)},${Math.floor((selectedUnit?.y ?? 0) / CELL_SIZE)}`;
          if (isStart) return null;
          const ratio = cell.maxRange > 0 ? Math.min(1, cell.cost / cell.maxRange) : 0;
          const alpha = 0.08 + 0.28 * ratio;
          return (
            <div
              key={`reach-${key}`}
              className="absolute pointer-events-none border"
              style={{
                left: cell.gx * CELL_SIZE, top: cell.gy * CELL_SIZE,
                width: CELL_SIZE, height: CELL_SIZE,
                backgroundColor: `rgba(34,197,94,${alpha})`,
                borderColor: `rgba(34,197,94,${0.25 + 0.35 * ratio})`,
                borderWidth: 1,
                zIndex: 11,
              }}
            />
          );
        })}

        {/* Hover path (auto mode) */}
        {hoverPath && hoverPath.length >= 2 && (
          <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 12, overflow: 'visible' }}>
            <polyline
              points={hoverPath.map(p => `${p.gx * CELL_SIZE + CELL_SIZE / 2},${p.gy * CELL_SIZE + CELL_SIZE / 2}`).join(' ')}
              fill="none"
              stroke="rgba(34,197,94,0.9)"
              strokeWidth={Math.max(2, 3 / zoom)}
              strokeDasharray={`${10 / zoom} ${5 / zoom}`}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Manual path */}
        {moveManualPath && moveManualPath.length >= 2 && (
          <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 12, overflow: 'visible' }}>
            <polyline
              points={moveManualPath.map(p => `${p.gx * CELL_SIZE + CELL_SIZE / 2},${p.gy * CELL_SIZE + CELL_SIZE / 2}`).join(' ')}
              fill="none"
              stroke="rgba(56,189,248,0.95)"
              strokeWidth={Math.max(3, 4 / zoom)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Cover edge icons (ícones de escudo nas bordas dos tiles relevantes) */}
        {coverEdgeTiles.flatMap(({ gx, gy }) =>
          renderCoverEdgeIcons(gx, gy, mapCoverConfig, gridWidth, gridHeight)
        )}

        {/* Shoot mode — glow vermelho nos tiles dos inimigos visíveis */}
        {(targetMode === 'shoot' || targetMode === 'suppress') && allUnits
          .filter(u => u.team !== playerTeam && u.hp > 0 && getFovState(selectedUnit, u) === 'visible')
          .map(u => {
            const gx = Math.floor(u.x / CELL_SIZE);
            const gy = Math.floor(u.y / CELL_SIZE);
            return (
              <div
                key={`shoot-glow-${u.id}`}
                className="absolute pointer-events-none animate-pulse"
                style={{
                  left: gx * CELL_SIZE, top: gy * CELL_SIZE,
                  width: CELL_SIZE, height: CELL_SIZE,
                  backgroundColor: 'rgba(239,68,68,0.12)',
                  border: '1.5px solid rgba(239,68,68,0.5)',
                  borderRadius: 3,
                  zIndex: 12,
                }}
              />
            );
          })
        }

        {/* FOV overlay */}
        <FOVOverlay unit={selectedUnit} />

        {/* Shoot line */}
        {pendingShootAction &&
          gameState.units[pendingShootAction.sourceId] &&
          gameState.units[pendingShootAction.targetId] && (
          <ShootLineOverlay
            sourceX={gameState.units[pendingShootAction.sourceId].x}
            sourceY={gameState.units[pendingShootAction.sourceId].y}
            targetX={gameState.units[pendingShootAction.targetId].x}
            targetY={gameState.units[pendingShootAction.targetId].y}
            coverLevel={pendingShootAction.coverLevel}
            contributingHalfCells={pendingShootAction.contributingHalfCells}
            contributingFullCells={pendingShootAction.contributingFullCells}
          />
        )}

        {/* Units */}
        {allUnits.map((unit) => {
          if (unit.hp <= 0) return null;
          
          const isEnemy = unit.team !== playerTeam;
          const rawFov = getFovState(selectedUnit, unit);
          
          // Lógica de Visibilidade:
          // 1. Unidades aliadas sempre visíveis.
          // 2. Inimigos visíveis se revealMap for true OU se houver fovState (no modo target) que seja 'visible' ou 'marked'.
          const isVisible = !isEnemy || revealMap || rawFov === 'visible' || rawFov === 'marked';
          
          if (!isVisible) return null;

          const fovState = (targetMode === 'shoot' || targetMode === 'suppress' || targetMode === 'mark')
            ? rawFov
            : null;

          const imageUrl = getRoleImage(unit.className);
          // Passa hit rate apenas para o alvo confirmado do pendingShootAction
          const pendingHitRate = pendingShootAction?.targetId === unit.id
            ? pendingShootAction.hitRate
            : undefined;
          return (
            <UnitToken2D
              key={unit.id}
              unit={unit}
              isSelected={unit.id === selectedUnitId}
              isMyTurn={isMyTurn}
              playerTeam={playerTeam}
              targetMode={targetMode}
              fovState={fovState}
              imageUrl={imageUrl}
              zoom={zoom}
              onClick={onUnitClick}
              pendingHitRate={pendingHitRate}
            />
          );
        })}
      </div>
    </div>
  );
};
