import { describe, expect, it } from "vitest";
import { criteriaMet, parseCriteria, simplifyCriteria } from "./dofus-criteria";

describe("conditions des objets", () => {
  it("décode caractéristiques, panoplies et ignore le reste", () => {
    expect(parseCriteria("CP<12&CM<6&CW>99")).toEqual({
      kind: "and",
      children: [
        { kind: "stat", stat: "ap", op: "<", value: 12 },
        { kind: "stat", stat: "mp", op: "<", value: 6 },
        { kind: "stat", stat: "wisdom", op: ">", value: 99 },
      ],
    });
    expect(parseCriteria("pk<2")).toEqual({ kind: "sets", op: "<", value: 2 });
    // Alignement, quêtes… : ignorés.
    expect(parseCriteria("Ps=1&Pa>20")).toBeNull();
    expect(parseCriteria("PN~Silaisie&BI=1")).toBeNull();
    // Un « ou » avec une branche ignorée est toujours rempli.
    expect(parseCriteria("CS>10|Qa=166")).toBeNull();
    expect(parseCriteria("(CS>99|CI>99)&CP<12")).toEqual({
      kind: "and",
      children: [
        {
          kind: "or",
          children: [
            { kind: "stat", stat: "strength", op: ">", value: 99 },
            { kind: "stat", stat: "intelligence", op: ">", value: 99 },
          ],
        },
        { kind: "stat", stat: "ap", op: "<", value: 12 },
      ],
    });
  });

  it("évalue la classe et les conditions", () => {
    const tree = parseCriteria("PG=6&PS=0")!;
    expect(simplifyCriteria(tree, { breedId: 6 })).toBeNull();
    expect(simplifyCriteria(tree, { breedId: 9 })).toEqual({ kind: "false" });
    const ap = parseCriteria("CP<12")!;
    expect(criteriaMet(ap, { total: () => 11, activeSets: 0 })).toBe(true);
    expect(criteriaMet(ap, { total: () => 12, activeSets: 0 })).toBe(false);
    const sets = parseCriteria("pk<2")!;
    expect(criteriaMet(sets, { total: () => 0, activeSets: 1 })).toBe(true);
    expect(criteriaMet(sets, { total: () => 0, activeSets: 2 })).toBe(false);
  });
});
