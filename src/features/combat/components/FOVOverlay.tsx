import React from "react";
import { Unit } from '@/src/types/game';
import { CELL_SIZE, METERS_PER_CELL, SCALE } from '@/src/core/data/constants';

interface FOVOverlayProps {
  unit: Unit | null;
}

export const FOVOverlay: React.FC<FOVOverlayProps> = ({ unit }) => {
  if (!unit) return null;

  const radiusPx = (SCALE.RAIO_VISAO_BASE / METERS_PER_CELL) * CELL_SIZE; // ~40m in pixels
  const rotation = unit.rotation ?? 0;
  
  const cx = unit.x;
  const cy = unit.y;

  // Convert to radians for math
  const arcDeg = 90;
  const startAngle = (rotation - arcDeg / 2) * (Math.PI / 180);
  const endAngle = (rotation + arcDeg / 2) * (Math.PI / 180);

  // Determine path for 90 degree arc
  const startX = cx + radiusPx * Math.cos(startAngle);
  const startY = cy + radiusPx * Math.sin(startAngle);
  const endX = cx + radiusPx * Math.cos(endAngle);
  const endY = cy + radiusPx * Math.sin(endAngle);

  // If Sniper with Objetiva, we also add a narrow frontal +20m or infinite?
  // The rule: Limitado. SOMENTE o Sniper com habilidade específica (ex: Objetiva) vê além de 40m na frente (até o infinity / limite do mapa). We'll set a large radius.
  const isSniper = unit.className === "Sniper";
  const hasObjetiva = unit.attachments?.includes("Objetiva");
  
  let sniperPath = "";
  if (isSniper && hasObjetiva) {
    const longRadiusPx = (150 / METERS_PER_CELL) * CELL_SIZE; // 150m is a good "beyond 40m"
    const sNarrowStart = (rotation - 10) * (Math.PI / 180);
    const sNarrowEnd = (rotation + 10) * (Math.PI / 180);

    const nx1 = cx + longRadiusPx * Math.cos(sNarrowStart);
    const ny1 = cy + longRadiusPx * Math.sin(sNarrowStart);
    const nx2 = cx + longRadiusPx * Math.cos(sNarrowEnd);
    const ny2 = cy + longRadiusPx * Math.sin(sNarrowEnd);

    sniperPath = `M ${cx} ${cy} L ${nx1} ${ny1} A ${longRadiusPx} ${longRadiusPx} 0 0 1 ${nx2} ${ny2} Z`;
  }

  const arcPath = `M ${cx} ${cy} L ${startX} ${startY} A ${radiusPx} ${radiusPx} 0 0 1 ${endX} ${endY} Z`;
  const isGuarding = unit.stance === "guard";
  const color = unit.team === "A" 
    ? (isGuarding ? "rgba(37, 99, 235, 0.25)" : "rgba(37, 99, 235, 0.15)") 
    : (isGuarding ? "rgba(220, 38, 38, 0.25)" : "rgba(220, 38, 38, 0.15)");
    
  const strokeColor = unit.team === "A" ? "rgba(37, 99, 235, 0.6)" : "rgba(220, 38, 38, 0.6)";

  return (
    <svg className="absolute inset-0 pointer-events-none z-[8]" style={{ width: "100%", height: "100%", overflow: "visible" }}>
      <defs>
        <radialGradient id="fovGradientA" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 0.3)" />
          <stop offset="100%" stopColor="rgba(37, 99, 235, 0.05)" />
        </radialGradient>
        <radialGradient id="fovGradientB" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="rgba(220, 38, 38, 0.3)" />
          <stop offset="100%" stopColor="rgba(220, 38, 38, 0.05)" />
        </radialGradient>
        <filter id="glow-fov" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Base 40m 90° FOV */}
      <path 
        d={arcPath} 
        fill={unit.team === "A" ? "url(#fovGradientA)" : "url(#fovGradientB)"} 
        stroke={strokeColor} 
        strokeWidth={isGuarding ? "3" : "2"} 
        strokeDasharray={isGuarding ? "0" : "4 4"} 
        className={isGuarding ? "animate-pulse" : ""}
        style={isGuarding ? { filter: 'url(#glow-fov)' } : {}}
      />
      
      {/* Visual Indicator text for Guard */}
      {isGuarding && (
        <g>
          <text 
            x={cx} 
            y={cy - radiusPx - 15} 
            fill={strokeColor} 
            fontSize="10" 
            fontWeight="900" 
            textAnchor="middle" 
            className="uppercase tracking-[0.2em]"
            style={{ textShadow: "0 0 8px rgba(0,0,0,0.8)" }}
          >
            Sinal de Alerta // Vigilância Ativa
          </text>
        </g>
      )}
      
      {/* Extended Frontal FOV for Sniper + Objetiva */}
      {isSniper && hasObjetiva && (
        <path 
          d={sniperPath} 
          fill={unit.team === "A" ? "url(#fovGradientA)" : "url(#fovGradientB)"} 
          stroke={strokeColor} 
          strokeWidth="1" 
          strokeDasharray="2 2" 
          opacity="0.6"
        />
      )}
    </svg>
  );
};
