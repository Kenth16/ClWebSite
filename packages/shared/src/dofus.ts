import { z } from "zod";

/**
 * Simulateur d'équipement Dofus : caractéristiques, emplacements et calcul
 * des statistiques finales d'un personnage. Logique pure, partagée entre
 * l'API (normalisation des données DofusDude) et le site (affichage).
 */

// ─── Caractéristiques ──────────────────────────────────────────────────────

export const STATS = {
  vitality: "Vitalité",
  wisdom: "Sagesse",
  strength: "Force",
  intelligence: "Intelligence",
  chance: "Chance",
  agility: "Agilité",
  power: "Puissance",
  ap: "PA",
  mp: "PM",
  range: "PO",
  summons: "Invocations",
  critical: "% Critique",
  heals: "Soins",
  initiative: "Initiative",
  prospecting: "Prospection",
  pods: "Pods",
  lock: "Tacle",
  dodge: "Fuite",
  apParry: "Esquive PA",
  mpParry: "Esquive PM",
  apReduction: "Retrait PA",
  mpReduction: "Retrait PM",
  damage: "Dommages",
  neutralDamage: "Do Neutre",
  earthDamage: "Do Terre",
  fireDamage: "Do Feu",
  waterDamage: "Do Eau",
  airDamage: "Do Air",
  criticalDamage: "Do Critiques",
  pushbackDamage: "Do Poussée",
  weaponDamagePct: "% Do Armes",
  spellDamagePct: "% Do Sorts",
  meleeDamagePct: "% Do Mêlée",
  rangedDamagePct: "% Do Distance",
  neutralRes: "Ré Neutre",
  earthRes: "Ré Terre",
  fireRes: "Ré Feu",
  waterRes: "Ré Eau",
  airRes: "Ré Air",
  criticalRes: "Ré Critiques",
  pushbackRes: "Ré Poussée",
  neutralResPct: "% Ré Neutre",
  earthResPct: "% Ré Terre",
  fireResPct: "% Ré Feu",
  waterResPct: "% Ré Eau",
  airResPct: "% Ré Air",
  meleeResPct: "% Ré Mêlée",
  rangedResPct: "% Ré Distance",
  weaponResPct: "% Ré Armes",
  spellResPct: "% Ré Sorts",
} as const;

export type StatKey = keyof typeof STATS;
export type StatTotals = Record<StatKey, number>;

/** Caractéristiques auxquelles on attribue des points (et des parchemins). */
export const CHARACTERISTICS = [
  "vitality",
  "wisdom",
  "strength",
  "intelligence",
  "chance",
  "agility",
] as const satisfies readonly StatKey[];
export type Characteristic = (typeof CHARACTERISTICS)[number];

const normalizeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\b(dommages|resistances|critiques|soins|invocations|pods)\b/g, (w) => w.slice(0, -1))
    .replace(/\s+/g, " ")
    .trim();

/** Nom (normalisé) d'un effet DofusDude → caractéristique du simulateur. */
const EFFECT_NAMES: Record<string, StatKey> = {
  vitalite: "vitality",
  sagesse: "wisdom",
  force: "strength",
  intelligence: "intelligence",
  chance: "chance",
  agilite: "agility",
  puissance: "power",
  pa: "ap",
  pm: "mp",
  portee: "range",
  invocation: "summons",
  "% critique": "critical",
  soin: "heals",
  initiative: "initiative",
  prospection: "prospecting",
  pod: "pods",
  tacle: "lock",
  fuite: "dodge",
  "esquive pa": "apParry",
  "esquive pm": "mpParry",
  "retrait pa": "apReduction",
  "retrait pm": "mpReduction",
  dommage: "damage",
  "dommage neutre": "neutralDamage",
  "dommage terre": "earthDamage",
  "dommage feu": "fireDamage",
  "dommage eau": "waterDamage",
  "dommage air": "airDamage",
  "dommage critique": "criticalDamage",
  "dommage poussee": "pushbackDamage",
  "% dommage d arme": "weaponDamagePct",
  "% dommage d armes": "weaponDamagePct",
  "% dommage aux sort": "spellDamagePct",
  "% dommage aux sorts": "spellDamagePct",
  "% dommage melee": "meleeDamagePct",
  "% dommage distance": "rangedDamagePct",
  "resistance neutre": "neutralRes",
  "resistance terre": "earthRes",
  "resistance feu": "fireRes",
  "resistance eau": "waterRes",
  "resistance air": "airRes",
  "resistance critique": "criticalRes",
  "resistance poussee": "pushbackRes",
  "% resistance neutre": "neutralResPct",
  "% resistance terre": "earthResPct",
  "% resistance feu": "fireResPct",
  "% resistance eau": "waterResPct",
  "% resistance air": "airResPct",
  "% resistance melee": "meleeResPct",
  "% resistance distance": "rangedResPct",
  "% resistance aux arme": "weaponResPct",
  "% resistance aux armes": "weaponResPct",
  "% resistance aux sort": "spellResPct",
  "% resistance aux sorts": "spellResPct",
};

/** Caractéristique correspondant au nom d'un effet, ou null si elle n'est pas gérée. */
export function statFromEffectName(name: string): StatKey | null {
  return EFFECT_NAMES[normalizeName(name)] ?? null;
}

// ─── Objets ────────────────────────────────────────────────────────────────

export interface DofusEffect {
  /** Caractéristique apportée, ou null (ligne de dégâts d'arme, sort spécial…). */
  stat: StatKey | null;
  /** Valeur retenue : jet maximum. */
  value: number;
  /** Texte d'origine (ex. « 41 à 60 Vitalité »). */
  text: string;
}

export interface DofusCondition {
  stat: StatKey | "level" | null;
  label: string;
  operator: ">" | "<" | "=" | "!";
  value: number;
}

/** Conditions d'équipement : arbre « et / ou ». */
export type DofusConditionTree =
  | { kind: "condition"; condition: DofusCondition }
  | { kind: "and" | "or"; children: DofusConditionTree[] };

export interface DofusItem {
  id: number;
  name: string;
  level: number;
  type: string;
  icon: string | null;
  effects: DofusEffect[];
  conditions: DofusConditionTree | null;
  set: { id: number; name: string } | null;
  /** Famille d'emplacement de l'objet (d'après son type), si connue. */
  family?: SlotFamily | null;
}

/** Panoplie dans une liste de recherche. */
export interface DofusSetSummary {
  id: number;
  name: string;
  level: number;
  itemCount: number;
}

export interface DofusSet {
  id: number;
  name: string;
  itemIds: number[];
  /** Bonus selon le nombre d'objets équipés (clé : nombre d'objets). */
  bonuses: Record<number, DofusEffect[]>;
}

// ─── Emplacements ──────────────────────────────────────────────────────────

const WEAPON_TYPES = [
  "axe",
  "bow",
  "dagger",
  "hammer",
  "lance",
  "pickaxe",
  "scythe",
  "shovel",
  "staff",
  "sword",
  "wand",
] as const;

/** Familles d'objets (types DofusDude, en anglais) acceptées par chaque emplacement. */
export const SLOT_TYPES = {
  amulet: ["amulet"],
  hat: ["hat"],
  ring: ["ring"],
  cloak: ["cloak"],
  belt: ["belt"],
  boots: ["boots"],
  weapon: WEAPON_TYPES,
  shield: ["shield"],
  pet: ["pet", "petsmount", "dragoturkey", "seemyool", "rhineetle"],
  dofus: ["dofus", "trophy", "prysmaradite"],
} as const satisfies Record<string, readonly string[]>;

export type SlotFamily = keyof typeof SLOT_TYPES;

/** Sous-catégories proposées dans le sélecteur d'objets (types DofusDude). */
export const SLOT_SUBTYPES: Partial<
  Record<SlotFamily, readonly { id: string; label: string; types: readonly string[] }[]>
> = {
  pet: [
    { id: "pets", label: "Familiers", types: ["pet", "petsmount"] },
    { id: "dragoturkey", label: "Dragodindes", types: ["dragoturkey"] },
    { id: "seemyool", label: "Muldos", types: ["seemyool"] },
    { id: "rhineetle", label: "Volkornes", types: ["rhineetle"] },
  ],
};

/** Types DofusDude d'une famille, restreints à une sous-catégorie si elle existe. */
export function slotTypes(family: SlotFamily, subtype?: string): readonly string[] {
  const sub = subtype ? SLOT_SUBTYPES[family]?.find((s) => s.id === subtype) : undefined;
  return sub ? sub.types : SLOT_TYPES[family];
}

/** Filtre « au moins N de cette caractéristique » dans le sélecteur d'objets. */
export interface ItemStatFilter {
  stat: StatKey;
  min: number;
}
export const ITEM_STAT_FILTERS_MAX = 6;

/** Valeur (jet max) d'une caractéristique sur un objet. */
export function itemStatValue(item: Pick<DofusItem, "effects">, stat: StatKey): number {
  return item.effects.reduce((sum, e) => (e.stat === stat ? sum + e.value : sum), 0);
}

export function itemMatchesStatFilters(
  item: Pick<DofusItem, "effects">,
  filters: readonly ItemStatFilter[],
): boolean {
  return filters.every((f) => itemStatValue(item, f.stat) >= f.min);
}

/** Encodage des filtres dans l'URL : « strength:50,vitality:100 ». */
export function formatStatFilters(filters: readonly ItemStatFilter[]): string {
  return filters.map((f) => `${f.stat}:${f.min}`).join(",");
}

export function parseStatFilters(raw: string): ItemStatFilter[] | null {
  if (!raw) return [];
  const filters: ItemStatFilter[] = [];
  for (const part of raw.split(",")) {
    const match = /^([a-zA-Z]+):(-?\d{1,5})$/.exec(part);
    if (!match || !(match[1]! in STATS)) return null;
    filters.push({ stat: match[1] as StatKey, min: Number(match[2]) });
  }
  return filters.length > ITEM_STAT_FILTERS_MAX ? null : filters;
}

export const SLOTS = [
  { id: "amulet", family: "amulet", label: "Amulette" },
  { id: "shield", family: "shield", label: "Bouclier" },
  { id: "ring1", family: "ring", label: "Anneau" },
  { id: "belt", family: "belt", label: "Ceinture" },
  { id: "boots", family: "boots", label: "Bottes" },
  { id: "hat", family: "hat", label: "Coiffe" },
  { id: "weapon", family: "weapon", label: "Arme" },
  { id: "ring2", family: "ring", label: "Anneau" },
  { id: "cloak", family: "cloak", label: "Cape" },
  { id: "pet", family: "pet", label: "Familier" },
  { id: "dofus1", family: "dofus", label: "Dofus / Trophée" },
  { id: "dofus2", family: "dofus", label: "Dofus / Trophée" },
  { id: "dofus3", family: "dofus", label: "Dofus / Trophée" },
  { id: "dofus4", family: "dofus", label: "Dofus / Trophée" },
  { id: "dofus5", family: "dofus", label: "Dofus / Trophée" },
  { id: "dofus6", family: "dofus", label: "Dofus / Trophée" },
] as const satisfies readonly { id: string; family: SlotFamily; label: string }[];

export type SlotId = (typeof SLOTS)[number]["id"];

/** Identifiant de type Ankama (DofusDude) → famille d'emplacement. */
export const ITEM_TYPE_FAMILY: Record<number, SlotFamily> = {
  33: "amulet",
  27: "hat",
  17: "ring",
  43: "cloak",
  58: "belt",
  45: "boots",
  87: "shield",
  1: "pet",
  180: "pet",
  247: "pet",
  242: "pet",
  245: "pet",
  177: "dofus",
  23: "dofus",
  124: "dofus",
  73: "weapon",
  39: "weapon",
  93: "weapon",
  42: "weapon",
  111: "weapon",
  199: "weapon",
  163: "weapon",
  52: "weapon",
  125: "weapon",
  80: "weapon",
  65: "weapon",
};

/**
 * Place des objets (une panoplie) dans les emplacements : d'abord les
 * emplacements libres de leur famille, sinon remplace le premier qui n'a pas
 * déjà reçu un objet de ce lot. Les objets sans famille sont ignorés.
 */
export function placeItems(
  slots: Partial<Record<SlotId, number>>,
  items: readonly Pick<DofusItem, "id" | "family">[],
): Partial<Record<SlotId, number>> {
  const next = { ...slots };
  const filled = new Set<SlotId>();
  for (const item of items) {
    if (!item.family) continue;
    const candidates = SLOTS.filter((s) => s.family === item.family).map((s) => s.id);
    if (candidates.some((id) => next[id] === item.id && !filled.has(id))) {
      filled.add(candidates.find((id) => next[id] === item.id)!);
      continue;
    }
    const target =
      candidates.find((id) => next[id] === undefined) ?? candidates.find((id) => !filled.has(id));
    if (!target) continue;
    next[target] = item.id;
    filled.add(target);
  }
  return next;
}

export function isSlotFamily(value: string): value is SlotFamily {
  return value in SLOT_TYPES;
}

// ─── Personnage ────────────────────────────────────────────────────────────

export const LEVEL_MAX = 200;
export const SCROLL_MAX = 100;

/** Exos de forgemagie : +1 PA, PM ou PO. */
export const EXO_STATS = ["ap", "mp", "range"] as const satisfies readonly StatKey[];
export type ExoStat = (typeof EXO_STATS)[number];
export type Exos = Record<ExoStat, boolean>;
/** Ligne de forgemagie ajoutée à la main : une caractéristique et sa valeur. */
export interface ForgemagicLine {
  stat: StatKey;
  value: number;
}
export const FORGEMAGIC_LINES_MAX = 40;
export const FORGEMAGIC_VALUE_MAX = 9999;

/** Valeurs maximales en jeu (jet théorique) : 12 PA, 6 PM, 6 PO. */
export const STAT_CAPS: Record<ExoStat, number> = { ap: 12, mp: 6, range: 6 };

export interface CharacterInput {
  level: number;
  /** Points de caractéristique investis. */
  base: Record<Characteristic, number>;
  /** Parchemins (0 à 100 par caractéristique). */
  scrolls: Record<Characteristic, number>;
  items: DofusItem[];
  /** Panoplies des objets équipés (pour leurs bonus). */
  sets: DofusSet[];
  /** Exos PA, PM, PO appliqués par forgemagie. */
  exos?: Partial<Exos>;
  /** Caractéristiques ajoutées librement par forgemagie. */
  forgemagic?: ForgemagicLine[];
}

/** Coût en points de caractéristique pour atteindre `value` dans une caractéristique. */
export function characteristicCost(stat: Characteristic, value: number): number {
  const v = Math.max(0, Math.floor(value));
  if (stat === "vitality") return v;
  if (stat === "wisdom") return v * 3;
  // 1 point par point jusqu'à 100, puis 2, 3, et 4 au-delà de 300.
  let cost = 0;
  for (const [from, to, price] of [
    [0, 100, 1],
    [100, 200, 2],
    [200, 300, 3],
    [300, Infinity, 4],
  ] as const) {
    if (v > from) cost += (Math.min(v, to) - from) * price;
  }
  return cost;
}

export function availablePoints(level: number): number {
  return (clampLevel(level) - 1) * 5;
}

export const clampLevel = (level: number) =>
  Math.min(LEVEL_MAX, Math.max(1, Math.floor(level) || 1));

export interface ActiveSetBonus {
  set: DofusSet;
  count: number;
  effects: DofusEffect[];
}

export interface CharacterResult {
  totals: StatTotals;
  /** Bonus apportés par les objets et panoplies, avant les règles de calcul. */
  fromGear: StatTotals;
  hp: number;
  pointsSpent: number;
  pointsLeft: number;
  activeSets: ActiveSetBonus[];
  /** Niveau du stuff (objet le plus haut). */
  gearLevel: number;
}

const emptyTotals = (): StatTotals =>
  Object.fromEntries(Object.keys(STATS).map((k) => [k, 0])) as StatTotals;

function addEffects(target: StatTotals, effects: DofusEffect[]) {
  for (const e of effects) if (e.stat) target[e.stat] += e.value;
}

/** Bonus de panoplie actifs selon le nombre d'objets équipés de chaque panoplie. */
export function activeSetBonuses(items: DofusItem[], sets: DofusSet[]): ActiveSetBonus[] {
  const result: ActiveSetBonus[] = [];
  for (const set of sets) {
    const ids = new Set(items.filter((i) => i.set?.id === set.id).map((i) => i.id));
    const count = ids.size;
    if (count < 2) continue;
    const tiers = Object.keys(set.bonuses)
      .map(Number)
      .filter((n) => n <= count)
      .sort((a, b) => b - a);
    const effects = tiers.length > 0 ? (set.bonuses[tiers[0]!] ?? []) : [];
    if (effects.length > 0) result.push({ set, count, effects });
  }
  return result;
}

/** Calcule toutes les caractéristiques finales du personnage. */
export function computeCharacter(input: CharacterInput): CharacterResult {
  const level = clampLevel(input.level);
  const fromGear = emptyTotals();
  for (const item of input.items) addEffects(fromGear, item.effects);
  const activeSets = activeSetBonuses(input.items, input.sets);
  for (const bonus of activeSets) addEffects(fromGear, bonus.effects);
  for (const line of input.forgemagic ?? []) fromGear[line.stat] += line.value;

  const totals = { ...fromGear };
  for (const c of CHARACTERISTICS) {
    totals[c] += Math.max(0, input.base[c] ?? 0) + clampScroll(input.scrolls[c] ?? 0);
  }

  const tenth = (n: number) => Math.floor(Math.max(0, n) / 10);
  totals.ap += level >= 100 ? 7 : 6;
  totals.mp += 3;
  totals.summons += 1;
  totals.prospecting += 100 + tenth(totals.chance);
  totals.initiative += totals.strength + totals.intelligence + totals.chance + totals.agility;
  totals.pods += 1000 + 5 * totals.strength;
  totals.lock += tenth(totals.agility);
  totals.dodge += tenth(totals.agility);
  for (const k of ["apParry", "mpParry", "apReduction", "mpReduction"] as const) {
    totals[k] += tenth(totals.wisdom);
  }

  // Exos de forgemagie, puis plafonds du jeu (12 PA, 6 PM, 6 PO).
  for (const k of EXO_STATS) {
    if (input.exos?.[k]) totals[k] += 1;
    totals[k] = Math.min(totals[k], STAT_CAPS[k]);
  }

  const pointsSpent = CHARACTERISTICS.reduce(
    (sum, c) => sum + characteristicCost(c, input.base[c] ?? 0),
    0,
  );

  return {
    totals,
    fromGear,
    hp: 50 + 5 * level + totals.vitality,
    pointsSpent,
    pointsLeft: availablePoints(level) - pointsSpent,
    activeSets,
    gearLevel: input.items.reduce((max, i) => Math.max(max, i.level), 0),
  };
}

const clampScroll = (n: number) => Math.min(SCROLL_MAX, Math.max(0, Math.floor(n) || 0));

// ─── Conditions ────────────────────────────────────────────────────────────

/** Vérifie les conditions d'un objet ; une condition inconnue est considérée remplie. */
export function conditionsMet(
  tree: DofusConditionTree | null,
  ctx: { level: number; totals: StatTotals },
): boolean {
  if (!tree) return true;
  if (tree.kind !== "condition") {
    return tree.kind === "and"
      ? tree.children.every((c) => conditionsMet(c, ctx))
      : tree.children.some((c) => conditionsMet(c, ctx));
  }
  const { stat, operator, value } = tree.condition;
  if (stat === null) return true;
  const actual = stat === "level" ? ctx.level : ctx.totals[stat];
  switch (operator) {
    case ">":
      return actual > value;
    case "<":
      return actual < value;
    case "=":
      return actual === value;
    case "!":
      return actual !== value;
  }
}

/** Texte lisible d'un arbre de conditions (ex. « Force > 249 et Agilité > 249 »). */
export function conditionsText(tree: DofusConditionTree | null): string {
  if (!tree) return "";
  if (tree.kind === "condition") {
    const { label, operator, value } = tree.condition;
    const op = operator === "!" ? "≠" : operator;
    return `${label} ${op} ${value}`;
  }
  const parts = tree.children.map((c) =>
    c.kind === "condition" ? conditionsText(c) : `(${conditionsText(c)})`,
  );
  return parts.join(tree.kind === "and" ? " et " : " ou ");
}

// ─── Stuffs enregistrés ────────────────────────────────────────────────────

export const BUILD_NAME_MAX = 40;
export const BUILD_NOTES_MAX = 255;
/** Nombre maximal de stuffs enregistrés par membre. */
export const BUILDS_PER_USER_MAX = 50;
/** Image du personnage : côté maximal (px) et taille maximale encodée. */
export const BUILD_IMAGE_SIZE = 360;
export const BUILD_IMAGE_MAX_CHARS = 150_000;

const characteristicValues = (max: number) =>
  z.object(
    Object.fromEntries(CHARACTERISTICS.map((c) => [c, z.number().int().min(0).max(max)])) as Record<
      Characteristic,
      z.ZodNumber
    >,
  );

const SLOT_IDS = SLOTS.map((s) => s.id) as [SlotId, ...SlotId[]];

/** Éléments qu'on peut associer à un stuff (« multi » exclut les autres). */
export const BUILD_ELEMENT_TAGS = ["earth", "fire", "water", "air", "multi"] as const;
export type BuildElementTag = (typeof BUILD_ELEMENT_TAGS)[number];
export const BUILD_ELEMENT_LABELS: Record<BuildElementTag, string> = {
  earth: "Terre",
  fire: "Feu",
  water: "Eau",
  air: "Air",
  multi: "Multi",
};
/** Nombre maximal de classes associées à un stuff. */
export const BUILD_CLASS_TAGS_MAX = 20;

/**
 * Sélection d'éléments : « multi » est exclusif (le choisir retire les autres,
 * choisir un élément retire « multi »).
 */
export function toggleElementTag(
  current: readonly BuildElementTag[],
  tag: BuildElementTag,
): BuildElementTag[] {
  if (current.includes(tag)) return current.filter((t) => t !== tag);
  if (tag === "multi") return ["multi"];
  return [...current.filter((t) => t !== "multi"), tag];
}

export const buildTagsSchema = z
  .object({
    elements: z
      .array(z.enum(BUILD_ELEMENT_TAGS, "Élément inconnu."))
      .max(BUILD_ELEMENT_TAGS.length)
      .refine((l) => new Set(l).size === l.length, "Élément en double.")
      .refine(
        (l) => !l.includes("multi") || l.length === 1,
        "« Multi » exclut les autres éléments.",
      ),
    classes: z
      .array(z.number().int().positive())
      .max(BUILD_CLASS_TAGS_MAX)
      .refine((l) => new Set(l).size === l.length, "Classe en double."),
  })
  .default({ elements: [], classes: [] });
export type BuildTags = z.infer<typeof buildTagsSchema>;

/** Contenu d'un stuff : ce que le simulateur enregistre. */
export const dofusBuildSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Donnez un nom à ce stuff.")
    .max(BUILD_NAME_MAX, `Le nom doit contenir au plus ${BUILD_NAME_MAX} caractères.`),
  level: z.number().int().min(1).max(LEVEL_MAX),
  base: characteristicValues(995),
  scrolls: characteristicValues(SCROLL_MAX),
  slots: z.partialRecord(z.enum(SLOT_IDS), z.number().int().positive()),
  notes: z.string().max(BUILD_NOTES_MAX).default(""),
  /** Exos de forgemagie PA, PM, PO. */
  exos: z
    .object({ ap: z.boolean(), mp: z.boolean(), range: z.boolean() })
    .default({ ap: false, mp: false, range: false }),
  /** Caractéristiques ajoutées librement par forgemagie. */
  forgemagic: z
    .array(
      z.object({
        stat: z.enum(Object.keys(STATS) as [StatKey, ...StatKey[]], "Caractéristique inconnue."),
        value: z.number().int().min(-FORGEMAGIC_VALUE_MAX).max(FORGEMAGIC_VALUE_MAX),
      }),
    )
    .max(FORGEMAGIC_LINES_MAX)
    .default([]),
  /** Tags choisis par le joueur pour retrouver ses stuffs. */
  tags: buildTagsSchema,
  /** Classe choisie pour le calcul des dégâts (identifiant DofusDB), ou null. */
  breedId: z.number().int().positive().nullable().default(null),
  /** Image du personnage (data URL PNG, JPEG ou WebP), réduite par le navigateur. */
  image: z
    .string()
    .max(BUILD_IMAGE_MAX_CHARS, "Image trop lourde.")
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Image invalide.")
    .nullable()
    .default(null),
});
export type DofusBuildData = z.infer<typeof dofusBuildSchema>;

export interface DofusBuildSummary {
  id: string;
  name: string;
  level: number;
  itemCount: number;
  tags: BuildTags;
  updatedAt: string;
}

/** Un stuff correspond au filtre s'il a l'un des éléments et l'une des classes choisis. */
export function buildMatchesTags(tags: BuildTags, filter: BuildTags): boolean {
  const elementOk =
    filter.elements.length === 0 || filter.elements.some((e) => tags.elements.includes(e));
  const classOk =
    filter.classes.length === 0 || filter.classes.some((c) => tags.classes.includes(c));
  return elementOk && classOk;
}

export interface DofusBuild extends DofusBuildSummary {
  data: DofusBuildData;
}

// ─── Classes, sorts et calcul des dégâts ───────────────────────────────────

export type DofusElement = "neutral" | "earth" | "fire" | "water" | "air";

export const ELEMENTS: Record<
  DofusElement,
  { label: string; stat: Characteristic; damage: StatKey }
> = {
  neutral: { label: "Neutre", stat: "strength", damage: "neutralDamage" },
  earth: { label: "Terre", stat: "strength", damage: "earthDamage" },
  fire: { label: "Feu", stat: "intelligence", damage: "fireDamage" },
  water: { label: "Eau", stat: "chance", damage: "waterDamage" },
  air: { label: "Air", stat: "agility", damage: "airDamage" },
};

export interface DofusBreed {
  id: number;
  name: string;
  icon: string | null;
}

/** Ligne de dégâts d'un sort : élément, jet minimum et maximum. */
export interface SpellDamageLine {
  element: DofusElement;
  /** « steal » : vol de vie (mêmes dégâts, le lanceur est soigné). */
  kind: "damage" | "steal";
  min: number;
  max: number;
}

export interface SpellGrade {
  grade: number;
  /** Niveau de personnage nécessaire. */
  minLevel: number;
  apCost: number;
  minRange: number;
  range: number;
  /** Taux de critique de base du sort (%). */
  criticalChance: number;
  lines: SpellDamageLine[];
  criticalLines: SpellDamageLine[];
}

export interface DofusSpell {
  id: number;
  name: string;
  icon: string | null;
  /** Les deux sorts d'une même paire de variantes partagent ce numéro. */
  variant: number;
  grades: SpellGrade[];
}

/** Éléments de dégâts distincts d'un sort (tous grades confondus). */
export function spellElements(spell: DofusSpell): DofusElement[] {
  return [...new Set(spell.grades.flatMap((g) => g.lines.map((l) => l.element)))];
}

/**
 * Filtre des sorts par élément : un sort passe s'il frappe dans l'un des
 * éléments choisis ; « multi » garde les sorts à plusieurs éléments.
 */
export function spellMatchesElements(
  spell: DofusSpell,
  filter: readonly BuildElementTag[],
): boolean {
  if (filter.length === 0) return true;
  const elements = spellElements(spell);
  if (filter.includes("multi")) return elements.length > 1;
  return elements.some((e) => (filter as readonly string[]).includes(e));
}

/** Grade d'un sort utilisable au niveau donné (le plus élevé), ou null. */
export function spellGradeAt(spell: DofusSpell, level: number): SpellGrade | null {
  const usable = spell.grades.filter((g) => g.minLevel <= level);
  return usable.sort((a, b) => b.grade - a.grade)[0] ?? null;
}

export interface LineDamage {
  element: DofusElement;
  kind: SpellDamageLine["kind"];
  normal: { min: number; max: number };
  critical: { min: number; max: number } | null;
}

export interface SpellDamage {
  lines: LineDamage[];
  /** Chance de coup critique retenue (%), entre 0 et 100. */
  criticalChance: number;
  /** Dégâts moyens par lancer, critiques compris (cible sans résistance). */
  average: number;
  /** Portée considérée : mêlée (portée 1) ou distance. */
  melee: boolean;
}

/**
 * Dégâts d'un sort sur une cible sans résistances :
 * (jet × (100 + caractéristique + puissance) / 100 + dommages + dommages de l'élément)
 * × (100 + % dommages aux sorts + % dommages mêlée ou distance) / 100.
 * En coup critique, le jet critique est utilisé et les dommages critiques s'ajoutent.
 */
export function computeSpellDamage(totals: StatTotals, grade: SpellGrade): SpellDamage {
  const melee = grade.range <= 1;
  const finalPct =
    100 + totals.spellDamagePct + (melee ? totals.meleeDamagePct : totals.rangedDamagePct);

  const hit = (line: SpellDamageLine, roll: number, critical: boolean) => {
    const element = ELEMENTS[line.element];
    const stat = Math.max(0, totals[element.stat]) + totals.power;
    const fixed = totals.damage + totals[element.damage] + (critical ? totals.criticalDamage : 0);
    const base = Math.floor((roll * (100 + stat)) / 100) + fixed;
    return Math.max(0, Math.floor((base * finalPct) / 100));
  };

  const lines: LineDamage[] = grade.lines.map((line, i) => {
    const critLine =
      grade.criticalLines.find((c, j) => j === i && c.element === line.element) ??
      grade.criticalLines.find((c) => c.element === line.element && c.kind === line.kind);
    return {
      element: line.element,
      kind: line.kind,
      normal: { min: hit(line, line.min, false), max: hit(line, line.max, false) },
      critical: critLine
        ? { min: hit(critLine, critLine.min, true), max: hit(critLine, critLine.max, true) }
        : null,
    };
  });

  const criticalChance = Math.min(100, Math.max(0, grade.criticalChance + totals.critical));
  const p = criticalChance / 100;
  const average = lines.reduce((sum, l) => {
    const normal = (l.normal.min + l.normal.max) / 2;
    const crit = l.critical ? (l.critical.min + l.critical.max) / 2 : normal;
    return sum + (1 - p) * normal + p * crit;
  }, 0);

  return { lines, criticalChance, average: Math.round(average), melee };
}
