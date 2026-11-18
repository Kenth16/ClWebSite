import { describe, expect, it } from "vitest";
import {
  activeSetBonuses,
  availablePoints,
  characteristicCost,
  computeCharacter,
  conditionsMet,
  conditionsText,
  statFromEffectName,
  type CharacterInput,
  type DofusConditionTree,
  type DofusItem,
  type DofusSet,
} from "./dofus";

const zero = { vitality: 0, wisdom: 0, strength: 0, intelligence: 0, chance: 0, agility: 0 };

function item(id: number, effects: [string, number][], setId?: number): DofusItem {
  return {
    id,
    name: `Objet ${id}`,
    level: 100,
    type: "Anneau",
    icon: null,
    effects: effects.map(([name, value]) => ({
      stat: statFromEffectName(name),
      value,
      text: name,
    })),
    conditions: null,
    set: setId ? { id: setId, name: "Panoplie" } : null,
  };
}

describe("simulateur Dofus", () => {
  it("reconnaît les noms d'effets de l'API", () => {
    expect(statFromEffectName("Vitalité")).toBe("vitality");
    expect(statFromEffectName("Dommage Critique")).toBe("criticalDamage");
    expect(statFromEffectName("Résistance Critiques")).toBe("criticalRes");
    expect(statFromEffectName("% Dommages d'armes")).toBe("weaponDamagePct");
    expect(statFromEffectName("% Résistance Air")).toBe("airResPct");
    expect(statFromEffectName("Soin")).toBe("heals");
    expect(statFromEffectName("dommages Feu")).toBe("fireDamage");
    expect(statFromEffectName("-special spell-")).toBeNull();
  });

  it("applique le coût des points de caractéristique", () => {
    expect(characteristicCost("vitality", 250)).toBe(250);
    expect(characteristicCost("wisdom", 10)).toBe(30);
    expect(characteristicCost("strength", 100)).toBe(100);
    expect(characteristicCost("strength", 200)).toBe(300);
    expect(characteristicCost("strength", 301)).toBe(604);
    expect(availablePoints(200)).toBe(995);
  });

  it("retrouve les valeurs d'un personnage réel (niveau 131)", () => {
    // Base : Vitalité 7, Force 200, Intelligence 200 ; parchemins : Vita 100, le reste 25.
    const input: CharacterInput = {
      level: 131,
      base: { ...zero, vitality: 7, strength: 200, intelligence: 200 },
      scrolls: {
        vitality: 100,
        wisdom: 25,
        strength: 25,
        intelligence: 25,
        chance: 25,
        agility: 25,
      },
      items: [
        item(1, [
          ["Vitalité", 470],
          ["Sagesse", 100],
          ["Intelligence", 160],
          ["Chance", 160],
          ["PA", 2],
          ["Prospection", 40],
        ]),
      ],
      sets: [],
    };
    const r = computeCharacter(input);
    expect(r.pointsLeft).toBe(43);
    expect(r.totals.vitality).toBe(577);
    expect(r.hp).toBe(1282);
    expect(r.totals.ap).toBe(9);
    expect(r.totals.mp).toBe(3);
    expect(r.totals.initiative).toBe(820);
    expect(r.totals.pods).toBe(2125);
    expect(r.totals.prospecting).toBe(158);
    expect(r.totals.apParry).toBe(12);
    expect(r.totals.lock).toBe(2);
  });

  it("active les bonus de panoplie selon le nombre d'objets", () => {
    const set: DofusSet = {
      id: 7,
      name: "Panoplie",
      itemIds: [1, 2, 3],
      bonuses: {
        2: [{ stat: "vitality", value: 20, text: "20 Vitalité" }],
        3: [{ stat: "vitality", value: 50, text: "50 Vitalité" }],
      },
    };
    const a = item(1, [], 7);
    const b = item(2, [], 7);
    const c = item(3, [], 7);
    expect(activeSetBonuses([a], [set])).toEqual([]);
    expect(activeSetBonuses([a, b], [set])[0]!.effects[0]!.value).toBe(20);
    expect(activeSetBonuses([a, b, c], [set])[0]!.effects[0]!.value).toBe(50);
    // Le même objet deux fois ne compte qu'une fois.
    expect(activeSetBonuses([a, a], [set])).toEqual([]);
    const r = computeCharacter({
      level: 1,
      base: zero,
      scrolls: zero,
      items: [a, b, c],
      sets: [set],
    });
    expect(r.totals.vitality).toBe(50);
  });

  it("vérifie les conditions d'équipement", () => {
    const tree: DofusConditionTree = {
      kind: "and",
      children: [
        {
          kind: "condition",
          condition: { stat: "strength", label: "Force", operator: ">", value: 249 },
        },
        {
          kind: "or",
          children: [
            {
              kind: "condition",
              condition: { stat: "level", label: "Niveau", operator: ">", value: 150 },
            },
            {
              kind: "condition",
              condition: { stat: "agility", label: "Agilité", operator: ">", value: 99 },
            },
          ],
        },
      ],
    };
    const totals = computeCharacter({
      level: 100,
      base: zero,
      scrolls: zero,
      items: [],
      sets: [],
    }).totals;
    expect(conditionsMet(tree, { level: 100, totals: { ...totals, strength: 300 } })).toBe(false);
    expect(conditionsMet(tree, { level: 160, totals: { ...totals, strength: 300 } })).toBe(true);
    expect(conditionsText(tree)).toBe("Force > 249 et (Niveau > 150 ou Agilité > 99)");
  });
});
