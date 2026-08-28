import { Room, Unit, CoverType } from "../../types/game";
import { MissionEngine } from "../types";
import { CLASSES, CELL_SIZE } from "../../core/data/constants";
import { normalizeAngle } from "../../utils/gameUtils";
import { hasLineOfSight, ShotCoverResult } from "../../features/combat/utils/cover";
import { randomUUID } from "crypto";

export const SilentRunMission: MissionEngine = {
  id: "silent_run",

  generateCover: () => {
    const cover: Record<string, CoverType> = {};
    const width = 40;
    const height = 80;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = `${x},${y}`;

        // ── Ponto de Início (Sul) e Extração (Norte) ──
        if (y >= height - 5) {
          if (x >= 15 && x <= 25) cover[key] = "deployA";
          else cover[key] = "none";
          continue;
        }
        if (y <= 5) {
          if (x >= 15 && x <= 25) cover[key] = "spawn_pve"; 
          else cover[key] = "none";
          continue;
        }

        // ── Avenida Central (Livre / Perigosa) ──
        const isAvenue = x >= 16 && x <= 23;
        if (isAvenue) {
          // Gerar alarmes em posições fixas na avenida
          if (y % 20 === 10 && x === 19) cover[key] = "car_alarm";
          else if (y % 25 === 5 && x === 21) cover[key] = "car_alarm";
          else if ((x + y) % 17 === 0) cover[key] = "half"; 
          continue;
        }

        // ── Labirinto de Becos e Prédios ──
        const isAlleyX = x % 6 === 0;
        const isAlleyY = y % 8 === 0;

        if (isAlleyX || isAlleyY) {
          // Becos: Entulho em pontos fixos de estrangulamento
          if ((x * y) % 13 === 0 && (x+y) % 3 === 0) cover[key] = "full"; 
          else if ((x + y) % 7 === 0) cover[key] = "half"; 
          
          // Pontos de spawn fixos nos becos
          if (x % 12 === 0 && y % 16 === 8) cover[key] = "spawn_pve";
        } else {
          // Áreas de Prédio: Padrão arquitetônico fixo
          // Paredes externas com aberturas pré-definidas
          const localX = x % 6;
          const localY = y % 8;

          if (localX === 1 && localY === 4) cover[key] = "window";
          else if (localX === 5 && localY === 2) cover[key] = "doorOpen";
          else if (localX === 3 && localY === 6) cover[key] = "window";
          else cover[key] = "wall";
        }
      }
    }
    return cover;
  },

  onTurnEnd: (room: Room) => {
    // 1. Turn 5 Bottleneck Event
    if (room.gameState.turnNumber === 5) {
      const coverNow = room.coverData[room.gameState.mapId] || {};
      for (let y = 20; y < 60; y += 10) {
        const barrierX = [15, 24];
        barrierX.forEach(x => {
          for (let dy = 0; dy < 3; dy++) {
            const key = `${x},${y + dy}`;
            const isOccupied = Object.values(room.gameState.units).some(
              u => Math.floor(u.x / 50) === x && Math.floor(u.y / 50) === (y + dy) && u.hp > 0
            );
            if (!isOccupied) coverNow[key] = "wall";
          }
        });
      }
      room.coverData[room.gameState.mapId] = coverNow;
    }

    // 2. Wake up dormant zombies based on noise (se for turno da Equipe B)
    if (room.currentTurn === "B") {
      const noise = room.gameState.pveNoiseLevel ?? 0;
      Object.values(room.gameState.units).forEach(u => {
        if (u.team === "B" && u.alertStatus === "dormant" && noise >= 30) {
          if (Math.random() * 100 < noise) {
            u.alertStatus = "investigating";
            u.extraMoveMeters = -(CLASSES[u.className]?.movement ?? 10) / 2;
            const noisyPlayer = Object.values(room.gameState.units).find(p => p.team === "A" && p.hp > 0);
            if (noisyPlayer) {
              u.targetLocation = { gx: Math.floor(noisyPlayer.x/CELL_SIZE), gy: Math.floor(noisyPlayer.y/CELL_SIZE) };
            }
          }
        }
      });
    }
  },

  onUnitMove: (room: Room, unit: Unit) => {
    if (room.draft.gameMode === "pve-zombies" && unit.team === "A") {
      Object.values(room.gameState.units).forEach(u => {
        if (u.team === "B" && u.alertStatus === "dormant") {
          if (isInVisionCone(u, unit, room)) {
            u.alertStatus = "alert";
            u.extraMoveMeters = -(CLASSES[u.className]?.movement ?? 10) / 2;
          }
        }
      });
    }
  },

  onShoot: (room: Room, attacker: Unit, coverInfo: ShotCoverResult) => {
    if (attacker.team === "A") {
      // Noise increment (+10 for normal shots)
      room.gameState.pveNoiseLevel = Math.min(100, (room.gameState.pveNoiseLevel ?? 0) + 10);

      if (coverInfo.alarmCells && coverInfo.alarmCells.length > 0) {
        room.gameState.pveNoiseLevel = Math.min(100, (room.gameState.pveNoiseLevel ?? 0) + 40);
        // We need a way to log, but for now we'll assume the server can handle generic logs or we add a log system to engine
        room.gameState.logs.push({
          id: randomUUID(),
          timestamp: Date.now(),
          message: `🚨 ALARME DISPARADO! Um tiro atingiu um veículo e a horda está convergindo para o local!`
        });
        
        const alarmPos = coverInfo.alarmCells[0].split(",").map(Number);
        const alarmGx = alarmPos[0];
        const alarmGy = alarmPos[1];

        Object.values(room.gameState.units).forEach(u => {
          if (u.team === "B" && u.alertStatus !== "alert") {
            const dx = (u.x / CELL_SIZE) - alarmGx;
            const dy = (u.y / CELL_SIZE) - alarmGy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist <= 20) {
              u.alertStatus = "investigating";
              u.extraMoveMeters = -(CLASSES[u.className]?.movement ?? 10) / 2;
              u.targetLocation = { gx: alarmGx, gy: alarmGy };
            }
          }
        });
      }
    }
  }
};

function isInVisionCone(observer: Unit, target: Unit, room: Room): boolean {
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  const distCells = Math.sqrt(dx * dx + dy * dy) / CELL_SIZE;
  if (distCells > 10) return false;

  const mapCover = room.coverData[room.gameState.mapId] || {};
  if (!hasLineOfSight(observer.x, observer.y, target.x, target.y, mapCover)) {
    return false;
  }

  const angleToTarget = Math.atan2(dy, dx) * (180 / Math.PI);
  let diff = Math.abs(normalizeAngle(angleToTarget - observer.rotation));
  return diff <= 45;
}
