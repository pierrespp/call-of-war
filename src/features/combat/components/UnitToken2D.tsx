import React from 'react';
import { Unit } from '@/src/types/game';
import { CELL_SIZE, CLASSES, ARMORS, SCALE, METERS_PER_CELL } from '@/src/core/data/constants';
import { cn } from '@/src/lib/utils';

interface UnitToken2DProps {
  unit: Unit;
  isSelected: boolean;
  isMyTurn: boolean;
  playerTeam: 'A' | 'B';
  targetMode: 'move' | 'shoot' | 'mark' | 'heal' | 'suppress' | 'smoke' | 'grenade' | null;
  fovState: 'visible' | 'marked' | 'obstructed' | 'out_of_cone' | null;
  imageUrl: string;
  zoom: number;
  onClick: (e: React.MouseEvent, unit: Unit) => void;
  /** Hit rate do backend para este alvo (undefined = mostrar '?') */
  pendingHitRate?: number;
}

/** Tamanho do token: 88% da célula */
const TOKEN_SIZE = Math.round(CELL_SIZE * 0.88);
const HP_BAR_W = Math.round(CELL_SIZE * 0.92);

export const UnitToken2D: React.FC<UnitToken2DProps> = ({
  unit, isSelected, isMyTurn, playerTeam, targetMode, fovState, imageUrl, zoom, onClick,
  pendingHitRate,
}) => {
  const isMyUnit = unit.team === playerTeam;
  const isEnemy = unit.team !== playerTeam;

  const unitClassInfo = CLASSES[unit.className];
  const maxHp = unitClassInfo?.hp ?? unit.hp;
  const hpPercent = maxHp > 0 ? Math.max(0, Math.min(100, (unit.hp / maxHp) * 100)) : 0;

  // Cores por time
  const teamColor = unit.team === 'A' ? '#3b82f6' : '#ef4444';
  const teamGlow = unit.team === 'A' ? 'rgba(59,130,246,0.6)' : 'rgba(239,68,68,0.6)';
  const teamBorder = unit.team === 'A' ? '#93c5fd' : '#fca5a5';

  // Estado visual do token
  const isValidShootTarget = (targetMode === 'shoot' || targetMode === 'suppress') && isEnemy && fovState === 'visible';
  const isMarkedTarget = (targetMode === 'shoot' || targetMode === 'suppress') && isEnemy && fovState === 'marked';
  const isObstructed = (targetMode === 'shoot' || targetMode === 'suppress') && isEnemy && (fovState === 'obstructed' || fovState === 'out_of_cone');
  const isHealTarget = targetMode === 'heal' && !isEnemy;
  const isMarkTarget = targetMode === 'mark' && isEnemy;
  const isClickable = (isMyUnit && isMyTurn && !targetMode) || isValidShootTarget || isMarkedTarget || isHealTarget || isMarkTarget;

  // Ring externo de seleção / alvo
  let ringColor = 'transparent';
  let ringAnim = '';
  if (isSelected) { ringColor = '#ffffff'; }
  else if (isValidShootTarget) { ringColor = '#22c55e'; ringAnim = 'animate-pulse'; }
  else if (isMarkedTarget) { ringColor = '#f59e0b'; ringAnim = 'animate-pulse'; }
  else if (isHealTarget || isMarkTarget) { ringColor = '#34d399'; ringAnim = 'animate-pulse'; }
  else if (isObstructed) { ringColor = 'rgba(239,68,68,0.3)'; }

  // Barra de HP cor
  const hpColor = hpPercent > 60 ? '#22c55e' : hpPercent > 30 ? '#eab308' : '#ef4444';

  // Stance indicator
  const stanceIcon = unit.stance === 'guard' ? '🛡' : unit.stance === 'prone' ? '⬇' : null;

  // Silent Run: AI status badge
  const aiBadge = unit.alertStatus === 'alert' ? '!' : unit.alertStatus === 'investigating' ? '?' : unit.alertStatus === 'dormant' ? 'Zzz' : null;
  const aiBadgeColor = unit.alertStatus === 'alert' ? '#ef4444' : unit.alertStatus === 'investigating' ? '#f59e0b' : '#3b82f6';

  // Círculo de movimento (apenas selecionado, sem targetMode)
  const armorPenal = unit.armorName ? (ARMORS[unit.armorName]?.movePenal || 0) : 0;
  const baseMove = Math.max(0, (unitClassInfo?.movement ?? SCALE.MOVIMENTO_BASE) - armorPenal);
  const remainingMove = Math.max(0, baseMove + (unit.extraMoveMeters || 0) - (unit.movedThisTurn || 0));
  const moveRadiusPx = (remainingMove / METERS_PER_CELL) * CELL_SIZE;

  return (
    <div
      onClick={(e) => onClick(e, unit)}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-200 select-none',
        isClickable && 'cursor-pointer hover:scale-110',
        !isClickable && 'cursor-default',
        isSelected && 'z-30 scale-110',
        isObstructed && 'opacity-50',
      )}
      style={{ left: unit.x, top: unit.y, width: TOKEN_SIZE, height: TOKEN_SIZE }}
    >
      {/* Hit Rate Badge (acima da HP bar, modo tiro) */}
      {(isValidShootTarget || isMarkedTarget) && (() => {
        const hasValue = pendingHitRate !== undefined;
        const badgeColor = hasValue
          ? pendingHitRate! > 50 ? '#22c55e' : pendingHitRate! > 30 ? '#eab308' : '#ef4444'
          : '#6b7280';
        return (
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-50"
            style={{ top: -(Math.round(CELL_SIZE * 0.52)) }}
          >
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-black whitespace-nowrap shadow-lg"
              style={{
                background: 'rgba(0,0,0,0.88)',
                border: `1px solid ${badgeColor}`,
                color: badgeColor,
                boxShadow: `0 0 6px ${badgeColor}50`,
              }}
            >
              {hasValue ? `${pendingHitRate!}%` : '?'}
            </div>
          </div>
        );
      })()}

      {/* AI Status Badge (Silent Run) */}
      {aiBadge && (
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 pointer-events-none z-50 flex items-center justify-center rounded-full animate-bounce",
            unit.alertStatus === "alert" && "animate-pulse"
          )}
          style={{ 
            top: -(Math.round(CELL_SIZE * 0.85)),
            width: 24, height: 24,
            background: 'rgba(0,0,0,0.85)',
            border: `2px solid ${aiBadgeColor}`,
            boxShadow: `0 0 10px ${aiBadgeColor}`,
          }}
        >
          <span className="text-xs font-black" style={{ color: aiBadgeColor }}>{aiBadge}</span>
        </div>
      )}

      {/* HP Bar (above token) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
        style={{ top: -(Math.round(CELL_SIZE * 0.22)), width: HP_BAR_W }}
      >
        <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${hpPercent}%`, background: hpColor, boxShadow: `0 0 4px ${hpColor}` }}
          />
        </div>
      </div>

      {/* Outer ring (selection / target indicator) */}
      {ringColor !== 'transparent' && (
        <div
          className={cn('absolute inset-0 rounded-full pointer-events-none', ringAnim)}
          style={{
            border: `2px solid ${ringColor}`,
            boxShadow: `0 0 12px ${ringColor}, 0 0 24px ${ringColor}40`,
            transform: 'scale(1.18)',
          }}
        />
      )}

      {/* Main token circle */}
      <div
        className="w-full h-full rounded-full flex items-center justify-center relative overflow-hidden"
        style={{
          border: `2px solid ${teamBorder}`,
          background: teamColor,
          boxShadow: isSelected
            ? `0 0 0 2px rgba(255,255,255,0.8), 0 0 20px ${teamGlow}, inset 0 0 12px rgba(0,0,0,0.5)`
            : `0 2px 8px rgba(0,0,0,0.6), inset 0 0 10px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Role image */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt={unit.className}
            className="absolute inset-0 w-full h-full object-cover rounded-full"
            style={{ filter: isObstructed ? 'grayscale(100%)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* Fallback label if no image */}
        {!imageUrl && (
          <div className="text-[9px] font-black text-white tracking-tighter drop-shadow z-10">
            {(unitClassInfo?.name ?? unit.className).substring(0, 3).toUpperCase()}
          </div>
        )}

        {/* Obstructed overlay */}
        {isObstructed && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-full">
            <span style={{ fontSize: TOKEN_SIZE * 0.4 }}>🚫</span>
          </div>
        )}
      </div>

      {/* Stance badge (bottom-right corner) */}
      {stanceIcon && (
        <div
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full z-20 pointer-events-none"
          style={{
            width: Math.round(TOKEN_SIZE * 0.32),
            height: Math.round(TOKEN_SIZE * 0.32),
            fontSize: Math.round(TOKEN_SIZE * 0.22),
            background: 'rgba(0,0,0,0.75)',
            border: `1px solid ${teamBorder}`,
          }}
        >
          {stanceIcon}
        </div>
      )}

      {/* Movement radius indicator (when selected and idle) */}
      {isSelected && !targetMode && moveRadiusPx > 0 && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            width: moveRadiusPx * 2,
            height: moveRadiusPx * 2,
            border: '2px dashed rgba(34,197,94,0.5)',
            background: 'rgba(34,197,94,0.03)',
          }}
        />
      )}
    </div>
  );
};
