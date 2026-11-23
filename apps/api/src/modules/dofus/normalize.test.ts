import { describe, expect, it } from "vitest";
import {
  STATS,
  canForgeWeaponElement,
  computeSpellDamage,
  forgeWeaponElement,
  weaponGrade,
  type StatTotals,
} from "@kenpai/shared";
import { normalizeItem, type RawItem } from "./normalize";

const effect = (name: string, min: number, max: number, active = true) => ({
  int_minimum: min,
  int_maximum: max,
  type: { name, is_active: active },
  formatted: `${min} à ${max} ${name}`,
});

const sword: RawItem = {
  ankama_id: 1,
  name: "Épée d'essai",
  level: 200,
  type: { name: "Épée", id: 6 },
  is_weapon: true,
  ap_cost: 4,
  range: { min: 1, max: 1 },
  critical_hit_probability: 10,
  critical_hit_bonus: 5,
  max_cast_per_turn: 2,
  effects: [
    effect("dommages Feu", 30, 40),
    effect("vol Eau", 10, 12),
    effect("dommages du meilleur élément", 5, 8),
    effect("Vitalité", 300, 350, false),
  ],
};

describe("armes (corps à corps)", () => {
  it("lit le coup de l'arme : lignes, coût, portée, critique", () => {
    const weapon = normalizeItem(sword).weapon!;
    expect(weapon).toMatchObject({
      apCost: 4,
      minRange: 1,
      range: 1,
      criticalChance: 10,
      criticalBonus: 5,
      castsPerTurn: 2,
    });
    expect(weapon.lines).toEqual([
      { element: "fire", kind: "damage", min: 30, max: 40 },
      { element: "water", kind: "steal", min: 10, max: 12 },
      { element: "neutral", kind: "damage", min: 5, max: 8, pick: "best" },
    ]);
    // Les caractéristiques passives restent des effets ordinaires.
    expect(normalizeItem(sword).effects.some((e) => e.stat === "vitality")).toBe(true);
    expect(normalizeItem({ ...sword, is_weapon: false }).weapon).toBeNull();
  });

  it("ajoute le bonus critique aux jets et utilise le % Do Armes", () => {
    const grade = weaponGrade(
      normalizeItem({ ...sword, effects: [effect("dommages Feu", 30, 40)] }).weapon!,
    );
    expect(grade.criticalLines[0]).toMatchObject({ min: 35, max: 45 });
    const zero = Object.fromEntries(Object.keys(STATS).map((k) => [k, 0])) as StatTotals;
    const plain = computeSpellDamage(zero, grade);
    expect(plain.lines[0]!.normal).toEqual({ min: 30, max: 40 });
    // % Do Sorts sans effet sur une arme ; % Do Armes compte.
    expect(computeSpellDamage({ ...zero, spellDamagePct: 50 }, grade).lines[0]!.normal).toEqual({
      min: 30,
      max: 40,
    });
    expect(computeSpellDamage({ ...zero, weaponDamagePct: 50 }, grade).lines[0]!.normal).toEqual({
      min: 45,
      max: 60,
    });
  });
});

describe("forgemagie de l'élément de l'arme", () => {
  it("change seulement la première ligne, et seulement si elle est neutre", () => {
    const hit = normalizeItem({
      ...sword,
      effects: [effect("dommages Neutre", 20, 30), effect("dommages Neutre", 5, 6)],
    }).weapon!;
    expect(canForgeWeaponElement(hit)).toBe(true);
    const forged = forgeWeaponElement(hit, "air");
    expect(forged.lines.map((l) => l.element)).toEqual(["air", "neutral"]);
    expect(forgeWeaponElement(hit, null)).toBe(hit);

    const fire = normalizeItem(sword).weapon!; // première ligne : Feu
    expect(canForgeWeaponElement(fire)).toBe(false);
    expect(forgeWeaponElement(fire, "water")).toBe(fire);
  });
});
