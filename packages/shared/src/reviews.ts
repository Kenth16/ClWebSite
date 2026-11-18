import { z } from "zod";
import type { PublicUser } from "./friends";

/**
 * « Avis désastreux » : grille de notation d'un jeu vidéo.
 * Chaque critère est noté sur 10 puis pondéré ; la somme des poids fait 100.
 */
export const REVIEW_CRITERIA = [
  {
    key: "gameplay",
    label: "Gameplay et mécaniques",
    description: "Prise en main, profondeur, sensations, variété et précision.",
    weight: 20,
  },
  {
    key: "story",
    label: "Scénario et narration",
    description: "Qualité de l'histoire, dialogues, personnages et cohérence.",
    weight: 15,
  },
  {
    key: "art",
    label: "Direction artistique",
    description: "Identité visuelle, décors, animations et style graphique.",
    weight: 10,
  },
  {
    key: "audio",
    label: "Bande-son et doublage",
    description: "Musiques, bruitages, ambiance sonore et interprétation.",
    weight: 10,
  },
  {
    key: "levelDesign",
    label: "Level design",
    description: "Conception des niveaux, exploration et rythme.",
    weight: 10,
  },
  {
    key: "technical",
    label: "Technique et performances",
    description: "Fluidité, bugs, stabilité, optimisation et qualité technique.",
    weight: 10,
  },
  {
    key: "content",
    label: "Contenu et durée de vie",
    description: "Richesse du contenu, rejouabilité et rapport durée/expérience.",
    weight: 10,
  },
  {
    key: "originality",
    label: "Originalité et créativité",
    description: "Prise de risques, innovations et propositions nouvelles.",
    weight: 5,
  },
  {
    key: "ergonomics",
    label: "Ergonomie et accessibilité",
    description: "Interface, menus, lisibilité et options d'accessibilité.",
    weight: 5,
  },
  {
    key: "emotion",
    label: "Émotion et immersion",
    description: "Capacité à captiver, surprendre et marquer le joueur.",
    weight: 5,
  },
] as const;

export type CriterionKey = (typeof REVIEW_CRITERIA)[number]["key"];
export type ReviewScores = Record<CriterionKey, number>;

/** Barème d'appréciation d'une note sur 10. */
export const GRADE_SCALE = [
  { min: 0, max: 2, label: "Catastrophique" },
  { min: 3, max: 4, label: "Médiocre" },
  { min: 5, max: 6, label: "Correct" },
  { min: 7, max: 7, label: "Bon" },
  { min: 8, max: 8, label: "Très bon" },
  { min: 9, max: 9, label: "Excellent" },
  { min: 10, max: 10, label: "Exceptionnel" },
] as const;

/** Appréciation d'une note sur 10 (une note décimale est arrondie à l'inférieur). */
export function gradeLabel(scoreOutOf10: number): string {
  const n = Math.min(10, Math.max(0, Math.floor(scoreOutOf10)));
  return GRADE_SCALE.find((g) => n >= g.min && n <= g.max)?.label ?? "";
}

/** Points obtenus pour un critère : note/10 × poids. */
export function criterionPoints(score: number, weight: number): number {
  return (score / 10) * weight;
}

/** Note globale sur 100, arrondie au dixième. */
export function totalScore(scores: ReviewScores): number {
  const sum = REVIEW_CRITERIA.reduce((acc, c) => acc + criterionPoints(scores[c.key], c.weight), 0);
  return Math.round(sum * 10) / 10;
}

const scoreSchema = z
  .number("Note manquante.")
  .int("La note doit être un nombre entier.")
  .min(0, "La note doit être comprise entre 0 et 10.")
  .max(10, "La note doit être comprise entre 0 et 10.");

export const reviewScoresSchema = z.object(
  Object.fromEntries(REVIEW_CRITERIA.map((c) => [c.key, scoreSchema])) as Record<
    CriterionKey,
    typeof scoreSchema
  >,
  "Notes manquantes.",
);

export const REVIEW_COMMENT_MAX = 2000;

export const reviewInputSchema = z.object({
  scores: reviewScoresSchema,
  comment: z
    .string()
    .trim()
    .max(
      REVIEW_COMMENT_MAX,
      `Le commentaire doit contenir au plus ${REVIEW_COMMENT_MAX} caractères.`,
    )
    .optional()
    .default(""),
});
export type ReviewInput = z.input<typeof reviewInputSchema>;

export const GAME_TITLE_MAX = 120;

export const gameInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Saisissez le titre du jeu.")
    .max(GAME_TITLE_MAX, `Le titre doit contenir au plus ${GAME_TITLE_MAX} caractères.`),
});

export interface GameSummary {
  id: string;
  title: string;
  reviewCount: number;
  /** Moyenne des notes globales sur 100, ou null sans avis. */
  average: number | null;
  /** Date du dernier avis (ou de l'ajout du jeu). */
  lastActivityAt: string;
  /** L'utilisateur connecté a-t-il déjà noté ce jeu ? */
  reviewedByMe: boolean;
}

export interface GameReview {
  id: string;
  user: PublicUser;
  scores: ReviewScores;
  total: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameDetail {
  game: { id: string; title: string; createdAt: string };
  reviewCount: number;
  average: number | null;
  /** Moyenne de chaque critère, sur 10 (null sans avis). */
  criteriaAverages: Record<CriterionKey, number> | null;
  reviews: GameReview[];
  myReview: GameReview | null;
}
