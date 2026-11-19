import { describe, expect, it } from "vitest";
import { DofusDbClient } from "./spells";

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
});
