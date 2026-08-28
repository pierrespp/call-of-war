import React from 'react';
import { CELL_SIZE } from '@/src/core/data/constants';
import { CoverType } from '@/src/types/game';

interface ShootLineOverlayProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  coverLevel: CoverType | 'none';
  contributingHalfCells: string[];
  contributingFullCells: string[];
}

/**
 * Linha SVG de tiro com highlight das células de cobertura que afetam o disparo.
 * Coloração da linha: verde (sem cobertura), amarelo (meia), vermelho (total).
 */
export const ShootLineOverlay: React.FC<ShootLineOverlayProps> = ({
  sourceX, sourceY, targetX, targetY,
  coverLevel, contributingHalfCells, contributingFullCells,
}) => {
  const lineColor =
    coverLevel === 'full' ? 'rgba(239,68,68,0.85)' :
    coverLevel === 'half' ? 'rgba(234,179,8,0.85)' :
    'rgba(34,197,94,0.85)';

  const glowColor =
    coverLevel === 'full' ? 'rgba(239,68,68,0.3)' :
    coverLevel === 'half' ? 'rgba(234,179,8,0.3)' :
    'rgba(34,197,94,0.3)';

  return (
    <>
      {/* Highlight de células de meia-cobertura (laranja) */}
      {contributingHalfCells.map((key) => {
        const [gx, gy] = key.split(',').map(Number);
        return (
          <div
            key={`half-${key}`}
            className="absolute pointer-events-none z-10 animate-pulse"
            style={{
              left: gx * CELL_SIZE, top: gy * CELL_SIZE,
              width: CELL_SIZE, height: CELL_SIZE,
              border: '2px solid rgba(251,146,60,0.9)',
              background: 'rgba(251,146,60,0.25)',
              borderRadius: 2,
              boxShadow: 'inset 0 0 8px rgba(251,146,60,0.4)',
            }}
          />
        );
      })}

      {/* Highlight de células de cobertura total (vermelho) */}
      {contributingFullCells.map((key) => {
        const [gx, gy] = key.split(',').map(Number);
        return (
          <div
            key={`full-${key}`}
            className="absolute pointer-events-none z-10 animate-pulse"
            style={{
              left: gx * CELL_SIZE, top: gy * CELL_SIZE,
              width: CELL_SIZE, height: CELL_SIZE,
              border: '2px solid rgba(239,68,68,0.9)',
              background: 'rgba(239,68,68,0.25)',
              borderRadius: 2,
              boxShadow: 'inset 0 0 8px rgba(239,68,68,0.4)',
            }}
          />
        );
      })}

      {/* Linha SVG principal */}
      <svg
        className="absolute inset-0 pointer-events-none z-20"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        <defs>
          <filter id="shoot-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Glow layer (mais espessa, desfocada) */}
        <line
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
          stroke={glowColor}
          strokeWidth={8}
          filter="url(#shoot-glow)"
          strokeLinecap="round"
        />

        {/* Linha principal tracejada */}
        <line
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
          stroke={lineColor}
          strokeWidth={2.5}
          strokeDasharray="8 4"
          strokeLinecap="round"
          className="animate-pulse"
        />

        {/* Ponto de origem */}
        <circle cx={sourceX} cy={sourceY} r={5} fill={lineColor} opacity={0.9} />
        {/* Ponto de destino (alvo) */}
        <circle cx={targetX} cy={targetY} r={7} fill="none" stroke={lineColor} strokeWidth={2} className="animate-pulse" />
        <circle cx={targetX} cy={targetY} r={3} fill={lineColor} opacity={0.9} />
      </svg>
    </>
  );
};
