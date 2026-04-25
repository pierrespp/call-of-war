import React, { useState } from "react";
import { CLASSES, WEAPONS, ARMORS, SKILLS, ATTACHMENTS } from "../data/constants";
import { Search, Shield, Crosshair, Cpu, Award } from "lucide-react";

export function SoldiersInfoMenu({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex justify-between items-center bg-neutral-800 p-6 rounded-2xl border border-neutral-700">
          <div>
            <h1 className="text-3xl font-black text-white">Manual Militar do Comando</h1>
            <p className="text-neutral-400 mt-1">Conheça as especificações técnicas, blindagens e arsenais.</p>
          </div>
          <button onClick={onBack} className="bg-neutral-700 hover:bg-neutral-600 px-6 py-2 rounded-lg font-bold transition-colors">
            Voltar ao Menu
          </button>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2"><Award className="text-indigo-400"/> Classes de Soldados</h2>
          
          <div className="space-y-8">
            {['USA', 'TR'].map(faction => (
               <div key={faction}>
                 <h3 className="text-lg font-bold text-neutral-300 mb-4 border-b border-neutral-700 pb-2">{faction === 'USA' ? 'Forças Americanas (USA)' : 'Terroristas (TR)'}</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.values(CLASSES).filter(c => c.faction === faction).map(c => (
                    <div key={c.id} className="bg-neutral-800 border border-neutral-700 p-4 rounded-xl flex gap-4">
                      <div className="w-16 h-16 bg-neutral-900 rounded-lg flex items-center justify-center shrink-0 border border-neutral-700 bg-cover bg-center" style={{ backgroundImage: `url('./roles/${c.name.toLowerCase()}.png')` }}>
                         {!['assalto', 'suporte', 'médico', 'granadeiro', 'sniper'].includes(c.name.toLowerCase()) && (
                            <span className="font-bold text-neutral-600 text-xl">{c.name.substring(0, 2).toUpperCase()}</span>
                         )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-white text-lg leading-tight">{c.name}</h4>
                          <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-bold">{c.points} Pts</span>
                        </div>
                        <div className="text-sm text-neutral-400 grid grid-cols-2 gap-x-2">
                          <p>HP: <span className="text-green-400 font-bold">{c.hp}</span></p>
                          <p>Mov: <span className="text-blue-400 font-bold">{c.movement}</span></p>
                          <p>Hit: <span className="text-yellow-400 font-bold">{c.hit}%</span></p>
                          <p>Crit: <span className="text-red-400 font-bold">{c.critical}%</span></p>
                        </div>
                      </div>
                    </div>
                  ))}
                 </div>
               </div>
            ))}
          </div>

          <h2 className="text-xl font-bold flex items-center gap-2 mt-8"><Crosshair className="text-red-400"/> Arsenal de Armas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(WEAPONS).map(w => (
              <div key={w.name} className="bg-neutral-800 border border-neutral-700 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-white text-lg">{w.name}</h3>
                  <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-xs font-bold">{w.points} Pts</span>
                </div>
                <p className="text-xs text-neutral-500 uppercase font-bold mb-2 tracking-wider">{w.weaponClass} · {w.weaponFaction}</p>
                <p className="text-[10px] text-neutral-600 mb-2">{w.allowedClasses.length === 0 ? "Todas as classes" : w.allowedClasses.join(", ")}</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-neutral-400">
                  <p>Dano: <span className="text-red-400 font-bold">{w.damage}</span></p>
                  <p>Crítico: <span className="text-orange-400 font-bold">{w.critical} ({w.criticalChance}%)</span></p>
                  <p>Alcance: <span className="text-blue-400 font-bold">{w.range}</span></p>
                  <p>Tiros/turno: <span className="text-white font-bold">{w.shots}</span></p>
                  <p>Carregador: <span className="text-white font-bold">{w.reload}</span></p>
                </div>
              </div>
            ))}
          </div>

          <h2 className="text-xl font-bold flex items-center gap-2 mt-8"><Shield className="text-emerald-400"/> Blindagens e Coletes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(ARMORS).map(a => (
              <div key={a.name} className="bg-neutral-800 border border-neutral-700 p-4 rounded-xl flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-white text-lg">{a.name}</h3>
                  <div className="text-sm text-neutral-400 mt-1 flex gap-4">
                    <span>Redução: -{a.reduction} Dano</span>
                    <span>Slots: {a.slots}</span>
                    <span>Penalidade: -{a.movePenal}m</span>
                  </div>
                </div>
                <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-lg font-bold">{a.points} Pts</span>
              </div>
            ))}
          </div>

          <h2 className="text-xl font-bold flex items-center gap-2 mt-8"><Cpu className="text-cyan-400"/> Habilidades e Acessórios</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(SKILLS).map(s => (
              <div key={s.name} className="bg-indigo-900/20 border border-indigo-800 p-4 rounded-xl">
                 <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-indigo-300 text-lg">{s.name} <span className="text-xs text-indigo-500 ml-2 uppercase">Habilidade</span></h3>
                    <p className="text-xs font-bold text-neutral-500 mt-1">Exclusivo: {s.classRequired}</p>
                  </div>
                  <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-xs font-bold">{s.points} Pts</span>
                </div>
                <p className="text-sm text-neutral-300 mt-2">{s.description}</p>
              </div>
            ))}
            {Object.values(ATTACHMENTS).map(a => (
              <div key={a.name} className="bg-neutral-800 border border-neutral-700 p-4 rounded-xl">
                 <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-white text-lg">{a.name} <span className="text-xs text-neutral-500 ml-2 uppercase">Acessório</span></h3>
                  </div>
                  <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-xs font-bold">{a.points} Pts</span>
                </div>
                <p className="text-sm text-neutral-400 mt-2">{a.description}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
