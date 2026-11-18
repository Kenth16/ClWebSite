import { describe, expect, it } from "vitest";
import {
  REVIEW_CRITERIA,
  gradeLabel,
  reviewInputSchema,
  totalScore,
  type ReviewScores,
} from "./reviews";

const all = (n: number) =>
  Object.fromEntries(REVIEW_CRITERIA.map((c) => [c.key, n])) as ReviewScores;

describe("avis désastreux — barème", () => {
  it("répartit 100 points entre les critères", () => {
    expect(REVIEW_CRITERIA.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("calcule la note globale sur 100", () => {
    expect(totalScore(all(0))).toBe(0);
    expect(totalScore(all(10))).toBe(100);
    expect(totalScore(all(7))).toBe(70);
    // 7/10 × 20 + 3/10 × 15 + 0 ailleurs = 14 + 4,5
    expect(totalScore({ ...all(0), gameplay: 7, story: 3 })).toBe(18.5);
  });

  it("donne l'appréciation d'une note", () => {
    expect(gradeLabel(0)).toBe("Catastrophique");
    expect(gradeLabel(2.9)).toBe("Catastrophique");
    expect(gradeLabel(4)).toBe("Médiocre");
    expect(gradeLabel(6)).toBe("Correct");
    expect(gradeLabel(7)).toBe("Bon");
    expect(gradeLabel(8)).toBe("Très bon");
    expect(gradeLabel(9)).toBe("Excellent");
    expect(gradeLabel(10)).toBe("Exceptionnel");
  });

  it("exige une note entière de 0 à 10 pour chaque critère", () => {
    expect(reviewInputSchema.safeParse({ scores: all(5) }).success).toBe(true);
    expect(reviewInputSchema.safeParse({ scores: { ...all(5), gameplay: 11 } }).success).toBe(
      false,
    );
    expect(reviewInputSchema.safeParse({ scores: { ...all(5), story: 6.5 } }).success).toBe(false);
    const missing: Partial<ReviewScores> = all(5);
    delete missing.gameplay;
    expect(reviewInputSchema.safeParse({ scores: missing }).success).toBe(false);
  });
});
