import {
  CLASSES,
  WEAPONS,
  ARMORS,
  ATTACHMENTS,
  SCALE,
} from "../../../core/data/constants";
import { Unit, CoverType } from "../../../types/game";
import { angleDegBetween, normalizeAngle, distanceMeters } from "../../../utils/gameUtils";

export interface ShotCalculationOptions {
  attacker: Unit;
  target: Unit;
  coverLevel: CoverType | "none";
  distancePenalty: number;
  currentTurnNumber: number;
  fromGuard?: boolean;
  squadsightActive?: boolean;
}

export interface ShotResultData {
  ok: boolean;
  error?: string;
  hit: boolean;
  isCrit: boolean;
  damage: number;
  targetEliminated: boolean;
  hitRate: number;
  critChance: number;
  roll: number;
  critRoll?: number;
}

/**
 * Calculates the distance penalty for a given weapon range and target distance in meters.
 * Curto (20m): -2% per extra meter
 * Médio (40m): -1% per extra meter
 * Longo (60m): -0.5% per extra meter
 */
export function calculateDistancePenalty(
  rangeCategory: "Curto" | "Médio" | "Longo",
  distanceInMeters: number
): number {
  const baseRange = rangeCategory === "Curto" ? 20 : rangeCategory === "Médio" ? 40 : 60;
  const penaltyPerMeter = rangeCategory === "Curto" ? 2 : rangeCategory === "Médio" ? 1 : 0.5;
  if (distanceInMeters <= baseRange) return 0;
  return Math.max(0, (distanceInMeters - baseRange) * penaltyPerMeter);
}

/**
 * Helper to check if observer sees target in simple FOV (90 deg, <= 40m).
 */
export function isTargetInFovSimple(observer: Unit, target: Unit): boolean {
  const distMeters = distanceMeters(observer.x, observer.y, target.x, target.y);
  if (distMeters > SCALE.RAIO_VISAO_BASE) return false;
  const watch = observer.rotation ?? 0;
  const ang = angleDegBetween(observer.x, observer.y, target.x, target.y);
  const diff = Math.abs(normalizeAngle(ang - watch));
  return diff <= 45;
}

/**
 * Computes hit chance percentage (5% min) for an attack based on unit stats,
 * distance, cover, stance, and skills.
 */
export function calculateHitChance(options: ShotCalculationOptions): {
  hitRate: number;
  targetIsSurprised: boolean;
} {
  const {
    attacker,
    target,
    coverLevel,
    distancePenalty,
    currentTurnNumber,
    fromGuard = false,
    squadsightActive = false,
  } = options;

  const wName = attacker.activeWeaponSlot === "secondary" ? attacker.secondaryWeapon : attacker.primaryWeapon;
  const weapon = wName ? WEAPONS[wName] : null;

  const distMeters = distanceMeters(attacker.x, attacker.y, target.x, target.y);

  // Attachment bonuses
  let attHitBonus = 0;
  const atts = attacker.attachments || [];
  for (const attName of atts) {
    const attInfo = ATTACHMENTS[attName];
    if (!attInfo) continue;
    const weaponMatches = !attInfo.weaponClasses || (weapon && attInfo.weaponClasses.includes(weapon.weaponClass));
    const minRangeOk = attInfo.minRange === undefined || distMeters > attInfo.minRange;
    const maxRangeOk = attInfo.maxRange === undefined || distMeters <= attInfo.maxRange;
    const proneOk = !attInfo.requireProne || attacker.stance === "prone";

    if (weaponMatches && minRangeOk && maxRangeOk && proneOk) {
      attHitBonus += attInfo.hitBonus || 0;
    }
  }

  // Check if target is surprised
  let targetIsSurprised = !fromGuard && !isTargetInFovSimple(target, attacker);
  if (targetIsSurprised && target.skills && target.skills.includes("Sexto Sentido")) {
    targetIsSurprised = false;
  }

  const effectiveCover = targetIsSurprised ? "none" : coverLevel;

  let hitRate = CLASSES[attacker.className]?.hit ?? 60;
  hitRate += attHitBonus;
  if (distancePenalty) hitRate -= distancePenalty;
  if (squadsightActive) hitRate -= 15;
  if (effectiveCover === "half") hitRate -= 20;
  if (effectiveCover === "full") hitRate -= 40;
  if (fromGuard) hitRate -= 10;
  if (target.stance === "guard") hitRate -= 10;
  if (target.stance === "prone") hitRate -= 10;
  if (targetIsSurprised) hitRate += 10;

  // Skill Implacável penalty on target
  if (target.skills?.includes("Implacável") && target.killedThisTurn) {
    hitRate -= 30;
  }

  // Suppressed attacker penalty (-20%)
  if (attacker.suppressedUntilTurn && attacker.suppressedUntilTurn > 0 && attacker.suppressedUntilTurn >= currentTurnNumber) {
    hitRate -= 20;
  }

  // Smoke cover on target (-40%)
  if (target.suppressedUntilTurn && target.suppressedUntilTurn < 0 && Math.abs(target.suppressedUntilTurn) >= currentTurnNumber) {
    hitRate -= 40;
  }

  if (hitRate < 5) hitRate = 5;

  return { hitRate, targetIsSurprised };
}

/**
 * Computes critical hit chance percentage (0% min, 100% max).
 */
export function calculateCritChance(
  attacker: Unit,
  target: Unit,
  coverLevel: CoverType | "none",
  isFromBack: boolean
): number {
  const wName = attacker.activeWeaponSlot === "secondary" ? attacker.secondaryWeapon : attacker.primaryWeapon;
  const weapon = wName ? WEAPONS[wName] : null;

  const distMeters = distanceMeters(attacker.x, attacker.y, target.x, target.y);

  let attCritBonus = 0;
  const atts = attacker.attachments || [];
  for (const attName of atts) {
    const attInfo = ATTACHMENTS[attName];
    if (!attInfo) continue;
    const weaponMatches = !attInfo.weaponClasses || (weapon && attInfo.weaponClasses.includes(weapon.weaponClass));
    const minRangeOk = attInfo.minRange === undefined || distMeters > attInfo.minRange;
    const maxRangeOk = attInfo.maxRange === undefined || distMeters <= attInfo.maxRange;
    const proneOk = !attInfo.requireProne || attacker.stance === "prone";

    if (weaponMatches && minRangeOk && maxRangeOk && proneOk) {
      attCritBonus += attInfo.critBonus || 0;
    }
  }

  let critChance = weapon?.criticalChance || 0;
  if (CLASSES[attacker.className]?.name === "Sniper" || attacker.className === "Sniper") {
    critChance += 10;
  }
  critChance += attCritBonus;
  if (coverLevel === "half") critChance -= 5;
  if (coverLevel === "full") critChance -= 15;
  if (target.stance === "prone") critChance -= 5;

  if (attacker.skills?.includes("Flanqueador Nato")) {
    if (coverLevel === "none" || isFromBack) {
      critChance += 20;
    }
  }

  if (critChance < 0) critChance = 0;
  if (critChance > 100) critChance = 100;

  return critChance;
}

/**
 * Calculates final damage dealt after armor reduction.
 * Formula: Math.max(1, damage - Math.floor(armorRed / 2))
 */
export function calculateDamage(
  baseDamage: number,
  targetArmorName: string | null
): number {
  const armorRed = targetArmorName ? ARMORS[targetArmorName]?.reduction || 0 : 0;
  return Math.max(1, baseDamage - Math.floor(armorRed / 2));
}

/**
 * Validates whether a unit can perform a shot action (ammo, actions, shots per turn limit).
 */
export function validateShootAction(attacker: Unit): { valid: boolean; error?: string } {
  const wName = attacker.activeWeaponSlot === "secondary" ? attacker.secondaryWeapon : attacker.primaryWeapon;
  const weapon = wName ? WEAPONS[wName] : null;
  if (!weapon) return { valid: false, error: "Atirador sem arma" };

  const currentAmmo = attacker.activeWeaponSlot === "secondary" ? attacker.secondaryAmmoInMag : attacker.primaryAmmoInMag;
  if (currentAmmo <= 0) {
    return { valid: false, error: "Sem munição no carregador. Recarregue antes de atirar." };
  }

  if (attacker.shotsThisTurn >= weapon.shots) {
    return { valid: false, error: `Limite de ${weapon.shots} disparo(s) por turno atingido.` };
  }

  if (
    attacker.shotsThisTurn === 0 &&
    !attacker.actions.intervention &&
    !attacker.skills?.includes("Linha de Frente")
  ) {
    return { valid: false, error: "Sem Ação de Intervenção disponível neste turno." };
  }

  return { valid: true };
}

/**
 * Checks if a unit can move based on suppression state and available actions/movement.
 */
export function canUnitMove(unit: Unit, currentTurnNumber: number): { canMove: boolean; error?: string } {
  if (unit.suppressedUntilTurn && unit.suppressedUntilTurn > 0 && unit.suppressedUntilTurn >= currentTurnNumber) {
    return { canMove: false, error: "Esta unidade está Suprimida e não pode se mover neste turno!" };
  }

  if (!unit.actions.move && unit.extraMoveMeters <= unit.movedThisTurn) {
    return { canMove: false, error: "Sem Ação de Movimento disponível neste turno." };
  }

  return { canMove: true };
}

/**
 * Executes core shot logic (dice rolls, damage application, critical hits, logs).
 */
export function processShotExecution(
  attacker: Unit,
  target: Unit,
  coverLevel: CoverType | "none",
  distancePenalty: number,
  currentTurnNumber: number,
  fromGuard = false,
  forcedRolls?: { hitRoll?: number; critRoll?: number }
): ShotResultData {
  const wName = attacker.activeWeaponSlot === "secondary" ? attacker.secondaryWeapon : attacker.primaryWeapon;
  const weapon = wName ? WEAPONS[wName] : null;
  if (!weapon) {
    return {
      ok: false,
      error: "Atirador sem arma",
      hit: false,
      isCrit: false,
      damage: 0,
      targetEliminated: false,
      hitRate: 0,
      critChance: 0,
      roll: 0,
    };
  }

  const { hitRate, targetIsSurprised } = calculateHitChance({
    attacker,
    target,
    coverLevel,
    distancePenalty,
    currentTurnNumber,
    fromGuard,
  });

  const roll = forcedRolls?.hitRoll ?? Math.floor(Math.random() * 100) + 1;
  let hit = roll <= hitRate;

  // Target rotation & back calculation
  const targetRot = target.rotation ?? 0;
  const angToAttacker = angleDegBetween(target.x, target.y, attacker.x, attacker.y);
  const backDiff = Math.abs(normalizeAngle(angToAttacker - targetRot));
  const isFromBack = backDiff > 135;

  const effectiveCover = targetIsSurprised ? "none" : coverLevel;

  // Mortar special scatter rule
  if (weapon.name === "Morteiro" && !hit) {
    const scatterRoll = forcedRolls?.critRoll ?? Math.floor(Math.random() * 10) + 1;
    if (scatterRoll >= 5) {
      hit = true;
    }
  }

  if (!hit) {
    return {
      ok: true,
      hit: false,
      isCrit: false,
      damage: 0,
      targetEliminated: false,
      hitRate,
      critChance: 0,
      roll,
    };
  }

  // Hit logic & Critical chance
  const critChance = calculateCritChance(attacker, target, effectiveCover, isFromBack);
  const critRoll = forcedRolls?.critRoll ?? Math.floor(Math.random() * 100) + 1;
  const isCrit = critChance > 0 && critRoll <= critChance;

  const baseDmg = isCrit ? weapon.critical : weapon.damage;
  const damage = calculateDamage(baseDmg, target.armorName);

  return {
    ok: true,
    hit: true,
    isCrit,
    damage,
    targetEliminated: target.hp - damage <= 0,
    hitRate,
    critChance,
    roll,
    critRoll,
  };
}
