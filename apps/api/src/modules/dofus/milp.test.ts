import { describe, expect, it } from "vitest";
import {
  activeSetBonuses,
  bestComboDamage,
  STATS,
  computeSpellDamage,
  type SpellGrade,
  type StatTotals,
  turnSpells,
  type DofusItem,
  type DofusSet,
  type DofusSpell,
  type StatKey,
  type StatWeights,
} from "@kenpai/shared";
import { criteriaMet, parseCriteria } from "@kenpai/shared";
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

/** Dégâts moyens exacts d'un lancer (formule du jeu, arrondis à l'inférieur, sans arrondir la moyenne). */
function exactPerCast(t: (k: StatKey) => number, grade: SpellGrade): number {
  const totals = Object.fromEntries(
    Object.keys(STATS).map((k) => [k, t(k as StatKey)]),
  ) as StatTotals;
  const r = computeSpellDamage(totals, grade);
  const p = r.criticalChance / 100;
  return r.lines.reduce((sum, l) => {
    const normal = (l.normal.min + l.normal.max) / 2;
    const crit = l.critical ? (l.critical.min + l.critical.max) / 2 : normal;
    return sum + (1 - p) * normal + p * crit;
  }, 0);
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
    // Conditions des objets, vérifiées indépendamment.
    const activeSets = sets.filter(
      (set) => items.filter((i) => set.itemIds.includes(i.id)).length >= 2,
    ).length;
    if (!items.every((i) => criteriaMet(i.criteria, { total: t, activeSets }))) return -Infinity;
    return bestComboDamage(spells, groups, 9, (s) => exactPerCast(t, s.grade));
  }

  it("retrouve l'optimum d'une recherche exhaustive (panoplies, % dommages, critique)", async () => {
    for (let seed = 1; seed <= 30; seed++) {
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
      // Quelques conditions au hasard (PA, caractéristiques, « ou », bonus de panoplie < 2).
      const conditions = ["CP<9", "CS>330", "pk<2", "CC<5|CS>360", "CP<10&CS>310", "CM>2"];
      const pick = () => parseCriteria(conditions[Math.floor(r() * conditions.length)]);
      hats[1] = { ...hats[1]!, criteria: pick() };
      rings[2] = { ...rings[2]!, criteria: pick() };
      cloaks[0] = { ...cloaks[0]!, criteria: pick() };
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
      if (best === -Infinity) expect(result.damage).toBe(-Infinity);
      else expect(result.damage).toBeCloseTo(best, 5);
    }
  }, 60_000);

  it("respecte les conditions des objets (PA, caractéristiques, bonus de panoplie < 2)", async () => {
    // Coiffe puissante mais « PA < 9 » ; anneau très fort mais « Force > 360 » ;
    // trophée « pk<2 » qui interdit de cumuler deux bonus de panoplie.
    const withSet = (i: DofusItem, set: number) => ({ ...i, set: { id: set, name: "Panoplie" } });
    const items: DofusItem[] = [
      { ...item(1, "hat", { strength: 200, ap: 1 }), criteria: parseCriteria("CP<9") },
      item(2, "hat", { strength: 80 }),
      item(3, "cloak", { ap: 1 }),
      { ...item(4, "ring", { strength: 150 }), criteria: parseCriteria("CS>360") },
      item(5, "ring", { strength: 40 }),
      item(6, "ring", { strength: 30 }),
      withSet(item(7, "amulet", { strength: 10 }), 60),
      withSet(item(8, "belt", { strength: 10 }), 60),
      withSet(item(9, "boots", { strength: 10 }), 61),
      withSet(item(10, "shield", { strength: 10 }), 61),
      { ...item(11, "dofus", { strength: 120 }), criteria: parseCriteria("pk<2") },
      item(12, "dofus", { strength: 5 }),
    ];
    const sets: DofusSet[] = [60, 61].map((id) => ({
      id,
      name: "Panoplie",
      itemIds: id === 60 ? [7, 8] : [9, 10],
      bonuses: { 2: [{ stat: "strength", value: 70, text: "" }] },
    }));
    const result = await optimizeTurnDamageMilp({
      level: 200,
      elements: ["earth"],
      ap: 9,
      base,
      spells,
      items,
      sets,
    });
    expect(result.proven).toBe(true);
    const chosen = new Set(Object.values(result.slots));
    // PA : 7 de base, il en faut 9 → coiffe 1 (PA < 9 impossible avec 9 PA) exclue :
    // la cape PA et… il manque un PA : pas de stuff possible sans la coiffe.
    expect(result.damage).toBe(-Infinity);
    expect(chosen.size).toBe(0);

    // Avec 8 PA visés : la coiffe 1 est portable (8 < 9).
    const spells8 = turnSpells(raw, 100, ["earth"], 8);
    const r8 = await optimizeTurnDamageMilp({
      level: 200,
      elements: ["earth"],
      ap: 8,
      base,
      spells: spells8,
      items,
      sets,
    });
    expect(r8.proven).toBe(true);
    const s8 = new Set(Object.values(r8.slots));
    expect(s8.has(1)).toBe(true);
    // Force : 300 + 200 + 40 + 30 + … : l'anneau « Force > 360 » doit vraiment avoir plus de 360.
    // Trophée pk<2 + deux panoplies complètes : interdit.
    const activeSets = [60, 61].filter((id) =>
      sets.find((s) => s.id === id)!.itemIds.every((i) => s8.has(i)),
    ).length;
    if (s8.has(11)) expect(activeSets).toBeLessThan(2);
  }, 60_000);
});
