import React, { useEffect, useRef, useState } from 'react';

export type ParticleType = 'spark' | 'blood' | 'flash' | 'smoke';

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0 to 1
  decay: number;
  type: ParticleType;
  color: string;
  size: number;
}

interface ParticleCanvasProps {
  width: number;
  height: number;
  particles: Particle[];
  onParticlesUpdate: (particles: Particle[]) => void;
}

export const ParticleCanvas: React.FC<ParticleCanvasProps> = ({ 
  width, 
  height, 
  particles, 
  onParticlesUpdate 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      
      if (particles.length > 0) {
        const nextParticles = particles
          .map(p => ({
            ...p,
            x: p.x + p.vx * deltaTime * 60,
            y: p.y + p.vy * deltaTime * 60,
            life: p.life - p.decay * deltaTime * 60,
          }))
          .filter(p => p.life > 0);

        onParticlesUpdate(nextParticles);
      }
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [particles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      
      if (p.type === 'flash') {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1 + (1 - p.life) * 2));
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - p.life) * 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [particles, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none z-[100]"
    />
  );
};
