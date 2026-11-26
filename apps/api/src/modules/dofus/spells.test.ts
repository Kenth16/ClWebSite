import { describe, expect, it } from "vitest";
import { DofusDbClient, appliesOnCast, buffLines, normalizeGrade, spellCharges } from "./spells";

function level(id: number, spellId: number, grade: number, minPlayerLevel: number) {
  return {
    id,
    spellId,
    grade,
    minPlayerLevel,
    apCost: 3,
    minRange: 1,
    range: 6,
    criticalHitProbability: 10,
    effects: [
      { effectId: 1079, diceNum: 2, diceSide: 0 },
      { effectId: 96, diceNum: 12 + grade, diceSide: 14 + grade },
      { effectId: 94, diceNum: 5, diceSide: 0 },
    ],
    criticalEffect: [{ effectId: 96, diceNum: 15, diceSide: 17 }],
  };
}

describe("sorts Dofus (DofusDB)", () => {
  it("assemble les sorts d'une classe, pagine les grades et garde les lignes de dégâts", async () => {
    const urls: string[] = [];
    // 60 grades au total : deux pages de grades sont nécessaires.
    const spellLevels = Array.from({ length: 60 }, (_, i) => 1000 + i);
    const client = new DofusDbClient({
      baseUrl: "https://dofusdb.test",
      fetch: (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        urls.push(url);
        const json = (body: unknown) => new Response(JSON.stringify(body));
        if (url.includes("/spell-variants")) {
          return json({
            total: 1,
            data: [
              {
                id: 693,
                spells: [{ id: 1, name: { fr: "Flèche Glacée" }, img: "glacee.png", spellLevels }],
              },
            ],
          });
        }
        const ids = [...url.matchAll(/id\[\$in\]\[\]=(\d+)/g)].map((m) => Number(m[1]));
        return json({ total: ids.length, data: ids.map((id, i) => level(id, 1, (id % 3) + 1, i)) });
      }) as typeof fetch,
    });

    const spells = await client.spells(9);
    expect(urls.filter((u) => u.includes("/spell-levels"))).toHaveLength(2);
    expect(spells).toHaveLength(1);
    const grade = spells[0]!.grades[0]!;
    expect(grade.lines).toEqual([
      { element: "water", kind: "damage", min: grade.grade + 12, max: grade.grade + 14 },
      { element: "fire", kind: "steal", min: 5, max: 5 },
    ]);
    expect(grade.criticalLines).toEqual([{ element: "water", kind: "damage", min: 15, max: 17 }]);
    // Deuxième appel : servi par le cache.
    await client.spells(9);
    expect(urls.filter((u) => u.includes("/spell-variants"))).toHaveLength(1);
  });

  it("ne garde que les dégâts du lancer sur la cible, sans condition", () => {
    const hit = { effectId: 99, diceNum: 10, diceSide: 12 };
    expect(appliesOnCast({ ...hit, targetMask: "a,A", triggers: "I" })).toBe(true);
    expect(appliesOnCast({ ...hit, targetMask: "A,e573" })).toBe(true); // « pas dans l'état »
    expect(appliesOnCast({ ...hit, targetMask: "A,E573" })).toBe(false); // exige un état
    expect(appliesOnCast({ ...hit, targetMask: "g" })).toBe(false); // ne vise pas d'ennemi
    expect(appliesOnCast({ ...hit, delay: 3 })).toBe(false);
    expect(appliesOnCast({ ...hit, triggers: "TE" })).toBe(false);
    expect(appliesOnCast({ ...hit, zoneDescr: { shape: 67, param2: 1 } })).toBe(false);
  });

  it("calcule les lancers possibles par tour", () => {
    const base = {
      id: 1,
      spellId: 1,
      grade: 1,
      minPlayerLevel: 1,
      apCost: 3,
      minRange: 1,
      range: 6,
      criticalHitProbability: 5,
      effects: [],
    };
    expect(
      normalizeGrade({ ...base, maxCastPerTurn: 3, maxCastPerTarget: 2 }).maxCastsPerTurn,
    ).toBe(2);
    expect(normalizeGrade({ ...base, minCastInterval: 2, maxCastPerTurn: 3 }).maxCastsPerTurn).toBe(
      1,
    );
    expect(normalizeGrade(base).maxCastsPerTurn).toBeNull();
  });

  it("garde les dégâts sous condition seulement si le sort n'a aucun dégât direct", () => {
    const base = {
      id: 1,
      spellId: 1,
      grade: 1,
      minPlayerLevel: 1,
      apCost: 3,
      minRange: 1,
      range: 6,
      criticalHitProbability: 5,
    };
    const ring = { effectId: 98, diceNum: 24, diceSide: 28, zoneDescr: { shape: 79 } };
    const direct = { effectId: 97, diceNum: 10, diceSide: 12, targetMask: "A" };
    const ally = { effectId: 99, diceNum: 5, diceSide: 6, targetMask: "g" };
    const poison = { effectId: 99, diceNum: 7, diceSide: 8, triggers: "TB" };

    // Anneau seul (type Anneau Destructeur) : la ligne apparaît, repérée « zone ».
    expect(normalizeGrade({ ...base, effects: [ring] }).lines).toEqual([
      { element: "air", kind: "damage", min: 24, max: 28, condition: "zone" },
    ]);
    // Avec un dégât direct, la zone est écartée comme avant.
    expect(normalizeGrade({ ...base, effects: [direct, ring] }).lines).toEqual([
      { element: "earth", kind: "damage", min: 10, max: 12 },
    ]);
    // Poison seul : repéré « déclenché » ; dégâts sur un allié : jamais comptés.
    expect(normalizeGrade({ ...base, effects: [poison, ally] }).lines).toEqual([
      { element: "fire", kind: "damage", min: 7, max: 8, condition: "triggered" },
    ]);
  });

  describe("charges et boosts", () => {
    const base = {
      id: 1,
      grade: 1,
      minPlayerLevel: 1,
      apCost: 3,
      minRange: 0,
      range: 4,
      criticalHitProbability: 10,
    };
    const boost = (spell: number, value: number, extra = {}) => ({
      effectId: 293,
      diceNum: spell,
      diceSide: 0,
      value,
      duration: 3,
      targetMask: "c",
      triggers: "I",
      ...extra,
    });

    it("lit les charges d'un sort qui se renforce lui-même (Accumulation)", () => {
      const hit = { effectId: 97, diceNum: 19, diceSide: 22, targetMask: "g,A", triggers: "I" };
      const grade = normalizeGrade({
        ...base,
        spellId: 13138,
        maxStack: 1,
        effects: [hit, boost(13138, 20)],
      });
      expect(grade.charges).toEqual({ steps: [{ at: 1, bonus: 20 }], unit: "charge" });
      expect(grade.lines).toEqual([{ element: "earth", kind: "damage", min: 19, max: 22 }]);
    });

    it("liste quelques charges quand le cumul est illimité", () => {
      const raw = {
        ...base,
        spellId: 7,
        maxStack: -1,
        effects: [boost(7, 18, { targetMask: "C" })],
      };
      expect(spellCharges(raw)).toEqual({
        steps: [18, 36, 54, 72, 90].map((bonus, i) => ({ at: i + 1, bonus })),
        unit: "charge",
        unlimited: true,
      });
    });

    it("cumule les bonus différés tour par tour (Flèche Punitive)", () => {
      const raw = {
        ...base,
        spellId: 8,
        maxStack: 1,
        effects: [boost(8, 17, { delay: 1 }), boost(8, 25, { delay: 2 })],
      };
      expect(spellCharges(raw)).toEqual({
        steps: [
          { at: 1, bonus: 17 },
          { at: 2, bonus: 42 },
        ],
        unit: "turn",
      });
    });

    it("ne garde que les paliers d'attente qui apportent un bonus (Colère de Iop)", () => {
      const raw = { ...base, spellId: 6, maxStack: 1, effects: [boost(6, 110, { delay: 3 })] };
      expect(spellCharges(raw)).toEqual({ steps: [{ at: 3, bonus: 110 }], unit: "turn" });
    });

    it("ignore les bonus vers un autre sort ou sous état", () => {
      const raw = (effects: ReturnType<typeof boost>[]) => ({
        ...base,
        spellId: 9,
        maxStack: 1,
        effects,
      });
      expect(spellCharges(raw([boost(10, 20)]))).toBeNull();
      expect(spellCharges(raw([boost(9, 6, { targetMask: "C,*E498" })]))).toBeNull();
      expect(spellCharges(raw([boost(9, 3, { triggers: "TB" })]))).toBeNull();
    });

    it("lit les boosts de caractéristiques pour le lanceur et les alliés (Puissance)", () => {
      expect(
        buffLines([
          {
            effectId: 138,
            diceNum: 300,
            diceSide: 0,
            duration: 3,
            targetMask: "a,A",
            triggers: "I",
          },
          {
            effectId: 414,
            diceNum: 120,
            diceSide: 0,
            duration: 3,
            targetMask: "a,A",
            triggers: "I",
          },
          { effectId: 97, diceNum: 10, diceSide: 12, targetMask: "A" },
        ]),
      ).toEqual([
        { stat: "power", min: 300, max: 300, duration: 3 },
        { stat: "pushbackDamage", min: 120, max: 120, duration: 3 },
      ]);
    });

    it("repère les boosts sous condition et écarte ceux qui ne visent que des ennemis", () => {
      expect(
        buffLines([
          { effectId: 118, diceNum: 200, diceSide: 0, duration: 2, targetMask: "C,E5262" },
          { effectId: 138, diceNum: 150, diceSide: 0, duration: 1, targetMask: "a", delay: 1 },
          { effectId: 128, diceNum: 1, diceSide: 0, duration: 1, targetMask: "A" },
          { effectId: 115, diceNum: 3, diceSide: 18, duration: 3, targetMask: "C" },
        ]),
      ).toEqual([
        { stat: "strength", min: 200, max: 200, duration: 2, condition: "conditional" },
        { stat: "power", min: 150, max: 150, duration: 1, condition: "delayed" },
        { stat: "critical", min: 3, max: 18, duration: 3 },
      ]);
    });
  });

  it("cherche les monstres sans tenir compte des majuscules et lit leurs résistances", async () => {
    const urls: string[] = [];
    const client = new DofusDbClient({
      baseUrl: "https://dofusdb.test",
      fetch: (async (input: string | URL | Request) => {
        urls.push(decodeURIComponent(String(input)));
        return new Response(
          JSON.stringify({
            total: 2,
            data: [
              {
                id: 36,
                name: { fr: "Bouftou" },
                gfxId: 3,
                isBoss: false,
                grades: [
                  {
                    grade: 1,
                    level: 1,
                    lifePoints: 29,
                    reductionFire: -12,
                    reductionNeutral: 25,
                    reductionEarthFlat: 3,
                    criticalDamageReduction: 2,
                    pushDamageReduction: 1,
                  },
                ],
              },
              { id: 37, name: { fr: "Caché" }, hideInBestiary: true, grades: [{ grade: 1 }] },
            ],
          }),
        );
      }) as typeof fetch,
    });
    const monsters = await client.monsters("bouf(t");
    expect(urls[0]).toContain("name.fr[$regex]=(?i)bouf\\(t");
    expect(monsters).toHaveLength(1);
    expect(monsters[0]!.icon).toBe("https://dofusdb.test/img/monsters/3.png");
    expect(monsters[0]!.grades[0]).toEqual({
      grade: 1,
      level: 1,
      hp: 29,
      resistances: {
        pct: { neutral: 25, earth: 0, fire: -12, water: 0, air: 0 },
        flat: { neutral: 0, earth: 3, fire: 0, water: 0, air: 0 },
        critical: 2,
      },
      pushback: 1,
    });
  });
});
