import { describe, expect, it } from "vitest";
import {
  activeSetBonuses,
  bestComboDamage,
  fastPerCast,
  turnSpells,
  type DofusItem,
  type DofusSet,
  type DofusSpell,
  type StatKey,
  type StatWeights,
} from "@kenpai/shared";
import { optimizeTurnDamageMilp } from "./milp";

const item = (
  id: number,
  family: DofusItem["family"],
  stats: Partial<Record<StatKey, number>>,
): DofusItem => ({
  id,
  name: `Objet ${id}`,
  level: 100,
  type: "",
  icon: null,
  conditions: null,
  set: null,
  family,
  effects: Object.entries(stats).map(([stat, value]) => ({
    stat: stat as StatKey,
    value: value!,
    text: "",
  })),
});

const spellOf = (
  id: number,
  variant: number,
  apCost: number,
  min: number,
  range: number,
  crit: number,
): DofusSpell => ({
  id,
  name: `Sort ${id}`,
  icon: null,
  variant,
  grades: [
    {
      grade: 1,
      minLevel: 1,
      apCost,
      minRange: 1,
      range,
      criticalChance: crit,
      maxCastsPerTurn: 2,
      lines: [{ element: "earth", kind: "damage", min, max: min + 4 }],
      criticalLines: [{ element: "earth", kind: "damage", min: min + 6, max: min + 10 }],
    },
  ],
});

/** Générateur déterministe. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
}

describe("optimiseur MILP", () => {
  const base: StatWeights = { ap: 7, strength: 300 };
  const raw = [
    spellOf(1, 1, 4, 30, 6, 10),
    spellOf(2, 1, 3, 22, 1, 20),
    spellOf(3, 2, 2, 12, 5, 5),
  ];
  const spells = turnSpells(raw, 100, ["earth"], 9);
  const groups = [[0, 1], [2]];

  function damageOf(items: DofusItem[], sets: DofusSet[]): number {
    const totals = new Map<StatKey, number>(Object.entries(base) as [StatKey, number][]);
    const add = (effects: DofusItem["effects"]) => {
      for (const e of effects) if (e.stat) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
    };
    for (const i of items) add(i.effects);
    for (const b of activeSetBonuses(items, sets)) add(b.effects);
    if (Math.min(totals.get("ap") ?? 0, 12) < 9) return -Infinity;
    const t = (k: StatKey) => totals.get(k) ?? 0;
    return bestComboDamage(spells, groups, 9, (s) => fastPerCast(s, t));
  }

  it("retrouve l'optimum d'une recherche exhaustive (panoplies, % dommages, critique)", async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed);
      const stat = (): Partial<Record<StatKey, number>> => ({
        strength: Math.floor(r() * 120) - 20,
        power: Math.floor(r() * 40),
        damage: Math.floor(r() * 12),
        critical: Math.floor(r() * 15),
        criticalDamage: Math.floor(r() * 15),
        spellDamagePct: Math.floor(r() * 8),
        meleeDamagePct: Math.floor(r() * 10) - 2,
        rangedDamagePct: Math.floor(r() * 10) - 2,
        ...(r() < 0.35 ? { ap: 1 } : {}),
      });
      const withSet = (i: DofusItem, set: number | null) =>
        set === null ? i : { ...i, set: { id: set, name: "Panoplie" } };
      const hats = [1, 2, 3].map((id) => withSet(item(id, "hat", stat()), id === 1 ? 50 : null));
      const rings = [4, 5, 6, 7].map((id) =>
        withSet(item(id, "ring", stat()), id === 4 ? 50 : null),
      );
      const cloaks = [8, 9].map((id) => withSet(item(id, "cloak", stat()), id === 8 ? 50 : null));
      const set: DofusSet = {
        id: 50,
        name: "Panoplie",
        itemIds: [1, 4, 8],
        bonuses: {
          2: [{ stat: "strength", value: Math.floor(r() * 150), text: "" }],
          3: [
            { stat: "strength", value: Math.floor(r() * 300), text: "" },
            { stat: "ap", value: 1, text: "" },
            { stat: "critical", value: 10, text: "" },
          ],
        },
      };
      const items = [...hats, ...rings, ...cloaks];

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

      const result = await optimizeTurnDamageMilp({
        level: 200,
        elements: ["earth"],
        ap: 9,
        base,
        spells,
        items,
        sets: [set],
      });
      expect(result.proven).toBe(true);
      expect(result.damage).toBeCloseTo(best, 5);
    }
  }, 60_000);
});
