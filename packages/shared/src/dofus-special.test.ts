import { describe, expect, it } from "vitest";
import { STATS, computeCharacter, computeSpellDamage, type StatTotals } from "./dofus";
import { SPECIAL_EFFECTS, specialBuffs, specialEffectOf } from "./dofus-special";

const zeros = () =>
  ({ vitality: 0, wisdom: 0, strength: 0, intelligence: 0, chance: 0, agility: 0 }) as const;

describe("effets spéciaux des Dofus", () => {
  it("retrouve l'effet par l'identifiant de l'objet, pas par son nom", () => {
    expect(specialEffectOf({ id: 8698 })?.key).toBe("nebuleux");
    // Ancien Dofus Vulbis (niveau 100) : même nom, sans l'effet.
    expect(specialEffectOf({ id: 21186 })).toBeNull();
  });

  it("n'ajoute que le bonus choisi, rien sans choix", () => {
    const items = [{ id: 7754 }, { id: 8698 }];
    expect(specialBuffs(items, {})).toEqual({});
    expect(specialBuffs(items, { ocre: "hit", nebuleux: "even" })).toEqual({
      dodge: 20,
      finalDamagePct: -10,
    });
    expect(specialBuffs(items, { ocre: "none" })).toEqual({});
  });

  it("chaque choix a un identifiant unique et une caractéristique connue", () => {
    for (const effect of SPECIAL_EFFECTS) {
      const ids = effect.choices.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain("none");
      for (const c of effect.choices) {
        for (const k of Object.keys(c.stats)) expect(k in STATS).toBe(true);
      }
    }
  });

  it("le PA de l'Ocre dépasse la limite de 12", () => {
    const base = { level: 200, base: zeros(), scrolls: zeros(), items: [], sets: [] };
    const gear = { ...base, forgemagic: [{ stat: "ap" as const, value: 10 }] };
    expect(computeCharacter(gear).totals.ap).toBe(12);
    expect(computeCharacter({ ...gear, buffs: { ap: 1 } }).totals.ap).toBe(13);
  });

  it("les dommages finaux s'appliquent en dernier", () => {
    const totals = Object.fromEntries(Object.keys(STATS).map((k) => [k, 0])) as StatTotals;
    const grade = {
      grade: 1,
      minLevel: 1,
      apCost: 3,
      minRange: 1,
      range: 5,
      criticalChance: 0,
      lines: [{ element: "fire" as const, kind: "damage" as const, min: 100, max: 100 }],
      criticalLines: [],
    };
    expect(computeSpellDamage(totals, grade).average).toBe(100);
    expect(computeSpellDamage({ ...totals, finalDamagePct: 20 }, grade).average).toBe(120);
    expect(computeSpellDamage({ ...totals, finalDamagePct: -10 }, grade).average).toBe(90);
  });
});
