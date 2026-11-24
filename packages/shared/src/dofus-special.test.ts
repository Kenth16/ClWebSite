import { describe, expect, it } from "vitest";
import { STATS, computeCharacter, computeSpellDamage, type StatTotals } from "./dofus";
import {
  LEGENDARY_POWERS,
  SPECIAL_EFFECTS,
  canBeLegendary,
  legendaryBuffs,
  specialBuffs,
  LEGENDARY_ITEM_IDS,
  scenarioBuffs,
  specialEffectOf,
} from "./dofus-special";
import { isAllowedItem } from "./dofus-optimizer";

const zeros = () =>
  ({ vitality: 0, wisdom: 0, strength: 0, intelligence: 0, chance: 0, agility: 0 }) as const;

describe("effets spéciaux des Dofus", () => {
  it("retrouve l'effet par l'identifiant de l'objet, pas par son nom", () => {
    expect(specialEffectOf({ id: 8698 })?.key).toBe("nebuleux");
    // Ancien Dofus Vulbis (niveau 100) : même nom, sans l'effet.
    expect(specialEffectOf({ id: 21186 })).toBeNull();
  });

  it("écarte les doublons sans effet, garde les vrais Dofus", () => {
    expect(isAllowedItem({ id: 21186, name: "Dofus Vulbis" })).toBe(false);
    expect(isAllowedItem({ id: 6980, name: "Dofus Vulbis" })).toBe(true);
    expect(isAllowedItem({ id: 29134, name: "Dofus Sylvestre" })).toBe(false);
    expect(isAllowedItem({ id: 20833, name: "Dofus Cacao" })).toBe(false);
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

describe("pouvoirs légendaires des familiers", () => {
  it("couvre les 32 croquettes infusées, clés et choix uniques", () => {
    expect(LEGENDARY_POWERS).toHaveLength(32);
    expect(new Set(LEGENDARY_POWERS.map((p) => p.key)).size).toBe(32);
    expect(new Set(LEGENDARY_POWERS.map((p) => p.spellId)).size).toBe(32);
    for (const p of LEGENDARY_POWERS) {
      const ids = p.choices.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of p.choices)
        for (const k of Object.keys(c.stats)) expect(k in STATS).toBe(true);
    }
  });

  it("applique le bonus de la situation choisie", () => {
    expect(legendaryBuffs("leg-bwork", { "leg-bwork": "contact" })).toEqual({ rangedDamagePct: 3 });
    expect(legendaryBuffs("leg-mulou", { "leg-mulou": "x3" })).toEqual({ finalDamagePct: 15 });
    expect(legendaryBuffs("leg-mulou", {})).toEqual({});
    expect(legendaryBuffs(null, {})).toEqual({});
  });

  it("seuls les familiers et montiliers peuvent être légendaires", () => {
    expect(canBeLegendary({ type: "Familier" })).toBe(true);
    expect(canBeLegendary({ type: "Montilier" })).toBe(true);
    expect(canBeLegendary({ type: "Dragodinde" })).toBe(false);
  });
});

describe("équipements légendaires", () => {
  it("sont reconnus par leur identifiant et donnent le bonus choisi", () => {
    expect(specialEffectOf({ id: 20360 })?.key).toBe("ganymede");
    expect(specialBuffs([{ id: 20360 }], { ganymede: "even" })).toEqual({ ap: 2 });
    expect(specialBuffs([{ id: 20362 }], { jahash: "fire3" })).toEqual({ fireResPct: 12 });
    expect(specialBuffs([{ id: 32121 }], { meriana: "ap2" })).toEqual({ apReduction: 10 });
    expect(specialBuffs([{ id: 32117 }], { thanatena: "aura" })).toEqual({ finalDamagePct: 4 });
    expect(LEGENDARY_ITEM_IDS.has(20362)).toBe(true); // Jahash
    expect(LEGENDARY_ITEM_IDS.has(20353)).toBe(true); // Crocobur
    expect(LEGENDARY_ITEM_IDS.has(32121)).toBe(true); // Mériana
    expect(LEGENDARY_ITEM_IDS.has(SPECIAL_EFFECTS[0]!.id)).toBe(false); // un Dofus
    expect(specialBuffs([{ id: 32117 }], { thanatena: "kill-only" })).toEqual({
      finalDamagePct: 10,
    });
    expect(specialBuffs([{ id: 32117 }], { thanatena: "kill" })).toEqual({ finalDamagePct: 14 });
    // Sans effet sur les caractéristiques : reconnu, mais aucun choix.
    expect(specialEffectOf({ id: 20353 })?.choices).toEqual([]);
  });

  it("chaque objet n'apparaît qu'une fois dans la table", () => {
    const ids = SPECIAL_EFFECTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = SPECIAL_EFFECTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("situation de l'optimiseur", () => {
  const ids = [7754, 6980, 20358, 32114, 32163, 20359, 8698].map((id) => ({ id }));

  it("compte Vulbis, Trompe-la-Mort, Oto Mustam et Amayiro au maximum", () => {
    const buffs = scenarioBuffs(ids);
    expect(buffs.get(6980)).toEqual({ finalDamagePct: 10 });
    expect(buffs.get(20358)).toEqual({ finalDamagePct: 7 });
    expect(buffs.get(32114)).toEqual({ finalDamagePct: 4 });
    expect(buffs.get(32163)?.fireResPct).toBe(4);
    // Combat court : la Couronne de Brâm (cumuls) ne donne rien.
    expect(buffs.has(20359)).toBe(false);
  });

  it("tour impair, pair ou moyenne pour le Nébuleux", () => {
    const at = (turn: "odd" | "even" | "average") =>
      scenarioBuffs(ids, { turn, fight: "short" }).get(8698);
    expect(at("odd")).toEqual({ finalDamagePct: 20 });
    expect(at("even")).toEqual({ finalDamagePct: -10 });
    expect(at("average")).toEqual({ finalDamagePct: 5 });
  });

  it("combat long : cumuls au maximum", () => {
    const buffs = scenarioBuffs(ids, { turn: "odd", fight: "long" });
    expect(buffs.get(20359)).toEqual({ finalDamagePct: 10 });
  });
});
