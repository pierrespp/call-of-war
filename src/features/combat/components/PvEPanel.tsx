import React, { useState } from 'react';
import { X, Skull, Zap, Activity, Plus } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface PvEConfig {
  spawnInterval: number;
  maxZombies: number;
  difficultyPoints: number;
  pointsPerTurn: number;
}

interface PvEPanelProps {
  config: PvEConfig;
  onSpawnZombie: (type: string, x: number, y: number) => void;
  onUpdateConfig: (config: PvEConfig) => void;
  onClose: () => void;
}

export function PvEPanel({ config, onSpawnZombie, onUpdateConfig, onClose }: PvEPanelProps) {
  const [selectedType, setSelectedType] = useState('common');

  const zombieTypes = [
    { id: 'common', label: 'Comum', icon: <Skull size={14} />, color: 'text-neutral-400' },
    { id: 'runner', label: 'Corredor', icon: <Zap size={14} />, color: 'text-yellow-400' },
    { id: 'tank', label: 'Brutamontes', icon: <Activity size={14} />, color: 'text-red-400' },
  ];

  return (
    <div className="w-72 bg-neutral-900/90 backdrop-blur-xl border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="bg-red-950/40 px-4 py-3 border-b border-red-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skull className="text-red-500" size={18} />
          <span className="text-xs font-black uppercase tracking-tighter text-red-100">Comando de Horda</span>
        </div>
        <button onClick={onClose} className="text-red-400/50 hover:text-red-400 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Difficulty Status */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/40 p-2 rounded-lg border border-white/5">
            <div className="text-[9px] uppercase text-neutral-500 font-bold">Pontos (DP)</div>
            <div className="text-lg font-black text-red-500">{config.difficultyPoints}</div>
          </div>
          <div className="bg-black/40 p-2 rounded-lg border border-white/5">
            <div className="text-[9px] uppercase text-neutral-500 font-bold">Geração/Turno</div>
            <div className="text-lg font-black text-neutral-200">+{config.pointsPerTurn}</div>
          </div>
        </div>

        {/* Manual Spawn */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase text-neutral-400 font-black tracking-widest px-1">Spawn Manual</div>
          <div className="grid grid-cols-3 gap-1.5">
            {zombieTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all text-[10px] font-bold",
                  selectedType === t.id 
                    ? "bg-red-500/10 border-red-500/40 text-red-400 shadow-lg shadow-red-500/10" 
                    : "bg-white/5 border-white/5 text-neutral-500 hover:bg-white/10"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onSpawnZombie(selectedType, 1000, 1000)}
            className="w-full mt-2 bg-red-600 hover:bg-red-500 text-white font-black py-2.5 rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 text-xs uppercase"
          >
            <Plus size={14} /> Spawn no Centro
          </button>
        </div>

        {/* Auto Config */}
        <div className="space-y-3 pt-2 border-t border-white/5">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] uppercase text-neutral-400 font-black">Limite da Horda</span>
            <span className="text-xs font-mono text-neutral-200">{config.maxZombies}</span>
          </div>
          <input 
            type="range" 
            min="5" max="100" step="5"
            value={config.maxZombies}
            onChange={(e) => onUpdateConfig({ ...config, maxZombies: parseInt(e.target.value) })}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-red-600"
          />
        </div>
      </div>

      {/* Footer hint */}
      <div className="bg-black/20 px-4 py-2 text-[8px] text-neutral-600 font-mono italic">
        * Zumbis agem automaticamente no turno B.
      </div>
    </div>
  );
}
