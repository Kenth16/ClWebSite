/**
 * Moteur du jeu de calcul mental « Chute d'orbes » : génération des opérations,
 * progression de la difficulté et calcul des points. Logique pure, sans
 * affichage, pour pouvoir être testée unitairement.
 */

export type Operator = "+" | "−" | "×" | "÷";

export interface Problem {
  a: number;
  b: number;
  operator: Operator;
  answer: number;
}

export interface LevelConfig {
  operators: Operator[];
  /** Plus grand opérande pour l'addition et la soustraction. */
  addMax: number;
  /** Plus grande table de multiplication / division. */
  tableMax: number;
  /** Durée de la chute d'un orbe, du haut jusqu'au sol (ms). */
  fallMs: number;
  /** Délai entre deux apparitions d'orbes (ms). */
  spawnMs: number;
  /** Nombre maximal d'orbes à l'écran en même temps. */
  maxOrbs: number;
}

export const LIVES = 3;
/** Bonnes réponses nécessaires pour passer au niveau suivant. */
export const ANSWERS_PER_LEVEL = 8;

export function levelConfig(level: number): LevelConfig {
  const n = Math.max(1, Math.floor(level));
  const operators: Operator[] = ["+"];
  if (n >= 2) operators.push("−");
  if (n >= 4) operators.push("×");
  if (n >= 6) operators.push("÷");
  return {
    operators,
    addMax: Math.min(10 + (n - 1) * 8, 99),
    tableMax: Math.min(5 + Math.max(0, n - 4), 12),
    fallMs: Math.round(Math.max(4500, 12000 * 0.92 ** (n - 1))),
    spawnMs: Math.round(Math.max(1100, 3400 * 0.92 ** (n - 1))),
    maxOrbs: Math.min(6, 2 + Math.floor(n / 2)),
  };
}

export function levelFor(correctAnswers: number): number {
  return 1 + Math.floor(correctAnswers / ANSWERS_PER_LEVEL);
}

const randInt = (min: number, max: number, random: () => number) =>
  min + Math.floor(random() * (max - min + 1));

/** Tire une opération adaptée au niveau. Le résultat est toujours un entier positif ou nul. */
export function generateProblem(level: number, random: () => number = Math.random): Problem {
  const config = levelConfig(level);
  const operator = config.operators[Math.floor(random() * config.operators.length)] ?? "+";
  switch (operator) {
    case "+": {
      const a = randInt(1, config.addMax, random);
      const b = randInt(1, config.addMax, random);
      return { a, b, operator, answer: a + b };
    }
    case "−": {
      const a = randInt(2, config.addMax, random);
      const b = randInt(1, a, random);
      return { a, b, operator, answer: a - b };
    }
    case "×": {
      const a = randInt(2, config.tableMax, random);
      const b = randInt(2, config.tableMax, random);
      return { a, b, operator, answer: a * b };
    }
    case "÷": {
      const b = randInt(2, config.tableMax, random);
      const answer = randInt(2, config.tableMax, random);
      return { a: b * answer, b, operator, answer };
    }
  }
}

export function problemText({ a, b, operator }: Problem): string {
  return `${a} ${operator} ${b}`;
}

/**
 * Points d'une bonne réponse : base selon le niveau, bonus de rapidité (plus
 * l'orbe est haut, plus il rapporte), bonus de série, et triple pour un orbe doré.
 * @param progress avancée de la chute, de 0 (en haut) à 1 (au sol).
 */
export function pointsFor({
  level,
  progress,
  streak,
  golden,
}: {
  level: number;
  progress: number;
  streak: number;
  golden: boolean;
}): number {
  const base = 10 * level;
  const speed = Math.round(base * (1 - Math.min(1, Math.max(0, progress))));
  const series = 5 * Math.min(streak, 10);
  return (base + speed + series) * (golden ? 3 : 1);
}
