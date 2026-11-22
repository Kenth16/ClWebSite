/**
 * Effets spéciaux (sorts passifs) des Dofus qui changent les caractéristiques
 * selon la situation du combat. Le joueur choisit la situation à simuler
 * (« tour impair », « pas attaqué », nombre de cumuls…) ou « Rien ».
 */
import { z } from "zod";
import type { StatKey } from "./dofus";

export interface SpecialChoice {
  id: string;
  label: string;
  stats: Partial<Record<StatKey, number>>;
}

export interface SpecialEffect {
  /** Identifiant stable (enregistré avec le stuff). */
  key: string;
  /**
   * Identifiant de l'objet (DofusDude). Par identifiant et non par nom : certains
   * objets portent le même nom sans avoir l'effet (ancien Dofus Vulbis niveau 100…).
   */
  id: number;
  /** Nom de l'objet, pour mémoire. */
  name: string;
  /** Nom du sort passif. */
  spell: string;
  /** Rappel de l'effet, en une phrase. */
  summary: string;
  /** Question posée au joueur. */
  question: string;
  choices: readonly SpecialChoice[];
}

/** Choix « Rien » : aucun bonus. */
export const SPECIAL_NONE = "none";

/** Cumuls 1 à `max` : un choix par nombre de cumuls. */
const stacks = (
  max: number,
  label: (n: number) => string,
  stats: (n: number) => Partial<Record<StatKey, number>>,
  prefix = "x",
): SpecialChoice[] =>
  Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
    id: `${prefix}${n}`,
    label: label(n),
    stats: stats(n),
  }));

export const SPECIAL_EFFECTS: readonly SpecialEffect[] = [
  // ── Situations exclusives ────────────────────────────────────────────────
  {
    key: "nebuleux",
    id: 8698,
    name: "Dofus Nébuleux",
    spell: "Rêve Nébuleux",
    summary: "Tours impairs : +20 % dommages finaux. Tours pairs : −10 % dommages finaux.",
    question: "Quel tour simuler ?",
    choices: [
      { id: "odd", label: "Tour impair : +20 % dommages finaux", stats: { finalDamagePct: 20 } },
      { id: "even", label: "Tour pair : −10 % dommages finaux", stats: { finalDamagePct: -10 } },
    ],
  },
  {
    key: "vulbis",
    id: 6980,
    name: "Dofus Vulbis",
    spell: "Rouge Vermeil",
    summary: "Pas attaqué depuis son tour : +10 % dommages finaux. Sinon : +20 Tacle.",
    question: "Le porteur a-t-il été attaqué depuis son dernier tour ?",
    choices: [
      { id: "safe", label: "Pas attaqué : +10 % dommages finaux", stats: { finalDamagePct: 10 } },
      { id: "hit", label: "Attaqué : +20 Tacle", stats: { lock: 20 } },
    ],
  },
  {
    key: "ocre",
    id: 7754,
    name: "Dofus Ocre",
    spell: "Jaune Ocre",
    summary: "Pas attaqué depuis son tour : +1 PA (au-delà de 12). Sinon : +20 Fuite.",
    question: "Le porteur a-t-il été attaqué depuis son dernier tour ?",
    choices: [
      { id: "safe", label: "Pas attaqué : +1 PA", stats: { ap: 1 } },
      { id: "hit", label: "Attaqué : +20 Fuite", stats: { dodge: 20 } },
    ],
  },
  {
    key: "abyssal",
    id: 18043,
    name: "Dofus Abyssal",
    spell: "Descente aux Abysses",
    summary: "Début de tour : +1 PM sans ennemi au contact, sinon +1 PA.",
    question: "Un ennemi est-il au contact en début de tour ?",
    choices: [
      { id: "alone", label: "Aucun ennemi au contact : +1 PM", stats: { mp: 1 } },
      { id: "contact", label: "Ennemi au contact : +1 PA", stats: { ap: 1 } },
    ],
  },
  {
    key: "argente-scintillant",
    id: 20286,
    name: "Dofus Argenté Scintillant",
    spell: "Promesse d'Argent",
    summary: "Sous 20 % de vie : soin de 30 % et +20 % dommages finaux pendant 1 tour (1 fois).",
    question: "Le porteur est-il passé sous 20 % de vie ?",
    choices: [
      {
        id: "low",
        label: "Sous 20 % de vie : +20 % dommages finaux",
        stats: { finalDamagePct: 20 },
      },
    ],
  },
  {
    key: "tachete",
    id: 7112,
    name: "Dofus Tacheté",
    spell: "Harmonie de Pandala",
    summary: "A occasionné des dommages pendant son tour : +20 Dommages pendant 1 tour.",
    question: "Le porteur a-t-il occasionné des dommages à son tour précédent ?",
    choices: [{ id: "dealt", label: "Oui : +20 Dommages", stats: { damage: 20 } }],
  },
  {
    key: "cauchemar",
    id: 26066,
    name: "Dofus du Cauchemar",
    spell: "Éternel Cauchemar",
    summary:
      "Dommages de poussée : +100 Puissance. Avec l'autre effet dans le même tour : +10 % dommages.",
    question: "Quels effets se sont déclenchés ?",
    choices: [
      { id: "push", label: "Poussée : +100 Puissance", stats: { power: 100 } },
      {
        id: "both",
        label: "Les deux : +100 Puissance et +10 % dommages finaux",
        stats: { power: 100, finalDamagePct: 10 },
      },
    ],
  },

  // ── Cumuls ───────────────────────────────────────────────────────────────
  {
    key: "turquoise",
    id: 739,
    name: "Dofus Turquoise",
    spell: "Bleu Turquoise",
    summary: "Chaque coup critique : +1 % dommages finaux pendant 3 tours (10 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      10,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${n} % dommages finaux`,
      (n) => ({ finalDamagePct: n }),
    ),
  },
  {
    key: "pourpre",
    id: 694,
    name: "Dofus Pourpre",
    spell: "Pourpre Profond",
    summary: "Chaque attaque subie : +1 % dommages finaux pendant 2 tours (10 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      10,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${n} % dommages finaux`,
      (n) => ({ finalDamagePct: n }),
    ),
  },
  {
    key: "dofoozbz",
    id: 31794,
    name: "Dofoozbz",
    spell: "Éclosion Explosive",
    summary: "Invocation attaquée : +1 % dommages finaux pendant 2 tours (10 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      10,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${n} % dommages finaux`,
      (n) => ({ finalDamagePct: n }),
    ),
  },
  {
    key: "ebene",
    id: 7114,
    name: "Dofus Ébène",
    spell: "Noir Ébène",
    summary:
      "Attaque en mêlée : +2 % Do Distance ; attaque à distance : +2 % Do Mêlée, pendant 3 tours (5 cumuls).",
    question: "Quel bonus, et combien de cumuls ?",
    choices: [
      ...stacks(
        5,
        (n) => `Mêlée ×${n} : +${2 * n} % Do Mêlée`,
        (n) => ({ meleeDamagePct: 2 * n }),
        "melee",
      ),
      ...stacks(
        5,
        (n) => `Distance ×${n} : +${2 * n} % Do Distance`,
        (n) => ({ rangedDamagePct: 2 * n }),
        "ranged",
      ),
    ],
  },
  {
    key: "sylvestre",
    id: 29136,
    name: "Dofus Sylvestre",
    spell: "Garde Champêtre",
    summary: "Chaque PM utilisé : +8 Puissance pendant 2 tours.",
    question: "Combien de PM utilisés (sur les 2 derniers tours) ?",
    choices: stacks(
      12,
      (n) => `${n} PM : +${8 * n} Puissance`,
      (n) => ({ power: 8 * n }),
    ),
  },
  {
    key: "domakuro",
    id: 23237,
    name: "Domakuro",
    spell: "Rivière d'Encre",
    summary:
      "Fin de chacun des 4 premiers tours : jusqu'à +16 Dommages (8 après 1 attaque, 0 après 2), jusqu'à la fin du combat.",
    question: "Combien de Dommages accumulés ?",
    choices: stacks(
      8,
      (n) => `+${8 * n} Dommages`,
      (n) => ({ damage: 8 * n }),
    ),
  },
];

const BY_ID = new Map(SPECIAL_EFFECTS.map((e) => [e.id, e]));

/** Effet spécial à choix d'un objet, ou null. */
export function specialEffectOf(item: { id: number }): SpecialEffect | null {
  return BY_ID.get(item.id) ?? null;
}

/** Choix enregistrés : clé de l'effet → identifiant du choix. */
export const specialChoicesSchema = z.record(z.string().max(40), z.string().max(20)).default({});
export type SpecialChoices = z.infer<typeof specialChoicesSchema>;

/** Choix retenu pour un effet (null : « Rien » ou pas encore choisi). */
export function specialChoice(
  effect: SpecialEffect,
  choices: SpecialChoices,
): SpecialChoice | null {
  const id = choices[effect.key];
  return effect.choices.find((c) => c.id === id) ?? null;
}

/** Bonus de combat des objets équipés, selon les choix du joueur. */
export function specialBuffs(
  items: readonly { id: number }[],
  choices: SpecialChoices,
): Partial<Record<StatKey, number>> {
  const buffs: Partial<Record<StatKey, number>> = {};
  const seen = new Set<string>();
  for (const item of items) {
    const effect = specialEffectOf(item);
    if (!effect || seen.has(effect.key)) continue;
    seen.add(effect.key);
    const choice = specialChoice(effect, choices);
    for (const [k, v] of Object.entries(choice?.stats ?? {}) as [StatKey, number][]) {
      buffs[k] = (buffs[k] ?? 0) + v;
    }
  }
  return buffs;
}
