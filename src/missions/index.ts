import { MissionEngine } from "./types";
import { SilentRunMission } from "./engine/SilentRun";

export const MISSION_REGISTRY: Record<string, MissionEngine> = {
  "silent_run": SilentRunMission
};

export function getMissionEngine(mapId: string): MissionEngine | null {
  return MISSION_REGISTRY[mapId] || null;
}
