import { describe, expect, it } from "vitest";
import { STATS, type DofusItem, type DofusSet, type DofusSpell, type StatKey, type StatTotals } from "./dofus";
import {
  allocatePoints,
  bestCombo,
  classElements,
  isAllowedItem,
  optimizeStuff,
  optimizeTurnDamage,
  topCombos,
  turnSpells,
} from "./dofus-optimizer";

const item = (
  id: number,
  family: DofusItem["family"],
  stats: Partial<Record<StatKey, number>>,
  level = 100,
): DofusItem => ({
  id,
  name: `Objet ${id}`,
  level,
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

const spell = (
  id: number,
  element: "fire" | "air" | "earth",
  dmg: number,
  apCost: number,
  options: { variant?: number; maxCasts?: number | null } = {},
): DofusSpell => ({
  id,
  name: `Sort ${id}`,
  icon: null,
  variant: options.variant ?? id,
  grades: [
    {
      grade: 1,
      minLevel: 1,
      apCost,
      minRange: 1,
      range: 5,
      criticalChance: 0,
      maxCastsPerTurn: options.maxCasts ?? null,
      lines: [{ element, kind: "damage", min: dmg, max: dmg }],
      criticalLines: [],
    },
  ],
});

describe("recherche de stuff", () => {
  const weights = { strength: 1, ap: 100, vitality: 0.2 };

  it("prend le meilleur objet par emplacement, sans dépasser le niveau", () => {
    const r = optimizeStuff({
      level: 100,
      weights,
      items: [
        item(1, "hat", { strength: 50 }),
        item(2, "hat", { strength: 80 }),
        item(3, "hat", { strength: 500 }, 150),
        item(4, "ring", { strength: 40 }),
        item(5, "ring", { strength: 30 }),
      ],
      sets: [],
    });
    expect(r.slots.hat).toBe(2);
    expect(new Set([r.slots.ring1, r.slots.ring2])).toEqual(new Set([4, 5]));
  });

  it("préfère une panoplie quand son bonus vaut plus que les objets seuls", () => {
    const set: DofusSet = {
      id: 10,
      name: "Panoplie",
      itemIds: [20, 21],
      bonuses: { 2: [{ stat: "strength", value: 100, text: "" }] },
    };
    const r = optimizeStuff({
      level: 200,
      weights,
      items: [
        item(1, "hat", { strength: 60 }),
        item(2, "cloak", { strength: 60 }),
        item(20, "hat", { strength: 30 }),
        item(21, "cloak", { strength: 30 }),
      ],
      sets: [set],
    });
    expect(r.slots).toMatchObject({ hat: 20, cloak: 21 });
  });

  it("plafonne les PA à 12", () => {
    const r = optimizeStuff({
      level: 200,
      weights,
      base: { ap: 7 },
      items: [
        ...[1, 2, 3, 4, 5].map((id) => item(id, "dofus", { ap: 1 })),
        item(6, "dofus", { ap: 1, strength: 1 }),
        item(7, "dofus", { strength: 40 }),
      ],
      sets: [],
    });
    expect(Object.values(r.slots)).toContain(7);
  });

  it("ne porte qu'une Prysmaradite", () => {
    const prysma = (id: number, strength: number) => ({
      ...item(id, "dofus", { strength }, 200),
      type: "Prysmaradite",
    });
    const r = optimizeStuff({
      level: 200,
      weights,
      items: [
        item(2, "ring", { strength: 20 }),
        prysma(3, 90),
        prysma(4, 80),
        item(5, "dofus", { strength: 10 }),
      ],
      sets: [],
    });
    const chosen = Object.values(r.slots);
    expect(chosen).toContain(3);
    expect(chosen).not.toContain(4);
  });
});

describe("dégâts d'un tour", () => {
  it("répartit les points de caractéristique", () => {
    expect(allocatePoints(200, ["strength"]).strength).toBe(398);
    const two = allocatePoints(200, ["strength", "agility"]);
    expect(Math.abs(two.strength - two.agility)).toBeLessThanOrEqual(1);
  });

  it("trouve le meilleur combo sous les PA, une variante par paire et les limites", () => {
    const spells = turnSpells(
      [
        spell(1, "fire", 30, 4, { maxCasts: 2 }), // 7,5 par PA, 2 lancers max
        spell(2, "fire", 20, 3), // 6,7 par PA
        spell(3, "fire", 100, 6, { variant: 2, maxCasts: 1 }), // variante de 2, 1 lancer
        spell(4, "air", 999, 2), // élément non choisi
      ],
      200,
      ["fire"],
      12,
    );
    const best = bestCombo(spells, 12, (s) => s.grade.lines[0]!.min);
    // Sort 3 (6 PA, 100) + sort 1 (4 PA, 30) = 130 ; deux sorts 1 + sort 2 ne font que 80.
    expect(best.damage).toBe(130);
    expect(best.picks.map((p) => p.spell.spell.id).sort()).toEqual([1, 3]);
  });

  it("choisit le stuff de l'élément joué et atteint les PA visés", () => {
    const r = optimizeTurnDamage({
      level: 200,
      elements: ["fire"],
      ap: 11,
      spells: [spell(1, "fire", 30, 3)],
      items: [
        item(1, "hat", { intelligence: 80 }),
        item(2, "hat", { agility: 120 }),
        item(3, "amulet", { ap: 1, intelligence: 10 }),
        item(4, "amulet", { intelligence: 90 }),
        item(5, "cloak", { ap: 1 }),
        item(6, "cloak", { intelligence: 100 }),
        item(7, "belt", { ap: 1 }),
        item(8, "belt", { intelligence: 120 }),
      ],
      sets: [],
    });
    expect(r.slots.hat).toBe(1);
    // 7 PA de base : il en faut 4 de plus, il n'y en a que 3 → les trois objets PA.
    expect(r.slots).toMatchObject({ amulet: 3, cloak: 5, belt: 7 });
    expect(r.points.intelligence).toBe(398);
  });

  it("compte l'exo PA : un objet PA de moins suffit pour 12 PA", () => {
    const items = [
      item(1, "hat", { ap: 1 }),
      item(2, "hat", { intelligence: 200 }),
      item(3, "cloak", { ap: 1 }),
      item(4, "cloak", { intelligence: 200 }),
      item(5, "belt", { ap: 1 }),
      item(6, "belt", { intelligence: 200 }),
      item(7, "boots", { ap: 1 }),
      item(8, "boots", { intelligence: 200 }),
      item(9, "amulet", { ap: 1 }),
      item(10, "amulet", { intelligence: 200 }),
    ];
    const common = {
      level: 200,
      elements: ["fire"] as const,
      ap: 12,
      spells: [spell(1, "fire", 30, 3)],
      items,
      sets: [],
    };
    const apItems = (slots: object) => Object.values(slots).filter((id) => id % 2 === 1).length;
    expect(apItems(optimizeTurnDamage(common).slots)).toBe(5);
    expect(apItems(optimizeTurnDamage({ ...common, exos: { ap: true } }).slots)).toBe(4);
  });

  it("écarte les objets de MJ de la liste et ceux marqués (MJ)", () => {
    const r = optimizeStuff({
      level: 200,
      weights: { strength: 1 },
      items: [
        { ...item(2155, "amulet", { strength: 300 }, 1), name: "Amulette de Jiva" },
        { ...item(2, "ring", { strength: 10 }, 20), name: "Anneau (MJ)" },
        item(3, "amulet", { strength: 50 }),
        // Malus énormes mais objet normal : autorisé.
        { ...item(841, "ring", { ap: 1, strength: -200 }, 8), name: "Anneau de Satisfaction" },
      ],
      sets: [],
    });
    // L'anneau de Satisfaction est autorisé, mais ses malus le rendent inutile ici.
    expect(r.slots).toEqual({ amulet: 3 });
    expect(isAllowedItem({ id: 841, name: "Anneau de Satisfaction" })).toBe(true);
    expect(isAllowedItem({ id: 8659, name: "Sangle Huée" })).toBe(true);
    expect(isAllowedItem({ id: 1, name: "Goultard Ankarton" })).toBe(false);
  });

  it("donne la part des éléments des sorts de la classe", () => {
    const shares = classElements([spell(1, "fire", 90, 3), spell(2, "air", 10, 3)], 50);
    expect(shares[0]).toEqual({ element: "fire", share: 0.9 });
  });
});

describe("meilleurs tours", () => {
  it("rend les 4 meilleures combinaisons distinctes, sans combinaison complétable", () => {
    const totals = Object.fromEntries(Object.keys(STATS).map((k) => [k, 0])) as StatTotals;
    const spells = turnSpells(
      [
        spell(1, "fire", 30, 4, { maxCasts: 2 }),
        spell(2, "fire", 20, 3),
        spell(3, "fire", 100, 6, { variant: 2, maxCasts: 1 }),
        spell(5, "fire", 9, 2, { maxCasts: 1 }),
      ],
      200,
      ["fire"],
      11,
    );
    const top = topCombos(totals, spells, 11);
    expect(top).toHaveLength(4);
    // Exhaustif : toutes les combinaisons maximales (aucun sort ne rentre en plus).
    const options = [
      [0, 1, 2].map((n) => ({ s: 1, n, ap: 4 * n, dmg: 30 * n })),
      [
        { s: 2, n: 0, ap: 0, dmg: 0 },
        ...[1, 2, 3].map((n) => ({ s: 2, n, ap: 3 * n, dmg: 20 * n })),
        { s: 3, n: 1, ap: 6, dmg: 100 },
      ],
      [0, 1].map((n) => ({ s: 5, n, ap: 2 * n, dmg: 9 * n })),
    ];
    const combos: number[] = [];
    for (const a of options[0]!)
      for (const b of options[1]!)
        for (const c of options[2]!) {
          const ap = a.ap + b.ap + c.ap;
          if (ap > 11 || ap === 0) continue;
          const left = 11 - ap;
          const canAdd =
            (a.n < 2 && left >= 4) ||
            (b.s === 2 && b.n < 3 && left >= 3) ||
            (b.n === 0 && left >= 3) ||
            (c.n < 1 && left >= 2);
          if (!canAdd) combos.push(a.dmg + b.dmg + c.dmg);
        }
    combos.sort((x, y) => y - x);
    expect(top.map((t) => t.damage)).toEqual(combos.slice(0, 4));
    expect(top[0]!.apUsed).toBeLessThanOrEqual(11);
  });
});
