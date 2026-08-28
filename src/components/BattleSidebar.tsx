import React from 'react';
import {
  Crosshair, Move, Shield, Heart, Activity,
  RotateCcw, RotateCw, Zap, Eye, Ghost, Bomb,
  Database, Target, ChevronRight, AlertCircle, LogOut,
} from 'lucide-react';
import { Unit, LogEntry } from '@/src/types/game';
import { WEAPONS, ARMORS, CLASSES } from '@/src/core/data/constants';
import { cn } from '@/src/lib/utils';

export interface BattleSidebarProps {
  selectedUnit: Unit | null;
  playerTeam: 'A' | 'B';
  currentTurn: 'A' | 'B';
  logs: LogEntry[];
  targetMode: 'move' | 'shoot' | 'mark' | 'grenade' | 'heal' | 'suppress' | 'smoke' | null;
  pendingGuardCount: number;
  actionError: string | null;
  onMove: () => void;
  onShoot: () => void;
  onRotate?: () => void;
  onReload: () => void;
  onGuard: () => void;
  onToggleProne: () => void;
  onHeal: () => void;
  onGrenade: () => void;
  onSmoke: () => void;
  onSuppress: () => void;
  onHailOfBullets: () => void;
  onCharge: () => void;
  onMarkTarget: () => void;
  onEndTurn: () => void;
  onDeselect: () => void;
  onLeave: () => void;
  moveSubMode?: 'auto' | 'manual';
  onToggleMoveMode?: (mode: 'auto' | 'manual') => void;
}

// ─── Botão de Ação ──────────────────────────────────────────────────────────
function ActionButton({
  id, icon, label, onClick, disabled, active, color = 'neutral',
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  color?: 'blue' | 'red' | 'green' | 'yellow' | 'neutral';
}) {
  const colorMap = {
    blue: 'border-blue-500/40 hover:bg-blue-500/10 text-blue-400',
    red: 'border-red-500/40 hover:bg-red-500/10 text-red-400',
    green: 'border-green-500/40 hover:bg-green-500/10 text-green-400',
    yellow: 'border-yellow-500/40 hover:bg-yellow-500/10 text-yellow-400',
    neutral: 'border-white/10 hover:bg-white/5 text-neutral-300',
  };

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all duration-200',
        colorMap[color],
        active && 'ring-2 ring-offset-1 ring-offset-black ring-current bg-white/10',
        disabled && 'opacity-25 cursor-not-allowed pointer-events-none',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─── Componente Principal ───────────────────────────────────────────────────
export function BattleSidebar({
  selectedUnit,
  playerTeam,
  currentTurn,
  logs,
  targetMode,
  pendingGuardCount,
  actionError,
  onMove, onShoot, onReload, onGuard, onToggleProne,
  onHeal, onGrenade, onSmoke, onSuppress, onHailOfBullets,
  onCharge, onMarkTarget, onEndTurn, onDeselect, onLeave, onRotate,
  moveSubMode = 'auto', onToggleMoveMode,
}: BattleSidebarProps) {
  const isMyTurn = currentTurn === playerTeam;
  const isMyUnit = selectedUnit ? selectedUnit.team === playerTeam : false;
  const canAct = isMyTurn && isMyUnit;

  // ── Dados da arma ativa ─────────────────────────────────────────────────
  const activeWeaponKey = selectedUnit
    ? (selectedUnit.activeWeaponSlot === 'secondary'
        ? selectedUnit.secondaryWeapon
        : selectedUnit.primaryWeapon)
    : null;
  const activeWeapon = activeWeaponKey ? WEAPONS[activeWeaponKey] : null;
  const currentAmmo = selectedUnit
    ? (selectedUnit.activeWeaponSlot === 'secondary'
        ? selectedUnit.secondaryAmmoInMag
        : selectedUnit.primaryAmmoInMag)
    : 0;
  // CT-06: shotsLeft nunca negativo
  const shotsLeft = Math.max(0, (activeWeapon?.shots ?? 0) - (selectedUnit?.shotsThisTurn ?? 0));

  // ── Habilidades da unidade ──────────────────────────────────────────────
  const hasSkill = (skill: string) => selectedUnit?.skills.includes(skill) ?? false;
  const isSniper = selectedUnit?.className.includes('Sniper') ?? false;
  const isMedic = selectedUnit?.className.includes('Médico') ?? false;
  const isGranadeiro = selectedUnit?.className.includes('Granadeiro') ?? false;
  const hasSmokeGrenade = selectedUnit?.hasSmokeGrenade ?? false;
  const hasCharge = hasSkill('Linha de Frente') && !(selectedUnit?.actions.chargeUsed ?? true);
  const hasGrenade = selectedUnit?.attachments.some(a => a === 'Granada de Fragmentação') ?? false;

  // ── Dados de armadura ───────────────────────────────────────────────────
  const armor = selectedUnit?.armorName ? ARMORS[selectedUnit.armorName] : null;

  // ── Classe do jogador ───────────────────────────────────────────────────
  const unitClass = selectedUnit ? CLASSES[selectedUnit.className] : null;
  const maxHp = unitClass?.hp ?? 10;
  const hpRatio = selectedUnit ? Math.max(0, selectedUnit.hp) / maxHp : 0;
  const hpColor = hpRatio > 0.6 ? 'text-green-400' : hpRatio > 0.3 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="absolute top-0 right-0 h-full w-72 flex flex-col z-20 pointer-events-auto">
      {/* Painel principal com glassmorphism */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          background: 'rgba(10,10,15,0.88)',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* ── Header ── */}
        <div className="p-4 border-b border-white/5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.3em]">
                  Call of War
                </div>
                <div className={cn('text-xs font-black uppercase tracking-widest mt-0.5', isMyTurn ? 'text-green-400' : 'text-red-400')}>
                  {isMyTurn ? '● Seu Turno' : '● Aguardando...'}
                </div>
              </div>
              <button
                onClick={onLeave}
                title="Sair da Partida"
                className="p-1.5 rounded-lg text-neutral-600 hover:text-red-500 hover:bg-red-500/10 transition-all duration-200"
              >
                <LogOut size={14} />
              </button>
            </div>
            <button
              id="end-turn-btn"
              onClick={onEndTurn}
              disabled={!isMyTurn}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                isMyTurn
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-neutral-800 text-neutral-600 cursor-not-allowed',
              )}
            >
              Passar Turno
            </button>
          </div>
        </div>

        {/* ── Aviso de Tiros de Guarda ── */}
        {pendingGuardCount > 0 && (
          <div className="mx-3 mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-400 shrink-0" />
            <span className="text-[10px] font-bold text-amber-300">
              {pendingGuardCount} tiro{pendingGuardCount > 1 ? 's' : ''} de guarda pendente{pendingGuardCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* ── Erro de Ação ── */}
        {actionError && (
          <div className="mx-3 mt-2 bg-red-500/10 border border-red-500/30 rounded-xl p-2.5">
            <span className="text-[10px] text-red-400 font-bold">{actionError}</span>
          </div>
        )}

        {/* ── Unidade Selecionada ── */}
        {selectedUnit ? (
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">

            {/* Info da Unidade */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-sm font-black text-white leading-tight">{selectedUnit.name}</div>
                  <div className="text-[10px] text-neutral-500 font-mono mt-0.5">{selectedUnit.className}</div>
                </div>
                <div className={cn('text-xs font-black', hpColor)}>
                  {Math.max(0, selectedUnit.hp)} HP
                </div>
              </div>

              {/* Barra de HP */}
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hpRatio * 100}%`,
                    background: hpRatio > 0.6 ? '#22c55e' : hpRatio > 0.3 ? '#eab308' : '#ef4444',
                  }}
                />
              </div>

              {/* Stance */}
              <div className="flex gap-1.5">
                <span className={cn(
                  'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full',
                  selectedUnit.stance === 'guard' ? 'bg-amber-500/20 text-amber-400' :
                  selectedUnit.stance === 'prone' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-neutral-700/50 text-neutral-500',
                )}>
                  {selectedUnit.stance === 'guard' ? '🛡 Vigilância' :
                   selectedUnit.stance === 'prone' ? '⬇ Deitado' : '⬆ Em Pé'}
                </span>
              </div>
            </div>

            {/* Arma Ativa */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
              <div className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">
                {selectedUnit.activeWeaponSlot === 'secondary' ? '🔫 Arma Secundária' : '🔫 Arma Primária'}
              </div>
              <div className="font-bold text-white text-sm mb-2">
                {activeWeapon?.name ?? 'Sem Arma'}
              </div>

              {/* Dados Operacionais — CT-06 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/30 rounded-xl p-2">
                  <div className="text-[8px] font-black text-neutral-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Database size={8} className="text-amber-400" /> Munição
                  </div>
                  <div className="text-sm font-black text-white">
                    {Math.max(0, currentAmmo)}
                    <span className="text-neutral-600 text-[10px] ml-1">/ {activeWeapon?.reload ?? 0}</span>
                  </div>
                </div>
                <div className="bg-black/30 rounded-xl p-2">
                  <div className="text-[8px] font-black text-neutral-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Target size={8} className="text-red-400" /> Tiros
                  </div>
                  <div className="text-sm font-black text-white">
                    {shotsLeft}
                    <span className="text-neutral-600 text-[10px] ml-1">/ {activeWeapon?.shots ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Proteção */}
            {armor && (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
                <div className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Shield size={8} /> Proteção
                </div>
                <div className="text-xs font-bold text-white">
                  {armor.name}
                  <span className="text-neutral-500 ml-1.5 text-[10px]">-{armor.reduction} dano</span>
                </div>
              </div>
            )}

            {/* Comandos de Campo */}
            <div>
              <div className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">
                Comandos de Campo
              </div>
              <div className="grid grid-cols-3 gap-1.5">

                <div className="flex flex-col gap-1.5">
                <ActionButton
                  id="action-move"
                  icon={<Move size={20} />}
                  label="Mover"
                  onClick={onMove}
                  disabled={!canAct || (!selectedUnit?.actions.move && (selectedUnit?.extraMoveMeters || 0) <= (selectedUnit?.movedThisTurn || 0))}
                  active={targetMode === 'move'}
                  color="green"
                />
                {targetMode === 'move' && onToggleMoveMode && (
                  <div className="flex gap-1 px-1">
                    <button
                      onClick={() => onToggleMoveMode('auto')}
                      className={cn(
                        'flex-1 py-1 rounded text-[9px] font-bold uppercase transition-all',
                        moveSubMode === 'auto' ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-white/5 text-neutral-500 border border-transparent'
                      )}
                    >
                      Auto
                    </button>
                    <button
                      onClick={() => onToggleMoveMode('manual')}
                      className={cn(
                        'flex-1 py-1 rounded text-[9px] font-bold uppercase transition-all',
                        moveSubMode === 'manual' ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-white/5 text-neutral-500 border border-transparent'
                      )}
                    >
                      Manual
                    </button>
                  </div>
                )}
              </div>

              <ActionButton
                  id="action-shoot"
                  icon={<Crosshair size={14} />}
                  label="Atirar"
                  color="red"
                  onClick={onShoot}
                  // CT-02: desabilitado se sem munição
                  disabled={!canAct || !selectedUnit.actions.intervention || !activeWeapon || currentAmmo === 0}
                  active={targetMode === 'shoot'}
                />

                <ActionButton
                  id="action-rotate"
                  icon={<RotateCw size={14} />}
                  label="Girar"
                  color="blue"
                  onClick={onRotate}
                  disabled={!canAct || !selectedUnit.actions.tactical}
                />

                <ActionButton
                  id="action-reload"
                  icon={<RotateCcw size={14} />}
                  label="Recarregar"
                  color="yellow"
                  onClick={onReload}
                  disabled={!canAct || !selectedUnit.actions.intervention || !activeWeapon || currentAmmo >= (activeWeapon?.reload ?? 0)}
                />

                <ActionButton
                  id="action-guard"
                  icon={<Eye size={14} />}
                  label="Vigilância"
                  color="yellow"
                  onClick={onGuard}
                  disabled={!canAct || !selectedUnit.actions.intervention || selectedUnit.stance === 'guard'}
                />

                <ActionButton
                  id="action-prone"
                  icon={<Activity size={14} />}
                  label={selectedUnit.stance === 'prone' ? 'Levantar' : 'Deitar'}
                  color="blue"
                  onClick={onToggleProne}
                  disabled={!canAct || !selectedUnit.actions.tactical}
                />

                {hasCharge && (
                  <ActionButton
                    id="action-charge"
                    icon={<Zap size={14} />}
                    label="Investida"
                    color="yellow"
                    onClick={onCharge}
                    disabled={!canAct || !selectedUnit.actions.move}
                  />
                )}

                {isMedic && (
                  <ActionButton
                    id="action-heal"
                    icon={<Heart size={14} />}
                    label="Curar"
                    color="green"
                    onClick={onHeal}
                    disabled={!canAct || !selectedUnit.actions.intervention}
                    active={targetMode === 'heal'}
                  />
                )}

                {hasGrenade && (
                  <ActionButton
                    id="action-grenade"
                    icon={<Bomb size={14} />}
                    label="Granada"
                    color="red"
                    onClick={onGrenade}
                    disabled={!canAct || !selectedUnit.actions.intervention}
                    active={targetMode === 'grenade'}
                  />
                )}

                {hasSmokeGrenade && (
                  <ActionButton
                    id="action-smoke"
                    icon={<Ghost size={14} />}
                    label="Fumaça"
                    color="neutral"
                    onClick={onSmoke}
                    disabled={!canAct || !selectedUnit.actions.intervention || !selectedUnit.hasSmokeGrenade}
                    active={targetMode === 'smoke'}
                  />
                )}

                {hasSkill('Fogo Supressivo') && (
                  <ActionButton
                    id="action-suppress"
                    icon={<Zap size={14} />}
                    label="Supressão"
                    color="yellow"
                    onClick={onSuppress}
                    disabled={!canAct || !selectedUnit.actions.intervention || currentAmmo < 2}
                    active={targetMode === 'suppress'}
                  />
                )}

                {isSniper && hasSkill('Morte de Cima') && (
                  <ActionButton
                    id="action-mark"
                    icon={<Target size={14} />}
                    label="Marcar"
                    color="red"
                    onClick={onMarkTarget}
                    disabled={!canAct || !selectedUnit.actions.tactical}
                  />
                )}

              </div>
            </div>

          </div>
        ) : (
          /* Nenhuma unidade selecionada */
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-neutral-700 text-4xl">◎</div>
            <div className="text-[10px] text-neutral-600 font-mono uppercase tracking-widest">
              Clique em uma unidade para selecionar
            </div>
          </div>
        )}

        {/* ── Log de Combate ── */}
        <div className="border-t border-white/5 p-3">
          <div className="text-[8px] font-black text-neutral-600 uppercase tracking-widest mb-2">
            Log de Combate
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {logs.slice(-8).reverse().map((log) => (
              <div key={log.id} className="text-[9px] text-neutral-500 font-mono leading-tight">
                <ChevronRight size={8} className="inline mr-0.5 text-neutral-700" />
                {log.message}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-[9px] text-neutral-700 font-mono">Aguardando ações...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
