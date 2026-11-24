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

const NO_STAT_EFFECT = "Cet effet ne change pas les caractéristiques du simulateur.";
/** Même % de résistance dans les cinq éléments. */
const allResPct = (v: number): Partial<Record<StatKey, number>> => ({
  neutralResPct: v,
  earthResPct: v,
  fireResPct: v,
  waterResPct: v,
  airResPct: v,
});

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

  // ── Prysmaradites (effets des premiers tours) ────────────────────────────
  {
    key: "surpryz",
    id: 22001,
    name: "Surpryz",
    spell: "Surpryz",
    summary: "+100 % Critique au premier tour, +35 % au deuxième, +15 % au troisième.",
    question: "Quel tour simuler ?",
    choices: [
      { id: "t1", label: "Tour 1 : +100 % Critique", stats: { critical: 100 } },
      { id: "t2", label: "Tour 2 : +35 % Critique", stats: { critical: 35 } },
      { id: "t3", label: "Tour 3 : +15 % Critique", stats: { critical: 15 } },
    ],
  },
  {
    key: "prynyang",
    id: 22004,
    name: "Prynyang",
    spell: "Prynyang",
    summary:
      "Tour 1 : −10 % résistances, +10 % dommages finaux. Tour 2 : +3 % des deux. Tour 3 : −10 % dommages finaux, +10 % résistances.",
    question: "Quel tour simuler ?",
    choices: [
      {
        id: "t1",
        label: "Tour 1 : +10 % dommages finaux, −10 % résistances",
        stats: { finalDamagePct: 10, ...allResPct(-10) },
      },
      {
        id: "t2",
        label: "Tour 2 : +3 % dommages finaux et résistances",
        stats: { finalDamagePct: 3, ...allResPct(3) },
      },
      {
        id: "t3",
        label: "Tour 3 : −10 % dommages finaux, +10 % résistances",
        stats: { finalDamagePct: -10, ...allResPct(10) },
      },
    ],
  },

  // ── Équipements légendaires ──────────────────────────────────────────────
  {
    key: "helsephine",
    id: 32118,
    name: "Amour d'Helséphine",
    spell: "Amour d'Helséphine",
    summary:
      "Bouclier appliqué ou dommages en mêlée : soigne les alliés proches de 6 % de leur vie.",
    question: NO_STAT_EFFECT,
    choices: [],
  },
  {
    key: "henual",
    id: 32119,
    name: "Ponctualité d'Henual",
    spell: "Ponctualité d'Henual",
    summary: "Téléporté, se téléporte ou échange de position : +1 PA (1 fois par tour).",
    question: "Le porteur a-t-il été téléporté ou a-t-il échangé de position ?",
    choices: [{ id: "tp", label: "Oui : +1 PA", stats: { ap: 1 } }],
  },
  {
    key: "buhorado",
    id: 20356,
    name: "Plume de Buhorado",
    spell: "Plume de Buhorado",
    summary: "Coup critique : +10 Dommages Poussée pendant 3 tours.",
    question: "Le porteur a-t-il fait un coup critique ?",
    choices: [{ id: "crit", label: "Oui : +10 Do Poussée", stats: { pushbackDamage: 10 } }],
  },
  {
    key: "brumaire",
    id: 20355,
    name: "Frisson de Brumaire",
    spell: "Froid de Novamaire",
    summary: "Ennemi achevé : +1 PA pendant 1 tour (2 cumuls).",
    question: "Combien d'ennemis achevés ?",
    choices: stacks(
      2,
      (n) => `${n} ennemi${n > 1 ? "s" : ""} achevé${n > 1 ? "s" : ""} : +${n} PA`,
      (n) => ({ ap: n }),
    ),
  },
  {
    key: "misere",
    id: 22444,
    name: "Balance-Fléau de Misère",
    spell: "Épreuve de la Balance",
    summary:
      "Retrait de PA, PM ou PO subi : vole 2 % de résistances à l'attaquant pendant 2 tours (4 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      4,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${2 * n} % de résistances`,
      (n) => allResPct(2 * n),
    ),
  },
  {
    key: "mille-lieues",
    id: 20363,
    name: "Bottes de Mille Lieues",
    spell: "Mille Lieues",
    summary: "Tours impairs : +2 PM.",
    question: "Quel tour simuler ?",
    choices: [{ id: "odd", label: "Tour impair : +2 PM", stats: { mp: 2 } }],
  },
  {
    key: "cul-botte",
    id: 20364,
    name: "Bottes du Cul Botté",
    spell: "Les Culs Bottés",
    summary: "Début et fin de tour : repousse de 2 cases les entités au contact.",
    question: NO_STAT_EFFECT,
    choices: [],
  },
  {
    key: "meriana",
    id: 32121,
    name: "Clairvoyance de Mériana",
    spell: "Clairvoyance de Mériana",
    summary:
      "Dommages élémentaires : +5 Retrait PM (Terre, Eau) ou +5 Retrait PA (Feu, Air) pendant 2 tours (8 cumuls partagés).",
    question: "Quel retrait, et combien de cumuls ?",
    choices: [
      ...stacks(
        8,
        (n) => `Terre / Eau ×${n} : +${5 * n} Retrait PM`,
        (n) => ({ mpReduction: 5 * n }),
        "mp",
      ),
      ...stacks(
        8,
        (n) => `Feu / Air ×${n} : +${5 * n} Retrait PA`,
        (n) => ({ apReduction: 5 * n }),
        "ap",
      ),
    ],
  },
  {
    key: "fallanster",
    id: 20357,
    name: "Droiture de Fallanster",
    spell: "Droiture de Fallanster",
    summary:
      "Fin de tour en vue d'un ennemi : glyphe réduisant de 10 % les dommages subis par les alliés.",
    question: NO_STAT_EFFECT,
    choices: [],
  },
  {
    key: "trompe-la-mort",
    id: 20358,
    name: "Trompe-la-Mort",
    spell: "Trompe-la-Mort",
    summary:
      "Plus de 50 % de vie : +7 % de dommages finaux (perd 10 % de vie par tour). Moins de 50 % : −20 % de dommages subis.",
    question: "Le porteur a-t-il plus de 50 % de sa vie ?",
    choices: [
      { id: "high", label: "Plus de 50 % : +7 % dommages finaux", stats: { finalDamagePct: 7 } },
    ],
  },
  {
    key: "miroir",
    id: 32115,
    name: "Bouclier Miroir",
    spell: "Reflet Aveuglant",
    summary: "Renvoie la première attaque alliée subie ; fin de tour : −4 PO aux ennemis en vue.",
    question: NO_STAT_EFFECT,
    choices: [],
  },
  {
    key: "dofusteuse",
    id: 958,
    name: "Dofusteuse",
    spell: "Bénédiction des Dofus",
    summary:
      "Chaque tour, +400 dans une caractéristique élémentaire (Chance, Force, Agilité, Intelligence, à tour de rôle).",
    question: "Quel tour simuler ?",
    choices: [
      { id: "chance", label: "+400 Chance", stats: { chance: 400 } },
      { id: "strength", label: "+400 Force", stats: { strength: 400 } },
      { id: "agility", label: "+400 Agilité", stats: { agility: 400 } },
      { id: "intelligence", label: "+400 Intelligence", stats: { intelligence: 400 } },
    ],
  },
  {
    key: "rykke-errel",
    id: 20361,
    name: "Bravoure de Rykke Errel",
    spell: "Bravoure de Rykke Errel",
    summary:
      "Attaque à distance subie : bouclier, et −1 % de dommages à distance par case d'éloignement de l'attaquant (11 au plus).",
    question: "À combien de cases était l'attaquant ?",
    choices: stacks(
      11,
      (n) => `${n} case${n > 1 ? "s" : ""} : −${n} % Do Distance`,
      (n) => ({ rangedDamagePct: -n }),
    ),
  },
  {
    key: "jahash",
    id: 20362,
    name: "Noblesse de Jahash Jurgen",
    spell: "Assimilation Élémentaire",
    summary:
      "Dommages subis dans un élément : +4 % de résistance dans cet élément pendant 2 tours (5 cumuls partagés).",
    question: "Quel élément, et combien de cumuls ?",
    choices: (
      [
        ["neutral", "Neutre", "neutralResPct"],
        ["earth", "Terre", "earthResPct"],
        ["fire", "Feu", "fireResPct"],
        ["water", "Eau", "waterResPct"],
        ["air", "Air", "airResPct"],
      ] as const
    ).flatMap(([id, label, stat]) =>
      stacks(
        5,
        (n) => `${label} ×${n} : +${4 * n} % Ré ${label}`,
        (n) => ({ [stat]: 4 * n }),
        id,
      ),
    ),
  },
  {
    key: "corruption",
    id: 22412,
    name: "Pestilence de Corruption",
    spell: "Nuée Pestilentielle",
    summary: "Remonte à 90 % de vie : poison de 18 aux ennemis à 2 cases ou moins.",
    question: NO_STAT_EFFECT,
    choices: [],
  },
  {
    key: "dodge",
    id: 20365,
    name: "Audace de Dodge",
    spell: "Audace de Dodge",
    summary:
      "Début de tour : déplacé (+1 PM et +10 % Critique) ou non déplacé (+40 Fuite et +40 Dommages Poussée).",
    question: "Le porteur a-t-il été déplacé en début de tour ?",
    choices: [
      { id: "moved", label: "Déplacé : +1 PM et +10 % Critique", stats: { mp: 1, critical: 10 } },
      {
        id: "still",
        label: "Pas déplacé : +40 Fuite et +40 Do Poussée",
        stats: { dodge: 40, pushbackDamage: 40 },
      },
    ],
  },
  {
    key: "jhessica",
    id: 20366,
    name: "Courage de Dame Jhessica",
    spell: "Courage de Dame Jhessica",
    summary:
      "Fin de tour : −60 Fuite aux ennemis au contact, +1 % de dommages aux sorts par ennemi touché (4 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      4,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${n} % Do Sorts`,
      (n) => ({ spellDamagePct: n }),
    ),
  },
  {
    key: "servitude",
    id: 22429,
    name: "Étreinte de Servitude",
    spell: "Fers de la Tyrannie",
    summary:
      "Fin de tour : attire les entités alignées ; sans entité au contact, devient Indéplaçable.",
    question: NO_STAT_EFFECT,
    choices: [],
  },
  {
    key: "bram",
    id: 20359,
    name: "Couronne de Brâm Barbe-Monde",
    spell: "Roi sous la Montagne",
    summary:
      "Retrait de PA ou PM effectué ou subi : +2 % de dommages finaux pendant 2 tours (5 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      5,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${2 * n} % dommages finaux`,
      (n) => ({ finalDamagePct: 2 * n }),
    ),
  },
  {
    key: "ganymede",
    id: 20360,
    name: "Diadème de Ganymède",
    spell: "Sagesse de Ganymède",
    summary: "Tours pairs : +2 PA. Tours impairs : −1 PA et −1 PM.",
    question: "Quel tour simuler ?",
    choices: [
      { id: "even", label: "Tour pair : +2 PA", stats: { ap: 2 } },
      { id: "odd", label: "Tour impair : −1 PA et −1 PM", stats: { ap: -1, mp: -1 } },
    ],
  },
  {
    key: "oto-mustam",
    id: 32114,
    name: "Ardeur d'Oto Mustam",
    spell: "Ardeur de la Cité Sombre",
    summary: "Début de tour : +1 % de dommages finaux par ennemi en vie (4 au plus).",
    question: "Combien d'ennemis en vie ?",
    choices: stacks(
      4,
      (n) => `${n} ennemi${n > 1 ? "s" : ""} : +${n} % dommages finaux`,
      (n) => ({ finalDamagePct: n }),
    ),
  },
  {
    key: "destin",
    id: 20354,
    name: "Ciseaux du Destin",
    spell: "Destin Fatidique",
    summary:
      "Fin de tour : les ennemis au contact subissent 6 % de dommages en plus pendant 2 tours ; +10 Tacle par ennemi touché.",
    question: "Combien d'ennemis touchés ?",
    choices: stacks(
      4,
      (n) => `${n} ennemi${n > 1 ? "s" : ""} : +6 % dégâts sur eux, +${10 * n} Tacle`,
      (n) => ({ finalDamagePct: 6, lock: 10 * n }),
    ),
  },
  {
    key: "crocobur",
    id: 20353,
    name: "Crocobur",
    spell: "Appétit de Crocobur",
    summary:
      "Début de tour : s'inflige 15 dommages pour les rendre en vol de vie aux entités au contact.",
    question: NO_STAT_EFFECT,
    choices: [],
  },
  {
    key: "amayiro",
    id: 32163,
    name: "Ferveur d'Amayiro",
    spell: "Ferveur de la Cité Blanche",
    summary: "Début de tour : +1 % de résistance par ennemi en vie (4 au plus), porteur et alliés.",
    question: "Combien d'ennemis en vie ?",
    choices: stacks(
      4,
      (n) => `${n} ennemi${n > 1 ? "s" : ""} : +${n} % de résistances`,
      (n) => allResPct(n),
    ),
  },
  {
    key: "thanatena",
    id: 32117,
    name: "Jugement de Thanatena",
    spell: "Jugement de Thanatena",
    summary:
      "Début de tour : tout le monde subit 4 % de dommages en plus. Ennemi achevé : +10 % de dommages finaux pendant 1 tour.",
    question: "Quelle situation simuler ?",
    choices: [
      {
        id: "aura",
        label: "Début de tour seulement : +4 % de dégâts subis par la cible",
        stats: { finalDamagePct: 4 },
      },
      {
        id: "kill-only",
        label: "Ennemi achevé seulement : +10 % de dommages finaux",
        stats: { finalDamagePct: 10 },
      },
      {
        id: "kill",
        label: "Les deux : +14 % au total",
        stats: { finalDamagePct: 14 },
      },
    ],
  },
  {
    key: "guerre",
    id: 22368,
    name: "Hachebarde de Guerre",
    spell: "Guerre de Positions",
    summary: "Ennemi achevé : +1 PM jusqu'à la fin du combat (5 cumuls).",
    question: "Combien d'ennemis achevés ?",
    choices: stacks(
      5,
      (n) => `${n} ennemi${n > 1 ? "s" : ""} achevé${n > 1 ? "s" : ""} : +${n} PM`,
      (n) => ({ mp: n }),
    ),
  },
  {
    key: "menalt",
    id: 32116,
    name: "Lance-Éclair de Menalt",
    spell: "Ordre du Tonnerre",
    summary: "Chaque PM utilisé : +6 Dommages Poussée pendant 2 tours.",
    question: "Combien de PM utilisés ?",
    choices: stacks(
      6,
      (n) => `${n} PM : +${6 * n} Do Poussée`,
      (n) => ({ pushbackDamage: 6 * n }),
    ),
  },
];

const BY_ID = new Map(SPECIAL_EFFECTS.map((e) => [e.id, e]));

/**
 * Équipements légendaires (Jahash, Crocobur, Mériana…) : les effets listés
 * après les Dofus et trophées dans SPECIAL_EFFECTS, à partir d'Helséphine.
 */
export const LEGENDARY_ITEM_IDS: ReadonlySet<number> = new Set(
  SPECIAL_EFFECTS.slice(SPECIAL_EFFECTS.findIndex((e) => e.key === "helsephine")).map((e) => e.id),
);

/** Effet spécial à choix d'un objet, ou null. */
export function specialEffectOf(item: { id: number }): SpecialEffect | null {
  return BY_ID.get(item.id) ?? null;
}

/** Choix enregistrés : clé de l'effet → identifiant du choix. */
export const specialChoicesSchema = z.record(z.string().max(40), z.string().max(20)).default({});
export type SpecialChoices = z.infer<typeof specialChoicesSchema>;

/** Choix retenu pour un effet (null : « Rien » ou pas encore choisi). */
export function specialChoice(
  effect: Pick<SpecialEffect, "key" | "choices">,
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

// ─── Situation de combat de l'optimiseur ────────────────────────────────────

/** Tour simulé par l'optimiseur : impair, pair, ou moyenne des deux. */
export const OPTIMIZER_TURNS = ["odd", "even", "average"] as const;
export type OptimizerTurn = (typeof OPTIMIZER_TURNS)[number];
/** Durée du combat : court (aucun cumul) ou long (cumuls au maximum). */
export const OPTIMIZER_FIGHTS = ["short", "long"] as const;
export type OptimizerFight = (typeof OPTIMIZER_FIGHTS)[number];

export interface OptimizerSituation {
  turn: OptimizerTurn;
  fight: OptimizerFight;
}

export const DEFAULT_SITUATION: OptimizerSituation = { turn: "odd", fight: "short" };

/** Hypothèses de la situation, selon la durée du combat (rappel affiché au joueur). */
export function situationSummary(fight: OptimizerFight): { label: string; value: string }[] {
  return fight === "short"
    ? [
        { label: "Touché ce tour", value: "Non (Vulbis +10 % dommages finaux)" },
        { label: "Ennemis en vie", value: "Tous (Oto Mustam, Amayiro au maximum)" },
        { label: "PV au-dessus de 50 %", value: "Oui (Trompe-la-Mort)" },
        { label: "Premiers tours", value: "Nébuleux, Surpryz, Prynyang selon le tour" },
        { label: "Cumuls", value: "Turquoise 4 ; Pourpre et autres : aucun" },
        { label: "PA, PM, PO gagnés en combat", value: "Non comptés (Ocre…)" },
      ]
    : [
        { label: "Touché ce tour", value: "Parfois (Vulbis à moitié : +5 %)" },
        { label: "Ennemis en vie", value: "60 % du bonus (Oto Mustam, Amayiro)" },
        { label: "PV au-dessus de 50 %", value: "Non (pas de Trompe-la-Mort)" },
        { label: "Premiers tours", value: "Non comptés (Nébuleux, Prysmaradites)" },
        { label: "Cumuls", value: "Au maximum (Brâm, Pourpre, Turquoise, Sylvestre…)" },
        { label: "PA, PM, PO gagnés en combat", value: "Non comptés (Ocre…)" },
      ];
}

/** Combat court (tours 1 et 2) : choix fixes. */
const SHORT_CHOICES: SpecialChoices = {
  ocre: "safe",
  vulbis: "safe",
  "oto-mustam": "x4",
  amayiro: "x4",
  "trompe-la-mort": "high",
  turquoise: "x4",
};
/** Combat court : effets qui dépendent du tour (impair = tour 1, pair = tour 2). */
const SHORT_TURN_CHOICES: Record<string, { odd: string; even: string }> = {
  nebuleux: { odd: "odd", even: "even" },
  ganymede: { odd: "odd", even: "even" },
  "mille-lieues": { odd: "odd", even: SPECIAL_NONE },
  surpryz: { odd: "t1", even: "t2" },
  prynyang: { odd: "t1", even: "t2" },
};
/** Combat long : moins d'ennemis en vie (60 % du bonus), cumuls au maximum. */
const LONG_CHOICES: SpecialChoices = {
  ocre: "safe",
  vulbis: "safe",
  "oto-mustam": "x2",
  amayiro: "x2",
  turquoise: "x10",
  pourpre: "x10",
  dofoozbz: "x10",
  domakuro: "x8",
  misere: "x4",
  jhessica: "x4",
  bram: "x5",
  sylvestre: "x12",
};
/** Combat long : bonus comptés en partie (pas touché un tour sur deux). */
const LONG_SCALE: Record<string, number> = { ocre: 0.5, vulbis: 0.5 };

/**
 * Choix des effets dans une situation, pour le simulateur : tour impair pour la
 * moyenne, et sans les bonus comptés en partie (pas de choix équivalent).
 */
export function optimizerChoices(
  situation: OptimizerSituation,
  turn: "odd" | "even" = situation.turn === "even" ? "even" : "odd",
): SpecialChoices {
  if (situation.fight === "long") {
    const choices = { ...LONG_CHOICES };
    for (const key of Object.keys(LONG_SCALE)) delete choices[key];
    return choices;
  }
  const choices: SpecialChoices = { ...SHORT_CHOICES };
  for (const [key, byTurn] of Object.entries(SHORT_TURN_CHOICES)) choices[key] = byTurn[turn];
  return choices;
}

/**
 * Bonus de combat de chaque objet dans une situation (objets concernés
 * seulement). « Moyenne » : moitié du tour impair, moitié du tour pair.
 */
export function scenarioBuffs(
  items: readonly { id: number }[],
  situation: OptimizerSituation = DEFAULT_SITUATION,
): Map<number, Partial<Record<StatKey, number>>> {
  const out = new Map<number, Partial<Record<StatKey, number>>>();
  const long = situation.fight === "long";
  const odd = long ? LONG_CHOICES : optimizerChoices(situation, "odd");
  const even = long ? LONG_CHOICES : optimizerChoices(situation, "even");
  const average = !long && situation.turn === "average";
  for (const item of items) {
    const scale = long ? (LONG_SCALE[specialEffectOf(item)?.key ?? ""] ?? 1) : 1;
    const a = specialBuffs([item], situation.turn === "even" && !long ? even : odd);
    const b = average ? specialBuffs([item], even) : a;
    const buffs: Partial<Record<StatKey, number>> = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<StatKey>) {
      // Arrondi à l'inférieur : des valeurs entières pour le solveur, sans surestimer.
      const v = Math.floor((((a[k] ?? 0) + (b[k] ?? 0)) / 2) * scale);
      if (v !== 0) buffs[k] = v;
    }
    if (Object.keys(buffs).length > 0) out.set(item.id, buffs);
  }
  return out;
}

// ─── Pouvoirs légendaires des familiers (croquettes infusées) ───────────────

/**
 * Pouvoir légendaire d'un familier ou montilier, donné par une « Croquette
 * infusée » : un sort passif (valeurs du niveau 200). Les pouvoirs sans effet sur
 * les caractéristiques du simulateur (boucliers, soins, bonus aux alliés) n'ont
 * aucun choix.
 */
export interface LegendaryPower extends Omit<SpecialEffect, "id" | "name"> {
  /** Créature de la croquette (ex. « Bwork »). */
  creature: string;
  /** Sort passif attribué (DofusDB). */
  spellId: number;
}

const finals = (v: number) => ({ finalDamagePct: v });
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
/** Choix « bilan » de -min à +max % de dommages finaux. */
const netFinals = (min: number, max: number): SpecialChoice[] =>
  Array.from({ length: max - min + 1 }, (_, i) => min + i)
    .filter((v) => v !== 0)
    .map((v) => ({ id: `net${v}`, label: `${signed(v)} % dommages finaux`, stats: finals(v) }));
const perEnemy = (stat: StatKey, per: number, label: string): SpecialChoice[] =>
  stacks(
    4,
    (n) => `${n} ennemi${n > 1 ? "s" : ""} proche${n > 1 ? "s" : ""} : +${per * n} ${label}`,
    (n) => ({ [stat]: per * n }),
  );
const NO_EFFECT = "Ce pouvoir ne change pas les caractéristiques du simulateur.";

export const LEGENDARY_POWERS: readonly LegendaryPower[] = [
  {
    key: "leg-abraknyde",
    creature: "Abraknyde",
    spellId: 12498,
    spell: "Écorce de l'Abraknyde",
    summary: "Retrait de PM subi : bouclier de 75 % du niveau pendant 1 tour.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-arakne",
    creature: "Arakne",
    spellId: 12480,
    spell: "Toile de l'Arakne",
    summary: "Fin de tour : +10 Tacle pendant 2 tours par ennemi à 2 cases ou moins.",
    question: "Combien d'ennemis à 2 cases ou moins ?",
    choices: perEnemy("lock", 10, "Tacle"),
  },
  {
    key: "leg-boufette",
    creature: "Boufette",
    spellId: 12488,
    spell: "Douceur de la Boufette",
    summary: "Fin de tour : donne 3 % de dommages en mêlée aux alliés au contact.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-boursoin",
    creature: "Boursoin",
    spellId: 12506,
    spell: "Empathie de la Boursoin",
    summary: "Début du combat : +10 % de soins finaux, perdus à la mort d'un allié.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-domoizelle",
    creature: "Domoizelle",
    spellId: 12503,
    spell: "Dévouement de la Domoizelle",
    summary:
      "Fin de tour : transfère 5 % de sa vie aux alliés au contact et gagne 10 % de Vitalité pendant 2 tours.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-krokille",
    creature: "Krokille",
    spellId: 12490,
    spell: "Protection de la Krokille",
    summary: "Début du combat : bouclier de 100 % du niveau de chaque allié.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-leolhyene",
    creature: "Léolhyène",
    spellId: 29821,
    spell: "Persévérance de la Léolhyène",
    summary: "Aucun PM utilisé pendant le tour : +1 PA au tour suivant.",
    question: "Le porteur n'a-t-il utilisé aucun PM au tour précédent ?",
    choices: [{ id: "still", label: "Aucun PM utilisé : +1 PA", stats: { ap: 1 } }],
  },
  {
    key: "leg-tofoune",
    creature: "Tofoune",
    spellId: 12500,
    spell: "Bienveillance de la Tofoune",
    summary: "Fin de tour au contact d'un allié : lui donne 1 PM pendant 2 tours.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-truche",
    creature: "Truche",
    spellId: 12481,
    spell: "Hystérie de la Truche",
    summary: "Poussé : +10 Tacle ; attiré : +10 Fuite, pendant 2 tours.",
    question: "Le porteur a-t-il été poussé ou attiré ?",
    choices: [
      { id: "pushed", label: "Poussé : +10 Tacle", stats: { lock: 10 } },
      { id: "pulled", label: "Attiré : +10 Fuite", stats: { dodge: 10 } },
    ],
  },
  {
    key: "leg-bambouto",
    creature: "Bambouto",
    spellId: 29822,
    spell: "Sérénité du Bambouto",
    summary: "Aucun PM utilisé pendant le tour : +3 Portée au tour suivant.",
    question: "Le porteur n'a-t-il utilisé aucun PM au tour précédent ?",
    choices: [{ id: "still", label: "Aucun PM utilisé : +3 PO", stats: { range: 3 } }],
  },
  {
    key: "leg-bwak",
    creature: "Bwak",
    spellId: 12487,
    spell: "Générosité du Bwak",
    summary:
      "Fin de tour au contact d'un ennemi : −2 % de dommages à distance au tour suivant (+4 % aux alliés).",
    question: "Le porteur a-t-il fini son tour au contact d'un ennemi ?",
    choices: [
      { id: "contact", label: "Au contact : −2 % Do Distance", stats: { rangedDamagePct: -2 } },
    ],
  },
  {
    key: "leg-bwork",
    creature: "Bwork",
    spellId: 12485,
    spell: "Précision du Bwork",
    summary: "Début de tour : +3 % Do Distance au contact d'un ennemi, sinon +3 % Do Mêlée.",
    question: "Un ennemi est-il au contact en début de tour ?",
    choices: [
      { id: "contact", label: "Au contact : +3 % Do Distance", stats: { rangedDamagePct: 3 } },
      { id: "alone", label: "Pas au contact : +3 % Do Mêlée", stats: { meleeDamagePct: 3 } },
    ],
  },
  {
    key: "leg-chafer",
    creature: "Chafer",
    spellId: 12497,
    spell: "Immortalité du Chafer",
    summary: "Mort d'un allié : bouclier de 500 % de son niveau pour le reste du combat.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-champa",
    creature: "Champa",
    spellId: 12499,
    spell: "Altruisme du Champa",
    summary: "Fin de tour au contact d'un allié : lui donne 1 PA pendant 2 tours.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-craqueleur",
    creature: "Craqueleur",
    spellId: 12489,
    spell: "Robustesse du Craqueleur",
    summary:
      "Début du combat : sacrifie 2 % de résistance par allié pour en donner 3 % aux alliés.",
    question: "Combien d'alliés ?",
    choices: stacks(
      7,
      (n) => `${n} allié${n > 1 ? "s" : ""} : −${2 * n} % de résistances`,
      (n) => ({
        neutralResPct: -2 * n,
        earthResPct: -2 * n,
        fireResPct: -2 * n,
        waterResPct: -2 * n,
        airResPct: -2 * n,
      }),
    ),
  },
  {
    key: "leg-dragoeuf",
    creature: "Dragoeuf",
    spellId: 12502,
    spell: "Entrave du Dragoeuf",
    summary: "Tacle un ennemi : bouclier de 200 % du niveau pendant 1 tour.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-gloutoblop",
    creature: "Gloutoblop",
    spellId: 12492,
    spell: "Gourmandise du Gloutoblop",
    summary: "Mort d'un allié : soin de 20 % de sa vie (3 fois au plus).",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-kanig",
    creature: "Kanig",
    spellId: 23151,
    spell: "Barbarie du Kanig",
    summary:
      "Achève une entité avec une arme : +5 % de dommages finaux pendant 2 tours (3 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      3,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${5 * n} % dommages finaux`,
      (n) => finals(5 * n),
    ),
  },
  {
    key: "leg-kitsou",
    creature: "Kitsou",
    spellId: 12479,
    spell: "Évasion du Kitsou",
    summary: "Début de tour : +10 Fuite pendant 2 tours par ennemi à 2 cases ou moins.",
    question: "Combien d'ennemis à 2 cases ou moins ?",
    choices: perEnemy("dodge", 10, "Fuite"),
  },
  {
    key: "leg-koalak",
    creature: "Koalak",
    spellId: 12477,
    spell: "Épargne du Koalak",
    summary: "Taclé : +1 PA pendant 2 tours.",
    question: "Le porteur s'est-il fait tacler ?",
    choices: [{ id: "tackled", label: "Taclé : +1 PA", stats: { ap: 1 } }],
  },
  {
    key: "leg-kozaru",
    creature: "Kozaru",
    spellId: 23152,
    spell: "Agitation du Kozaru",
    summary: "Pousse, attire ou transpose : +7 Tacle et +7 Fuite pendant 2 tours.",
    question: "Le porteur a-t-il poussé, attiré ou transposé une entité ?",
    choices: [{ id: "moved", label: "Oui : +7 Tacle et +7 Fuite", stats: { lock: 7, dodge: 7 } }],
  },
  {
    key: "leg-moskito",
    creature: "Moskito",
    spellId: 12482,
    spell: "Soif du Moskito",
    summary: "Sacrifie 5 % de dommages finaux pour se soigner de 15 % des dommages occasionnés.",
    question: "Compter le sacrifice de dommages ?",
    choices: [{ id: "on", label: "−5 % dommages finaux", stats: finals(-5) }],
  },
  {
    key: "leg-mulou",
    creature: "Mulou",
    spellId: 12486,
    spell: "Rage du Mulou",
    summary: "Mort d'un allié : +5 % de dommages finaux pendant 2 tours (3 cumuls).",
    question: "Combien de cumuls ?",
    choices: stacks(
      3,
      (n) => `${n} cumul${n > 1 ? "s" : ""} : +${5 * n} % dommages finaux`,
      (n) => finals(5 * n),
    ),
  },
  {
    key: "leg-noeul",
    creature: "Noeul",
    spellId: 23153,
    spell: "Acuité du Noeul",
    summary: "Début de tour : +3 Portée pour le tour, perdue dès qu'un PM est utilisé.",
    question: "Le porteur reste-t-il immobile ?",
    choices: [{ id: "still", label: "Immobile : +3 PO", stats: { range: 3 } }],
  },
  {
    key: "leg-pandore",
    creature: "Pandore",
    spellId: 12501,
    spell: "Appel du Pandore",
    summary: "Invocation : lui donne 1 PM pendant 2 tours.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-piou",
    creature: "Piou",
    spellId: 12475,
    spell: "Célérité du Piou",
    summary: "Taclé : +1 PM pendant 2 tours.",
    question: "Le porteur s'est-il fait tacler ?",
    choices: [{ id: "tackled", label: "Taclé : +1 PM", stats: { mp: 1 } }],
  },
  {
    key: "leg-scarafeuille",
    creature: "Scarafeuille",
    spellId: 29819,
    spell: "Carapace du Scarafeuille",
    summary: "Retrait de PA subi : bouclier de 75 % du niveau pendant 1 tour.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-scorbute",
    creature: "Scorbute",
    spellId: 12505,
    spell: "Toxicité du Scorbute",
    summary:
      "Début de tour : s'inflige 8 dommages (meilleur élément) pour les renvoyer aux entités au contact en fin de tour.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-thomondor",
    creature: "Thomondor",
    spellId: 29820,
    spell: "Patience du Thomondor",
    summary: "Aucun PM utilisé pendant le tour : +2 PM au tour suivant.",
    question: "Le porteur n'a-t-il utilisé aucun PM au tour précédent ?",
    choices: [{ id: "still", label: "Aucun PM utilisé : +2 PM", stats: { mp: 2 } }],
  },
  {
    key: "leg-timansot",
    creature: "Timansot",
    spellId: 29823,
    spell: "Réconfort du Timansot",
    summary: "Fin de tour : soin de 3 % de sa vie par allié au contact.",
    question: NO_EFFECT,
    choices: [],
  },
  {
    key: "leg-trool",
    creature: "Trool",
    spellId: 12484,
    spell: "Brutalité du Trool",
    summary:
      "Début du combat : −1 % de dommages finaux par ennemi, puis +3 % à chaque ennemi mort. Choisir le bilan.",
    question: "Bilan des dommages finaux (−ennemis + 3 × morts) ?",
    choices: netFinals(-8, 16),
  },
  {
    key: "leg-wabbit",
    creature: "Wabbit",
    spellId: 12483,
    spell: "Impatience du Wabbit",
    summary:
      "Début du combat : +1 % de dommages finaux par ennemi, puis −2 % à chaque ennemi mort. Choisir le bilan.",
    question: "Bilan des dommages finaux (ennemis − 2 × morts) ?",
    choices: netFinals(-8, 8),
  },
];

const POWER_BY_KEY = new Map(LEGENDARY_POWERS.map((p) => [p.key, p]));

/** Pouvoir légendaire par sa clé, ou null. */
export function legendaryPower(key: string | null | undefined): LegendaryPower | null {
  return key ? (POWER_BY_KEY.get(key) ?? null) : null;
}

/** Seuls les familiers et montiliers peuvent devenir légendaires. */
export function canBeLegendary(item: { type: string }): boolean {
  return /^(familier|montilier)$/i.test(item.type.trim());
}

/** Bonus du pouvoir légendaire selon la situation choisie. */
export function legendaryBuffs(
  key: string | null | undefined,
  choices: SpecialChoices,
): Partial<Record<StatKey, number>> {
  const power = legendaryPower(key);
  if (!power) return {};
  return { ...(power.choices.find((c) => c.id === choices[power.key])?.stats ?? {}) };
}
