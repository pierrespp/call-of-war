import { useEffect, useRef } from 'react';
import { apiService, RoomStateResponse } from '@/src/core/services/apiService';
import { GameState, Unit, MapCoverData, CoverType } from '@/src/types/game';
import { findPathToClosestReachable } from '@/src/features/combat/utils/pathfinding';
import { hasLineOfSight } from '@/src/features/combat/utils/lineOfSight';
import { CLASSES, ARMORS, CELL_SIZE } from '@/src/core/data/constants';

function getUnitAvailableMove(unit: Unit): number {
  const baseMove = CLASSES[unit.className]?.movement || 6;
  const penalty = unit.armorName ? (ARMORS[unit.armorName]?.movePenal || 0) : 0;
  return Math.max(0, baseMove - penalty + unit.extraMoveMeters - unit.movedThisTurn);
}

export function usePveEngine(
  roomState: RoomStateResponse | null,
  gameState: GameState | null,
  playerTeam: "A" | "B",
  playerToken: string | null,
  setRoomState: (state: RoomStateResponse) => void,
  setGameState: (state: GameState) => void,
) {
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!roomState || !gameState || !playerToken) return;
    
    // In PVE, logic usually runs on the host client (A)
    const isHost = playerTeam === "A";
    const isSandboxDebug = roomState.players.B?.name === roomState.players.A?.name;
    if (!isHost && !isSandboxDebug) return;
    
    if (roomState.phase !== "active") return;
    console.log("[PVE] Checking turn...", roomState.currentTurn, "GameMode:", roomState.draft.gameMode);
    if (roomState.draft.gameMode === "pvp") return;
    if (roomState.currentTurn !== "B") return;
    if (isRunningRef.current) return;
    
    console.log("[PVE] Bot turn started.");

    if (roomState.pendingGuardShots && roomState.pendingGuardShots.length > 0) {
        // AUTO-RESOLVE BOT GUARD SHOTS
        const botGuard = roomState.pendingGuardShots.find(p => p.guardTeam === "B");
        if (botGuard) {
            console.log("[PVE] Auto-resolving bot guard shot:", botGuard.id);
            apiService.resolveGuardShot(roomState.id, playerToken, botGuard.id, true, 0)
              .then(res => {
                  if (res.success) {
                      setGameState(res.gameState);
                  }
              })
              .catch(err => console.error("[PVE] Error resolving guard shot:", err));
        } else {
            console.log("[PVE] Waiting for Player Guard Shot resolution...");
        }
        return;
    }

    // Safety: If there's an interrupted move, wait for the server to auto-resume it after guard resolution
    if (roomState.interruptedMove) {
       console.log("[PVE] A move is interrupted, waiting for resolution...");
       return;
    }

    const bUnits = Object.values(gameState.units).filter(u => u.team === "B" && u.hp > 0);
    const hasUnactedUnits = bUnits.some(u => u.actions.move || u.actions.tactical);
    
    if (hasUnactedUnits) {
       isRunningRef.current = true;
       processBotTurn(roomState.id, playerToken, roomState, gameState)
         .then(newState => {
             if (newState) {
                 setGameState(newState.gameState);
             }
         })
         .catch(err => {
             console.error("[PVE] Error during bot turn:", err);
             // If we get a 400 that says "Início do caminho não coincide", we might need to skip this bot's move
             if (err instanceof Error && err.message.includes("não coincide")) {
                console.warn("[PVE] Unit mismatch, attempting to pass move action.");
                // We'll let the next effect cycle handle it or attempt to pass action later
             }
         })
         .finally(() => {
             isRunningRef.current = false;
         });
    } else {
       isRunningRef.current = true;
       console.log("[PVE] All units acted, ending turn B.");
       apiService.endTurn(roomState.id, playerToken)
         .then(res => {
             if (res.success) {
                 setGameState(res.gameState);
                 setRoomState({ ...roomState, currentTurn: res.currentTurn, gameState: res.gameState });
             }
         })
         .catch(err => console.error("[PVE] Error ending turn:", err))
         .finally(() => {
             setTimeout(() => {
                isRunningRef.current = false;
             }, 300);
         });
    }
  }, [roomState, gameState, playerTeam, playerToken, setRoomState, setGameState]);
}

async function processBotTurn(roomId: string, playerToken: string, roomState: RoomStateResponse, gameState: GameState): Promise<{ success: boolean; gameState: GameState } | null> {
  const bUnits = Object.values(gameState.units).filter(u => u.team === "B" && u.hp > 0);
  const aUnits = Object.values(gameState.units).filter(u => u.team === "A" && u.hp > 0);

  // Find a unit that isn't currently interrupted
  const unit = bUnits.find(u => (u.actions.move || u.actions.tactical) && roomState.interruptedMove?.unitId !== u.id);
  if (!unit) {
    console.log("[PVE] No unacted units found for Team B.");
    return null; 
  }
  console.log("[PVE] Processing bot unit:", unit.id, "BotType:", unit.botType);
  const coverData = await apiService.getMapCover(roomId, gameState.mapId).catch(() => ({}) as MapCoverData);

  if (unit.botType === 'zombie') {
     return await processZombieLogic(roomId, playerToken, unit, aUnits, gameState, coverData);
  } else if (unit.botType === 'tactical') {
     return await processTacticalLogic(roomId, playerToken, unit, aUnits, gameState, coverData);
  }
  return null;
}

const HALF_CELL = CELL_SIZE / 2;

async function processZombieLogic(roomId: string, playerToken: string, unit: Unit, targets: Unit[], gameState: GameState, coverData: MapCoverData) {
   if (targets.length === 0) return null;

   // 1. Silent Run: Dormant status (Zumbis que não viram ninguém ainda)
   if (unit.alertStatus === "dormant") {
      if (unit.actions.move) await apiService.passUnitAction(roomId, playerToken, unit.id, "move").catch(() => null);
      if (unit.actions.tactical) return await apiService.passUnitAction(roomId, playerToken, unit.id, "tactical").catch(() => null);
      return null;
   }

   if (unit.actions.move) {
      let closestTarget = targets[0];
      let minDistance = Infinity;

      // Se estiver investigando, o alvo é o local do som
      if (unit.alertStatus === "investigating" && unit.targetLocation) {
         minDistance = 100; // Fake distance to trigger move
      } else {
         for (const t of targets) {
            const dx = t.x - unit.x;
            const dy = t.y - unit.y;
            const d = Math.sqrt(dx*dx + dy*dy);
            if (d < minDistance) {
               minDistance = d;
               closestTarget = t;
            }
         }
      }
      
      const startG = { gx: Math.floor((unit.x + 0.1) / CELL_SIZE), gy: Math.floor((unit.y + 0.1) / CELL_SIZE) };
      const tgtG = (unit.alertStatus === "investigating" && unit.targetLocation) 
         ? { gx: unit.targetLocation.gx, gy: unit.targetLocation.gy }
         : { gx: Math.floor(closestTarget.x / CELL_SIZE), gy: Math.floor(closestTarget.y / CELL_SIZE) };

      const availableMove = getUnitAvailableMove(unit);
      
      // Use Charge (Investida) if current move budget isn't enough to reach attack range of any target
      if (unit.actions.intervention && !unit.actions.chargeUsed) {
          // Escala de Sensibilidade (O cheiro de sangue fica mais provocativo)
          const turn = gameState.turnNumber;
          let hpThreshold = 0;
          if (turn >= 10) {
             hpThreshold = Infinity; // Turno 10+: Zumbis ensandecidos, usam investida sempre que possível
          } else if (turn >= 7) {
             hpThreshold = 5; // Turno 7 ao 9: O cheiro leve os atrai (qualquer soldado com HP <= 5)
          } else {
             hpThreshold = 2; // Turno 1 ao 6: Só entram em frenesi se algum soldado estiver quase morto (HP <= 2)
          }

          // Checa se existe alguma unidade sobrevivente vulnerável que ative o gatilho do frenesi na horda
          const isBloodFrenzyActivated = targets.some(t => t.hp <= hpThreshold);

          if (isBloodFrenzyActivated) {
              const pathCheck = findPathToClosestReachable(startG, tgtG, coverData, availableMove, Object.values(gameState.units));
              
              // Se já está na distância corpo-a-corpo do alvo principal, não precisa investir
              let reachesTarget = minDistance <= 75; 
              
              if (!reachesTarget && pathCheck && pathCheck.length > 1) {
                  const lastPos = pathCheck[pathCheck.length - 1];
                  const lx = lastPos.gx * CELL_SIZE + HALF_CELL;
                  const ly = lastPos.gy * CELL_SIZE + HALF_CELL;
                  const dist = Math.sqrt(Math.pow(closestTarget.x - lx, 2) + Math.pow(closestTarget.y - ly, 2));
                  if (dist <= 75) reachesTarget = true;
              }

              if (!reachesTarget) {
                  const res = await apiService.chargeUnit(roomId, playerToken, unit.id).catch(() => null);
                  if (res) {
                      await new Promise(r => setTimeout(r, 400));
                      return res;
                  }
              }
          }
      }

      const path = findPathToClosestReachable(startG, tgtG, coverData, availableMove, Object.values(gameState.units));
      
      if (path && path.length > 1) {
          const res = await apiService.moveUnit(roomId, playerToken, unit.id, path).catch(() => null);
          await new Promise(r => setTimeout(r, 400)); 
          return res;
      }

      const res = await apiService.passUnitAction(roomId, playerToken, unit.id, 'move').catch(() => null);
      await new Promise(r => setTimeout(r, 100));
      return res;
   }

   if (unit.actions.tactical) {
      for (const t of targets) {
         const dx = t.x - unit.x;
         const dy = t.y - unit.y;
         const d = Math.sqrt(dx*dx + dy*dy);
         if (d <= 75) {
            const res = await apiService.shootUnit(roomId, playerToken, unit.id, t.id, 0).catch(() => null);
            if (res) {
               await new Promise(r => setTimeout(r, 600)); 
               return res;
            }
         }
      }
      
      const res = await apiService.passUnitAction(roomId, playerToken, unit.id, 'tactical').catch(() => null);
      await new Promise(r => setTimeout(r, 100));
      return res;
   }
   return null;
}

async function processTacticalLogic(roomId: string, playerToken: string, unit: Unit, targets: Unit[], gameState: GameState, coverData: MapCoverData) {
   if (unit.actions.intervention && (unit.activeWeaponSlot === 'secondary' ? unit.secondaryWeapon : unit.primaryWeapon) && (unit.activeWeaponSlot === 'secondary' ? unit.secondaryAmmoInMag : unit.primaryAmmoInMag) <= 0) {
      const res = await apiService.reloadUnit(roomId, playerToken, unit.id).catch(() => null);
      await new Promise(r => setTimeout(r, 400));
      return res;
   }

   if (unit.actions.tactical && (unit.activeWeaponSlot === 'secondary' ? unit.secondaryWeapon : unit.primaryWeapon) && (unit.activeWeaponSlot === 'secondary' ? unit.secondaryAmmoInMag : unit.primaryAmmoInMag) > 0) {
      for (const t of targets) {
         const ux = Math.floor(unit.x / CELL_SIZE);
         const uy = Math.floor(unit.y / CELL_SIZE);
         const tx = Math.floor(t.x / CELL_SIZE);
         const ty = Math.floor(t.y / CELL_SIZE);
         const hasLos = hasLineOfSight(ux, uy, tx, ty, coverData);
         if (hasLos) {
             const res = await apiService.shootUnit(roomId, playerToken, unit.id, t.id, 0).catch(() => null);
             await new Promise(r => setTimeout(r, 600));
             return res;
         }
      }
   }

   if (unit.actions.move) {
      if (targets.length > 0) {
          let closestTarget = targets[0];
          let minDistance = Infinity;
          for (const t of targets) {
             const dx = t.x - unit.x;
             const dy = t.y - unit.y;
             const d = Math.sqrt(dx*dx + dy*dy);
             if (d < minDistance) {
                minDistance = d;
                closestTarget = t;
             }
          }

          const startG = { gx: Math.floor((unit.x + 0.1) / CELL_SIZE), gy: Math.floor((unit.y + 0.1) / CELL_SIZE) };
          const tgtG = { gx: Math.floor(closestTarget.x / CELL_SIZE), gy: Math.floor(closestTarget.y / CELL_SIZE) };

          const availableMove = getUnitAvailableMove(unit);
          const path = findPathToClosestReachable(startG, tgtG, coverData, availableMove, Object.values(gameState.units));
          if (path && path.length > 1) {
              const res = await apiService.moveUnit(roomId, playerToken, unit.id, path).catch(() => null);
              await new Promise(r => setTimeout(r, 400));
              return res;
          }
      }
      
      const res = await apiService.passUnitAction(roomId, playerToken, unit.id, 'move').catch(() => null);
      await new Promise(r => setTimeout(r, 100));
      return res;
   }

   if (unit.actions.tactical) {
      const res = await apiService.passUnitAction(roomId, playerToken, unit.id, 'tactical').catch(() => null);
      await new Promise(r => setTimeout(r, 100));
      return res;
   }
   return null;
}
