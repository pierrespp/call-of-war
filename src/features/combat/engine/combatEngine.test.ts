import { describe, it, expect } from "vitest";
import {
  calculateDistancePenalty,
  calculateHitChance,
  calculateCritChance,
  calculateDamage,
  validateShootAction,
  canUnitMove,
  processShotExecution,
} from "./combatEngine";
import { computeShotCover } from "../utils/cover";
import { Unit, MapCoverData } from "../../../types/game";

function createMockUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: "unit-1",
    name: "Soldado Teste",
    team: "A",
    className: "USA_Assalto",
    x: 100,
    y: 100,
    rotation: 0, // facing East / +X direction
    hp: 10,
    armorName: null,
    primaryWeapon: "AK-47",
    secondaryWeapon: null,
    attachments: [],
    skills: [],
    primaryAmmoInMag: 3,
    secondaryAmmoInMag: 0,
    activeWeaponSlot: "primary",
    movedThisTurn: 0,
    extraMoveMeters: 0,
    shotsThisTurn: 0,
    markedTargetId: null,
    markedTargetExpiresAtTurn: 0,
    actions: {
      move: true,
      intervention: true,
      tactical: true,
      chargeUsed: false,
    },
    stance: "standing",
    facingLockedThisTurn: false,
    ...overrides,
  };
}

describe("Combat Engine - Distance Penalty Calculation", () => {
  it("should return 0 penalty when within base range for all weapon categories", () => {
    expect(calculateDistancePenalty("Curto", 15)).toBe(0);
    expect(calculateDistancePenalty("Curto", 20)).toBe(0);
    expect(calculateDistancePenalty("Médio", 30)).toBe(0);
    expect(calculateDistancePenalty("Médio", 40)).toBe(0);
    expect(calculateDistancePenalty("Longo", 50)).toBe(0);
    expect(calculateDistancePenalty("Longo", 60)).toBe(0);
  });

  it("should calculate correct distance penalties beyond base range", () => {
    // Curto: 2% per extra meter beyond 20m
    expect(calculateDistancePenalty("Curto", 25)).toBe(10); // (25 - 20) * 2

    // Médio: 1% per extra meter beyond 40m
    expect(calculateDistancePenalty("Médio", 50)).toBe(10); // (50 - 40) * 1

    // Longo: 0.5% per extra meter beyond 60m
    expect(calculateDistancePenalty("Longo", 70)).toBe(5); // (70 - 60) * 0.5
  });
});

describe("Combat Engine - Damage & Armor Reduction", () => {
  it("should return base damage when target has no armor", () => {
    expect(calculateDamage(5, null)).toBe(5);
  });

  it("should apply armor reduction correctly (halved reduction in formula)", () => {
    // Pesado has reduction 4 -> Math.floor(4/2) = 2
    expect(calculateDamage(5, "Pesado")).toBe(3); // 5 - 2
  });

  it("should guarantee minimum 1 damage regardless of heavy armor", () => {
    // Base damage 1 vs armor reduction 4 -> 1 - 2 = -1 -> min 1
    expect(calculateDamage(1, "Pesado")).toBe(1);
  });
});

describe("Combat Engine - Hit Rate & Modifiers", () => {
  it("should calculate base hit rate correctly based on attacker class", () => {
    const attacker = createMockUnit({ className: "USA_Assalto", rotation: 0 }); // Base hit 70
    // Target placed directly in front of attacker at x:200, y:100 (in FOV, angle 0 deg)
    const target = createMockUnit({ id: "unit-2", team: "B", x: 200, y: 100, rotation: 180 });

    const result = calculateHitChance({
      attacker,
      target,
      coverLevel: "none",
      distancePenalty: 0,
      currentTurnNumber: 1,
    });

    expect(result.hitRate).toBe(70);
    expect(result.targetIsSurprised).toBe(false);
  });

  it("should apply cover penalties correctly", () => {
    const attacker = createMockUnit({ className: "USA_Assalto", rotation: 0 }); // 70 hit
    const target = createMockUnit({ id: "unit-2", team: "B", x: 200, y: 100, rotation: 180 });

    const halfResult = calculateHitChance({
      attacker,
      target,
      coverLevel: "half",
      distancePenalty: 0,
      currentTurnNumber: 1,
    });
    expect(halfResult.hitRate).toBe(50); // 70 - 20

    const fullResult = calculateHitChance({
      attacker,
      target,
      coverLevel: "full",
      distancePenalty: 0,
      currentTurnNumber: 1,
    });
    expect(fullResult.hitRate).toBe(30); // 70 - 40
  });

  it("should apply posture modifiers (Guard, Prone, Surprised, Suppressed)", () => {
    const attacker = createMockUnit({ className: "USA_Assalto", rotation: 0 }); // 70 base
    const target = createMockUnit({ id: "unit-2", team: "B", x: 200, y: 100, rotation: 180, stance: "prone" });

    // Target prone (-10)
    const proneResult = calculateHitChance({
      attacker,
      target,
      coverLevel: "none",
      distancePenalty: 0,
      currentTurnNumber: 1,
    });
    expect(proneResult.hitRate).toBe(60); // 70 - 10

    // Attacker suppressed (-20)
    attacker.suppressedUntilTurn = 2;
    const suppressedResult = calculateHitChance({
      attacker,
      target,
      coverLevel: "none",
      distancePenalty: 0,
      currentTurnNumber: 1,
    });
    expect(suppressedResult.hitRate).toBe(40); // 70 - 10 (prone) - 20 (suppressed)
  });

  it("should enforce a minimum hit rate of 5%", () => {
    const attacker = createMockUnit({ className: "TR_Guerrilheiro_Assalto", rotation: 0 }); // 60 base
    const target = createMockUnit({ id: "unit-2", team: "B", x: 200, y: 100, rotation: 180, stance: "guard" });

    const result = calculateHitChance({
      attacker,
      target,
      coverLevel: "full", // -40
      distancePenalty: 30, // -30
      currentTurnNumber: 1,
    });

    // 60 - 40 - 30 - 10 = -20 -> min 5
    expect(result.hitRate).toBe(5);
  });
});

describe("Combat Engine - Critical Hit Chance", () => {
  it("should grant +10% crit chance to Sniper class", () => {
    const sniper = createMockUnit({ className: "USA_Sniper", primaryWeapon: "Barret M82" }); // Barret base crit 30%
    const target = createMockUnit({ id: "unit-2", team: "B", x: 200, y: 100 });

    const crit = calculateCritChance(sniper, target, "none", false);
    expect(crit).toBe(40); // 30 base + 10 sniper
  });

  it("should apply cover and prone penalties to crit chance", () => {
    const sniper = createMockUnit({ className: "USA_Sniper", primaryWeapon: "Barret M82" }); // 30 + 10 = 40
    const target = createMockUnit({ id: "unit-2", team: "B", x: 200, y: 100, stance: "prone" }); // -5 prone

    const critHalf = calculateCritChance(sniper, target, "half", false);
    expect(critHalf).toBe(30); // 40 - 5 (half cover) - 5 (prone)
  });
});

describe("Combat Engine - Cover Raycasting (computeShotCover)", () => {
  it("should detect full cover along line of fire", () => {
    const cover: MapCoverData = {
      "3,2": "full",
    };
    const result = computeShotCover(75, 125, 275, 125, cover);
    expect(result.cover).toBe("full");
    expect(result.hasWall).toBe(false);
    expect(result.contributingFullCells).toContain("3,2");
  });

  it("should block shot completely if line crosses wall or doorClose", () => {
    const cover: MapCoverData = {
      "3,2": "wall",
    };
    const result = computeShotCover(75, 125, 275, 125, cover);
    expect(result.hasWall).toBe(true);
  });

  it("should apply half cover only if within 2 squares of target and not flanked", () => {
    const cover: MapCoverData = {
      "4,2": "half",
    };
    const result = computeShotCover(75, 125, 275, 125, cover);
    expect(result.cover).toBe("half");
    expect(result.contributingHalfCells).toContain("4,2");
  });
});

describe("Combat Engine - AP & Action Validation", () => {
  it("should prevent shooting if magazine is empty", () => {
    const unit = createMockUnit({ primaryAmmoInMag: 0 });
    const validation = validateShootAction(unit);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("Sem munição");
  });

  it("should prevent shooting if shots limit per turn was reached", () => {
    const unit = createMockUnit({ shotsThisTurn: 1, primaryWeapon: "Barret M82" }); // Barret has 1 shot per turn
    const validation = validateShootAction(unit);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("disparo(s) por turno atingido");
  });

  it("should prevent movement if unit is suppressed", () => {
    const unit = createMockUnit({ suppressedUntilTurn: 2 });
    const result = canUnitMove(unit, 1);
    expect(result.canMove).toBe(false);
    expect(result.error).toContain("Suprimida");
  });

  it("should allow movement if suppression expired", () => {
    const unit = createMockUnit({ suppressedUntilTurn: 1 });
    const result = canUnitMove(unit, 2);
    expect(result.canMove).toBe(true);
  });
});

describe("Combat Engine - Full Shot Execution Process", () => {
  it("should process hit and apply damage correctly on target", () => {
    const attacker = createMockUnit({ className: "USA_Assalto", primaryWeapon: "AK-47", rotation: 0 }); // Base dmg 4
    const target = createMockUnit({ id: "target-1", hp: 10, x: 200, y: 100, rotation: 180 });

    // Force hit roll 10 (guaranteed hit vs 70% hitRate) and crit roll 90 (miss crit vs 10%)
    const shotResult = processShotExecution(
      attacker,
      target,
      "none",
      0,
      1,
      false,
      { hitRoll: 10, critRoll: 90 }
    );

    expect(shotResult.hit).toBe(true);
    expect(shotResult.isCrit).toBe(false);
    expect(shotResult.damage).toBe(4);
    expect(shotResult.targetEliminated).toBe(false);
  });

  it("should process critical hit with boosted weapon critical damage", () => {
    const attacker = createMockUnit({ className: "USA_Sniper", primaryWeapon: "Barret M82", rotation: 0 }); // Base dmg 12, Crit 15, Crit chance 40%
    const target = createMockUnit({ id: "target-1", hp: 10, x: 200, y: 100, rotation: 180 });

    // Force hit roll 5 and crit roll 10 (guaranteed critical)
    const shotResult = processShotExecution(
      attacker,
      target,
      "none",
      0,
      1,
      false,
      { hitRoll: 5, critRoll: 10 }
    );

    expect(shotResult.hit).toBe(true);
    expect(shotResult.isCrit).toBe(true);
    expect(shotResult.damage).toBe(15);
    expect(shotResult.targetEliminated).toBe(true); // 10 HP - 15 damage <= 0
  });
});
