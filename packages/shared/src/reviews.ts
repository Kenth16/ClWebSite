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

/** Ajout d'un jeu à partir du catalogue RAWG. */
export const gameInputSchema = z.object({
  rawgId: z.number("Jeu manquant.").int().positive("Jeu inconnu."),
});

/** Informations d'un jeu issues du catalogue. */
export interface GameInfo {
  title: string;
  /** Image de couverture (paysage), ou null. */
  cover: string | null;
  /** Date de sortie (AAAA-MM-JJ), ou null si inconnue / à venir. */
  released: string | null;
  platforms: string[];
  genres: string[];
}

/** Jeu du catalogue RAWG, éventuellement déjà présent dans Avis désastreux. */
export interface CatalogGame extends GameInfo {
  rawgId: number;
  /** Identifiant Kenpai si le jeu a déjà été ajouté, sinon null. */
  gameId: string | null;
  reviewCount: number;
  average: number | null;
}

export interface GameSummary extends GameInfo {
  id: string;
  reviewCount: number;
  /** Moyenne des notes globales sur 100, ou null sans avis. */
  average: number | null;
  /** Date du dernier avis (ou de l'ajout du jeu). */
  lastActivityAt: string;
  /** L'utilisateur connecté a-t-il déjà noté ce jeu ? */
  reviewedByMe: boolean;
  /** Dernier avis publié sur ce jeu. */
  lastReview: { user: PublicUser; total: number; at: string } | null;
}

/** Un avis récent, avec le jeu concerné (accueil : « Derniers avis de la commu »). */
export interface LatestReview {
  id: string;
  game: GameInfo & { id: string };
  user: PublicUser;
  total: number;
  comment: string;
  /** Date de publication ou de dernière modification. */
  at: string;
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
  game: GameInfo & { id: string; createdAt: string };
  reviewCount: number;
  average: number | null;
  /** Moyenne de chaque critère, sur 10 (null sans avis). */
  criteriaAverages: Record<CriterionKey, number> | null;
  reviews: GameReview[];
  myReview: GameReview | null;
}
