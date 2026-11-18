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
  pet: ["pet", "petsmount"],
  dofus: ["dofus", "trophy", "prysmaradite"],
} as const satisfies Record<string, readonly string[]>;

export type SlotFamily = keyof typeof SLOT_TYPES;

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

export function isSlotFamily(value: string): value is SlotFamily {
  return value in SLOT_TYPES;
}

// ─── Personnage ────────────────────────────────────────────────────────────

export const LEVEL_MAX = 200;
export const SCROLL_MAX = 100;

export interface CharacterInput {
  level: number;
  /** Points de caractéristique investis. */
  base: Record<Characteristic, number>;
  /** Parchemins (0 à 100 par caractéristique). */
  scrolls: Record<Characteristic, number>;
  items: DofusItem[];
  /** Panoplies des objets équipés (pour leurs bonus). */
  sets: DofusSet[];
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
