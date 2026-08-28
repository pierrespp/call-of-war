import { Room, Unit, CoverType } from "../types/game";
import { ShotCoverResult } from "../features/combat/utils/cover";

export interface MissionEngine {
  id: string;
  /** Gera o layout inicial de cobertura do mapa */
  generateCover: () => Record<string, CoverType>;
  /** Executado ao final de cada turno */
  onTurnEnd?: (room: Room) => void;
  /** Executado após o movimento de qualquer unidade */
  onUnitMove?: (room: Room, unit: Unit) => void;
  /** Executado após um disparo */
  onShoot?: (room: Room, attacker: Unit, coverInfo: ShotCoverResult) => void;
}
