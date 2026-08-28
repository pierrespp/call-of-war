import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

export interface VfxTriggerShotOptions {
  from: { x: number; y: number }; // Pixel world coords
  to: { x: number; y: number };   // Pixel world coords
  outcome?: 'hit' | 'crit' | 'blocked' | 'miss';
  role?: string;                  // 'sniper' | 'assalto' | 'granadeiro' | 'suporte' | 'medico'
  damage?: number;
}

export interface VfxTriggerExplosionOptions {
  x: number;                      // Pixel world coords
  y: number;                      // Pixel world coords
  radiusPx?: number;
}

export interface CombatVfxCanvasRef {
  triggerShot: (options: VfxTriggerShotOptions) => void;
  triggerExplosion: (options: VfxTriggerExplosionOptions) => void;
}

interface Props {
  width: number;
  height: number;
}

// Particle & Tracer definitions
interface Tracer {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  speed: number;
  progress: number;
  color: string;
  glowColor: string;
  tailLength: number;
  outcome: 'hit' | 'crit' | 'blocked' | 'miss';
  role?: string;
  damage?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  size: number;
  color: string;
  glowColor?: string;
  glowSize?: number;
  type: 'spark' | 'blood' | 'smoke' | 'shockwave' | 'debris' | 'flash';
  maxSize?: number;
  gravity?: number;
}

export const CombatVfxCanvas = forwardRef<CombatVfxCanvasRef, Props>(({ width, height }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracersRef = useRef<Tracer[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameIdRef = useRef<number | null>(null);

  const spawnMuzzleFlash = (x: number, y: number, angle: number, role?: string) => {
    // Clarão central
    particlesRef.current.push({
      x,
      y,
      vx: 0,
      vy: 0,
      alpha: 1.0,
      decay: 0.15,
      size: role === 'sniper' ? 24 : 16,
      color: role === 'sniper' ? '#a5f3fc' : '#fef08a',
      glowColor: role === 'sniper' ? '#06b6d4' : '#f59e0b',
      glowSize: 18,
      type: 'flash',
    });

    // Fumaça sutil na boca do cano
    const count = 3;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const speed = 1 + Math.random() * 2;
      particlesRef.current.push({
        x: x + Math.cos(angle) * 8,
        y: y + Math.sin(angle) * 8,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        alpha: 0.6,
        decay: 0.04,
        size: 4 + Math.random() * 4,
        color: 'rgba(180, 180, 180, 0.4)',
        type: 'smoke',
      });
    }
  };

  const spawnImpact = (x: number, y: number, angle: number, outcome: 'hit' | 'crit' | 'blocked' | 'miss') => {
    if (outcome === 'hit' || outcome === 'crit') {
      // Blood splatter & hit flash
      const particleCount = outcome === 'crit' ? 22 : 12;

      // Hit Flash
      particlesRef.current.push({
        x,
        y,
        vx: 0,
        vy: 0,
        alpha: outcome === 'crit' ? 1.0 : 0.8,
        decay: 0.12,
        size: outcome === 'crit' ? 30 : 18,
        color: outcome === 'crit' ? '#ffffff' : '#fecaca',
        glowColor: outcome === 'crit' ? '#ef4444' : '#dc2626',
        glowSize: outcome === 'crit' ? 25 : 12,
        type: 'flash',
      });

      for (let i = 0; i < particleCount; i++) {
        const spread = (Math.random() - 0.5) * Math.PI * 0.8;
        const impactAngle = angle + Math.PI + spread; // Rebate para trás do alvo
        const speed = (2 + Math.random() * 5) * (outcome === 'crit' ? 1.4 : 1.0);

        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(impactAngle) * speed,
          vy: Math.sin(impactAngle) * speed,
          alpha: 1.0,
          decay: 0.03 + Math.random() * 0.03,
          size: 2.5 + Math.random() * 3,
          color: Math.random() > 0.3 ? '#b91c1c' : '#7f1d1d',
          glowColor: '#ef4444',
          glowSize: outcome === 'crit' ? 6 : 0,
          gravity: 0.1,
          type: 'blood',
        });
      }
    } else if (outcome === 'blocked') {
      // Armor sparks (faíscas metálicas)
      const sparkCount = 14;
      for (let i = 0; i < sparkCount; i++) {
        const spread = (Math.random() - 0.5) * Math.PI;
        const sparkAngle = angle + Math.PI + spread;
        const speed = 3 + Math.random() * 7;

        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(sparkAngle) * speed,
          vy: Math.sin(sparkAngle) * speed,
          alpha: 1.0,
          decay: 0.06 + Math.random() * 0.05,
          size: 2 + Math.random() * 2,
          color: Math.random() > 0.4 ? '#fef08a' : '#ffffff',
          glowColor: '#f59e0b',
          glowSize: 8,
          type: 'spark',
        });
      }
    } else {
      // Miss: poeira de terra/concreto
      const dustCount = 8;
      for (let i = 0; i < dustCount; i++) {
        const speed = 1 + Math.random() * 3;
        const dir = Math.random() * Math.PI * 2;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(dir) * speed,
          vy: Math.sin(dir) * speed,
          alpha: 0.7,
          decay: 0.04 + Math.random() * 0.03,
          size: 4 + Math.random() * 6,
          color: 'rgba(160, 145, 125, 0.6)',
          type: 'smoke',
        });
      }
    }
  };

  const triggerShot = (options: VfxTriggerShotOptions) => {
    const { from, to, outcome = 'hit', role = 'assalto', damage } = options;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;

    const angle = Math.atan2(dy, dx);
    spawnMuzzleFlash(from.x, from.y, angle, role);

    // Cores específicas por papel
    let color = '#fbbf24';
    let glowColor = '#f59e0b';
    let speed = 40;

    if (role === 'sniper') {
      color = '#e0f2fe';
      glowColor = '#06b6d4';
      speed = 65;
    } else if (role === 'granadeiro') {
      color = '#fed7aa';
      glowColor = '#ea580c';
      speed = 30;
    } else if (role === 'suporte') {
      color = '#fef08a';
      glowColor = '#eab308';
      speed = 45;
    }

    tracersRef.current.push({
      x: from.x,
      y: from.y,
      startX: from.x,
      startY: from.y,
      targetX: to.x,
      targetY: to.y,
      speed,
      progress: 0,
      color,
      glowColor,
      tailLength: role === 'sniper' ? 45 : 25,
      outcome,
      role,
      damage,
    });
  };

  const triggerExplosion = (options: VfxTriggerExplosionOptions) => {
    const { x, y, radiusPx = 80 } = options;

    // 1. Shockwave radial
    particlesRef.current.push({
      x,
      y,
      vx: 0,
      vy: 0,
      alpha: 1.0,
      decay: 0.05,
      size: 10,
      maxSize: radiusPx * 1.3,
      color: 'rgba(255, 200, 100, 0.8)',
      glowColor: '#ea580c',
      glowSize: 20,
      type: 'shockwave',
    });

    // 2. Flash estroboscópico de explosão
    particlesRef.current.push({
      x,
      y,
      vx: 0,
      vy: 0,
      alpha: 1.0,
      decay: 0.1,
      size: radiusPx * 0.8,
      color: '#ffffff',
      glowColor: '#f97316',
      glowSize: 40,
      type: 'flash',
    });

    // 3. Faíscas incandescentes
    const sparkCount = 35;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.04,
        size: 3 + Math.random() * 3,
        color: Math.random() > 0.3 ? '#fbbf24' : '#ef4444',
        glowColor: '#f97316',
        glowSize: 10,
        type: 'spark',
      });
    }

    // 4. Nuvens de fumaça cinza-escura
    const smokeCount = 18;
    for (let i = 0; i < smokeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 0.8,
        decay: 0.02 + Math.random() * 0.02,
        size: 15 + Math.random() * 18,
        color: 'rgba(50, 45, 45, 0.7)',
        type: 'smoke',
      });
    }
  };

  useImperativeHandle(ref, () => ({
    triggerShot,
    triggerExplosion,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const renderLoop = () => {
      if (!isRunning) return;

      ctx.clearRect(0, 0, width, height);

      // 1. Renderizar e atualizar Tracers (Projéteis com Glow)
      const remainingTracers: Tracer[] = [];

      for (let i = 0; i < tracersRef.current.length; i++) {
        const tracer = tracersRef.current[i];
        const totalDist = Math.hypot(tracer.targetX - tracer.startX, tracer.targetY - tracer.startY);
        const dirX = (tracer.targetX - tracer.startX) / totalDist;
        const dirY = (tracer.targetY - tracer.startY) / totalDist;

        tracer.progress += tracer.speed;

        if (tracer.progress >= totalDist) {
          // Chegou no alvo! Disparar efeito de impacto
          const angle = Math.atan2(dirY, dirX);
          spawnImpact(tracer.targetX, tracer.targetY, angle, tracer.outcome);
          continue; // Não adiciona aos remainingTracers
        }

        const headX = tracer.startX + dirX * tracer.progress;
        const headY = tracer.startY + dirY * tracer.progress;
        const tailDist = Math.max(0, tracer.progress - tracer.tailLength);
        const tailX = tracer.startX + dirX * tailDist;
        const tailY = tracer.startY + dirY * tailDist;

        ctx.save();
        ctx.lineCap = 'round';

        // Glow Layer
        ctx.shadowColor = tracer.glowColor;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = tracer.color;
        ctx.lineWidth = tracer.role === 'sniper' ? 3.5 : 2.5;

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        // Core white streak
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = tracer.role === 'sniper' ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        ctx.restore();

        remainingTracers.push(tracer);
      }
      tracersRef.current = remainingTracers;

      // 2. Renderizar e atualizar Partículas (Sparks, Blood, Smoke, Flash, Shockwave)
      const remainingParticles: Particle[] = [];

      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];

        p.x += p.vx;
        p.y += p.vy;
        if (p.gravity) p.vy += p.gravity;
        p.alpha -= p.decay;

        if (p.alpha <= 0) continue;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));

        if (p.glowColor && p.glowSize) {
          ctx.shadowColor = p.glowColor;
          ctx.shadowBlur = p.glowSize;
        }

        if (p.type === 'shockwave') {
          p.size += ((p.maxSize || 50) - p.size) * 0.15;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.type === 'flash') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'blood') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'spark') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          // Linha de rastro da faísca
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
          ctx.stroke();
        } else if (p.type === 'smoke') {
          p.size += 0.3; // Expansão gradual da fumaça
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
        remainingParticles.push(p);
      }
      particlesRef.current = remainingParticles;

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 35 }}
    />
  );
});

CombatVfxCanvas.displayName = 'CombatVfxCanvas';
