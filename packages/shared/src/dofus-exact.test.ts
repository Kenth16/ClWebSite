import { describe, expect, it } from "vitest";
import {
  activeSetBonuses,
  type DofusItem,
  type DofusSet,
  type DofusSpell,
  type StatKey,
} from "./dofus";
import { optimizeTurnDamageExact } from "./dofus-exact";
import { bestComboDamage, fastPerCast, turnSpells, type StatWeights } from "./dofus-optimizer";

const item = (
  id: number,
  family: DofusItem["family"],
  stats: Partial<Record<StatKey, number>>,
  set: number | null = null,
): DofusItem => ({
  id,
  name: `Objet ${id}`,
  level: 100,
  type: "",
  icon: null,
  conditions: null,
  set: set === null ? null : { id: set, name: `Panoplie ${set}` },
  family,
  effects: Object.entries(stats).map(([stat, value]) => ({
    stat: stat as StatKey,
    value: value!,
    text: "",
  })),
});

const spell: DofusSpell = {
  id: 1,
  name: "Sort",
  icon: null,
  variant: 1,
  grades: [
    {
      grade: 1,
      minLevel: 1,
      apCost: 4,
      minRange: 1,
      range: 6,
      criticalChance: 10,
      maxCastsPerTurn: null,
      lines: [{ element: "earth", kind: "damage", min: 30, max: 34 }],
      criticalLines: [{ element: "earth", kind: "damage", min: 36, max: 40 }],
    },
  ],
};

/** Générateur déterministe pour des jeux d'essai. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
}

describe("optimiseur exact", () => {
  const base: StatWeights = { ap: 7, strength: 400 };
  const spells = turnSpells([spell], 100, ["earth"], 8);

  /** Dégâts d'un stuff, calculés indépendamment (bonus de panoplie du simulateur). */
  function damageOf(items: DofusItem[], sets: DofusSet[]): number {
    const totals = new Map<StatKey, number>(Object.entries(base) as [StatKey, number][]);
    const add = (effects: DofusItem["effects"]) => {
      for (const e of effects) if (e.stat) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
    };
    for (const i of items) add(i.effects);
    for (const b of activeSetBonuses(items, sets)) add(b.effects);
    if (Math.min(totals.get("ap") ?? 0, 12) < 8) return -Infinity;
    const t = (k: StatKey) => totals.get(k) ?? 0;
    return bestComboDamage(spells, [[0]], 8, (s) => fastPerCast(s, t));
  }

  it("retrouve l'optimum d'une recherche exhaustive (panoplies comprises)", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = rng(seed);
      const stat = (): Partial<Record<StatKey, number>> => ({
        strength: Math.floor(r() * 120) - 20,
        power: Math.floor(r() * 40),
        damage: Math.floor(r() * 12),
        critical: Math.floor(r() * 8),
        criticalDamage: Math.floor(r() * 15),
        ...(r() < 0.25 ? { ap: 1 } : {}),
      });
      const hats = [1, 2, 3].map((id) => item(id, "hat", stat(), id === 1 ? 50 : null));
      const rings = [4, 5, 6, 7].map((id) => item(id, "ring", stat(), id === 4 ? 50 : null));
      const cloaks = [8, 9].map((id) => item(id, "cloak", stat(), id === 8 ? 50 : null));
      const set: DofusSet = {
        id: 50,
        name: "Panoplie",
        itemIds: [1, 4, 8],
        bonuses: {
          2: [{ stat: "strength", value: Math.floor(r() * 150), text: "" }],
          3: [
            { stat: "strength", value: Math.floor(r() * 300), text: "" },
            { stat: "ap", value: 1, text: "" },
          ],
        },
      };
      const items = [...hats, ...rings, ...cloaks];

      // Recherche exhaustive : chaque emplacement prend un objet ou reste vide.
      let best = -Infinity;
      const opt = <T>(l: T[]) => [null, ...l];
      for (const h of opt(hats))
        for (const c of opt(cloaks))
          for (const r1 of opt(rings))
            for (const r2 of opt(rings)) {
              if (r1 && r2 && r1.id >= r2.id) continue;
              if (!r1 && r2) continue;
              const chosen = [h, c, r1, r2].filter((x): x is DofusItem => x !== null);
              best = Math.max(best, damageOf(chosen, [set]));
            }

      const exact = optimizeTurnDamageExact({
        level: 200,
        elements: ["earth"],
        ap: 8,
        base,
        spells,
        items,
        sets: [set],
      });
      expect(exact.proven).toBe(true);
      expect(exact.damage).toBeCloseTo(best, 6);
      const picked = Object.values(exact.slots).map((id) => items.find((i) => i.id === id)!);
      expect(damageOf(picked, [set])).toBeCloseTo(best, 6);
    }
  });

  it("garde un objet faible seul mais utile par sa panoplie (cas Volkorne)", () => {
    // Anneau Volkorne : seulement de la Chance, inutile en Terre seul ; mais avec
    // la ceinture Volkorne, la panoplie donne +150 Force.
    const set: DofusSet = {
      id: 7,
      name: "Volkorne",
      itemIds: [1, 2],
      bonuses: { 2: [{ stat: "strength", value: 150, text: "" }] },
    };
    const items = [
      item(1, "ring", { chance: 100 }, 7),
      item(2, "belt", { strength: 100 }, 7),
      item(3, "ring", { strength: 60 }),
      item(4, "ring", { strength: 50 }),
      item(5, "belt", { strength: 150 }),
    ];
    const exact = optimizeTurnDamageExact({
      level: 200,
      elements: ["earth"],
      ap: 8,
      base: { ...base, ap: 8 },
      spells,
      items,
      sets: [set],
    });
    // Volkorne : 100 + 150 (panoplie) + 60 = 310 Force, contre 150 + 60 + 50 = 260.
    expect(exact.proven).toBe(true);
    expect(exact.slots.belt).toBe(2);
    expect(new Set([exact.slots.ring1, exact.slots.ring2])).toEqual(new Set([1, 3]));
  });
});
