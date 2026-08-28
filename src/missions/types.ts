import { Room, Unit, CoverType } from "../types/game";

export interface MissionEngine {
  id: string;
  /** Gera o layout inicial de cobertura do mapa */
  generateCover: () => Record<string, CoverType>;
  /** Executado ao final de cada turno */
  onTurnEnd?: (room: Room) => void;
  /** Executado após o movimento de qualquer unidade */
  onUnitMove?: (room: Room, unit: Unit) => void;
  /** Executado após um disparo */
  onShoot?: (room: Room, attacker: Unit, coverInfo: any) => void;
}
