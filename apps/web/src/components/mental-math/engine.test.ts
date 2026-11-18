import { describe, expect, it } from "vitest";
import { generateProblem, levelConfig, levelFor, pointsFor, problemText } from "./engine";

/** Générateur pseudo-aléatoire reproductible. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe("chute d'orbes — moteur", () => {
  it("produit des opérations justes, entières et positives à tous les niveaux", () => {
    const random = seeded(42);
    for (let level = 1; level <= 20; level++) {
      const config = levelConfig(level);
      for (let i = 0; i < 300; i++) {
        const p = generateProblem(level, random);
        expect(config.operators).toContain(p.operator);
        expect(Number.isInteger(p.answer)).toBe(true);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        const expected = {
          "+": p.a + p.b,
          "−": p.a - p.b,
          "×": p.a * p.b,
          "÷": p.a / p.b,
        }[p.operator];
        expect(p.answer, problemText(p)).toBe(expected);
      }
    }
  });

  it("introduit les opérations progressivement", () => {
    expect(levelConfig(1).operators).toEqual(["+"]);
    expect(levelConfig(2).operators).toEqual(["+", "−"]);
    expect(levelConfig(4).operators).toEqual(["+", "−", "×"]);
    expect(levelConfig(6).operators).toEqual(["+", "−", "×", "÷"]);
  });

  it("accélère avec le niveau, sans dépasser des limites jouables", () => {
    expect(levelConfig(5).fallMs).toBeLessThan(levelConfig(1).fallMs);
    expect(levelConfig(5).spawnMs).toBeLessThan(levelConfig(1).spawnMs);
    expect(levelConfig(99).fallMs).toBe(4500);
    expect(levelConfig(99).spawnMs).toBe(1100);
    expect(levelConfig(99).maxOrbs).toBe(6);
  });

  it("change de niveau toutes les 8 bonnes réponses", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(7)).toBe(1);
    expect(levelFor(8)).toBe(2);
    expect(levelFor(16)).toBe(3);
  });

  it("récompense la rapidité, les séries et les orbes dorés", () => {
    const slow = pointsFor({ level: 1, progress: 1, streak: 0, golden: false });
    const fast = pointsFor({ level: 1, progress: 0, streak: 0, golden: false });
    expect(slow).toBe(10);
    expect(fast).toBe(20);
    expect(pointsFor({ level: 1, progress: 1, streak: 4, golden: false })).toBe(30);
    expect(pointsFor({ level: 1, progress: 1, streak: 0, golden: true })).toBe(30);
  });
});
