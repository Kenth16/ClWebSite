import {
  CHARACTERISTICS,
  ELEMENTS,
  LEVEL_MAX,
  SCROLL_MAX,
  SLOTS,
  STAT_CAPS,
  availablePoints,
  characteristicCost,
  computeSpellDamage,
  spellGradeAt,
  type Characteristic,
  type DofusElement,
  type DofusItem,
  type DofusSet,
  type DofusSpell,
  type Exos,
  type SlotFamily,
  type SlotId,
  type SpellGrade,
  type StatKey,
  type StatTotals,
} from "./dofus";
import { z } from "zod";

// ─── Demande ───────────────────────────────────────────────────────────────

export const OPTIMIZER_ELEMENTS = ["earth", "fire", "water", "air", "neutral"] as const;
export const OPTIMIZER_AP_MIN = 6;

export const optimizeRequestSchema = z.object({
  breedId: z.number().int().positive("Choisissez une classe."),
  level: z.number().int().min(1).max(LEVEL_MAX),
  elements: z
    .array(z.enum(OPTIMIZER_ELEMENTS, "Élément inconnu."))
    .min(1, "Choisissez au moins un élément.")
    .max(OPTIMIZER_ELEMENTS.length)
    .refine((l) => new Set(l).size === l.length, "Élément en double."),
  /** PA que le stuff doit atteindre ; le combo du tour se calcule sur ces PA. */
  ap: z.number().int().min(OPTIMIZER_AP_MIN).max(STAT_CAPS.ap),
  /** Exos PA, PM, PO que le joueur peut se payer (+1 chacun sur un objet). */
  exos: z
    .object({ ap: z.boolean(), mp: z.boolean(), range: z.boolean() })
    .default({ ap: false, mp: false, range: false }),
});
export type OptimizeRequest = z.infer<typeof optimizeRequestSchema>;

export type StatWeights = Partial<Record<StatKey, number>>;

// ─── Éléments des sorts de la classe ───────────────────────────────────────

export interface ElementShare {
  element: DofusElement;
  /** Part des dégâts des sorts de la classe dans cet élément (0 à 1). */
  share: number;
}

/** Part de chaque élément dans les dégâts des sorts utilisables au niveau donné. */
export function classElements(spells: readonly DofusSpell[], level: number): ElementShare[] {
  const sums: Partial<Record<DofusElement, number>> = {};
  for (const spell of spells) {
    const grade = spellGradeAt(spell, level);
    if (!grade) continue;
    for (const line of grade.lines) {
      sums[line.element] = (sums[line.element] ?? 0) + (line.min + line.max) / 2;
    }
  }
  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return (Object.entries(sums) as [DofusElement, number][])
    .map(([element, sum]) => ({ element, share: sum / total }))
    .sort((a, b) => b.share - a.share);
}

// ─── Points de caractéristique ─────────────────────────────────────────────

/** Caractéristiques des éléments choisis (Terre et Neutre partagent la Force). */
export function elementCharacteristics(elements: readonly DofusElement[]): Characteristic[] {
  return [...new Set(elements.map((e) => ELEMENTS[e].stat))];
}

/**
 * Répartit tous les points de caractéristique du niveau entre les
 * caractéristiques données, en les gardant aussi égales que possible.
 */
export function allocatePoints(
  level: number,
  stats: readonly Characteristic[],
): Record<Characteristic, number> {
  const base = Object.fromEntries(CHARACTERISTICS.map((c) => [c, 0])) as Record<
    Characteristic,
    number
  >;
  let left = availablePoints(level);
  if (stats.length === 0) return base;
  for (;;) {
    // On monte la plus basse d'un point, si on peut encore le payer.
    const stat = [...stats].sort((a, b) => base[a] - base[b])[0]!;
    const cost = characteristicCost(stat, base[stat] + 1) - characteristicCost(stat, base[stat]);
    if (cost > left) break;
    base[stat] += 1;
    left -= cost;
  }
  return base;
}

// ─── Combo de sorts sur un tour ────────────────────────────────────────────

export interface ComboCast {
  spellId: number;
  name: string;
  icon: string | null;
  casts: number;
  apCost: number;
  /** Dégâts moyens par lancer (critiques compris). */
  perCast: number;
}

export interface TurnCombo {
  /** Dégâts moyens du tour (critiques compris). */
  damage: number;
  apUsed: number;
  casts: ComboCast[];
}

/** Sort retenu pour les combos : grade au niveau, coût et limite de lancers. */
export interface TurnSpell {
  spell: DofusSpell;
  grade: SpellGrade;
  limit: number;
}

/**
 * Sorts utilisables pour un tour : grade disponible au niveau, des dégâts,
 * et uniquement dans les éléments choisis.
 */
export function turnSpells(
  spells: readonly DofusSpell[],
  level: number,
  elements: readonly DofusElement[],
  ap: number,
): TurnSpell[] {
  const allowed = new Set(elements);
  const result: TurnSpell[] = [];
  for (const spell of spells) {
    const grade = spellGradeAt(spell, level);
    if (!grade || grade.lines.length === 0 || grade.apCost <= 0 || grade.apCost > ap) continue;
    if (!grade.lines.every((l) => allowed.has(l.element))) continue;
    const byAp = Math.floor(ap / grade.apCost);
    result.push({ spell, grade, limit: Math.min(byAp, grade.maxCastsPerTurn ?? byAp) });
  }
  return result;
}

/**
 * Meilleure suite de sorts pour `ap` PA : sac à dos à choix multiples, car
 * on ne peut équiper qu'une des deux variantes de chaque sort, et chaque sort
 * a une limite de lancers par tour.
 */
export function bestCombo(
  spells: readonly TurnSpell[],
  ap: number,
  perCast: (s: TurnSpell) => number,
): { damage: number; picks: { spell: TurnSpell; casts: number }[] } {
  const groups = new Map<number, TurnSpell[]>();
  for (const s of spells) groups.set(s.spell.variant, [...(groups.get(s.spell.variant) ?? []), s]);

  type Cell = { damage: number; picks: { spell: TurnSpell; casts: number }[] };
  let dp: Cell[] = Array.from({ length: ap + 1 }, () => ({ damage: 0, picks: [] }));
  for (const options of groups.values()) {
    const next = dp.map((c) => ({ ...c }));
    for (const s of options) {
      const value = perCast(s);
      if (value <= 0) continue;
      for (let n = 1; n <= s.limit; n++) {
        const cost = n * s.grade.apCost;
        for (let a = cost; a <= ap; a++) {
          const damage = dp[a - cost]!.damage + n * value;
          if (damage > next[a]!.damage) {
            next[a] = { damage, picks: [...dp[a - cost]!.picks, { spell: s, casts: n }] };
          }
        }
      }
    }
    dp = next;
  }
  return dp[ap]!;
}

/** Dégâts du meilleur combo seulement (même calcul, sans garder le détail : plus rapide). */
export function bestComboDamage(
  spells: readonly TurnSpell[],
  groups: readonly (readonly number[])[],
  ap: number,
  perCast: (s: TurnSpell) => number,
): number {
  let dp = new Float64Array(ap + 1);
  for (const group of groups) {
    const next = dp.slice();
    for (const index of group) {
      const s = spells[index]!;
      const value = perCast(s);
      if (value <= 0) continue;
      for (let n = 1; n <= s.limit; n++) {
        const cost = n * s.grade.apCost;
        for (let a = cost; a <= ap; a++) {
          const damage = dp[a - cost]! + n * value;
          if (damage > next[a]!) next[a] = damage;
        }
      }
    }
    dp = next;
  }
  return dp[ap]!;
}

/** Combo exact (formule complète du calcul des dégâts) pour des caractéristiques finales. */
export function turnCombo(totals: StatTotals, spells: readonly TurnSpell[], ap: number): TurnCombo {
  // Combo choisi et total sur les moyennes exactes (comme l'optimiseur), puis arrondis.
  const best = bestCombo(spells, ap, (s) => computeSpellDamage(totals, s.grade).exactAverage);
  const casts = best.picks
    .map(({ spell, casts }) => ({
      spellId: spell.spell.id,
      name: spell.spell.name,
      icon: spell.spell.icon,
      casts,
      apCost: spell.grade.apCost,
      perCast: computeSpellDamage(totals, spell.grade).average,
    }))
    .sort((a, b) => b.perCast * b.casts - a.perCast * a.casts);
  return {
    damage: Math.round(best.damage),
    apUsed: casts.reduce((sum, c) => sum + c.casts * c.apCost, 0),
    casts,
  };
}

/**
 * Version rapide des dégâts moyens d'un lancer (sans les arrondis du jeu),
 * utilisée pendant la recherche où des milliers de stuffs sont comparés.
 */
export function fastPerCast(s: TurnSpell, t: (k: StatKey) => number): number {
  const { grade } = s;
  const melee = grade.range <= 1;
  const finalPct = 100 + t("spellDamagePct") + t(melee ? "meleeDamagePct" : "rangedDamagePct");
  const p = Math.min(100, Math.max(0, grade.criticalChance + t("critical"))) / 100;
  let sum = 0;
  grade.lines.forEach((line, i) => {
    const el = ELEMENTS[line.element];
    const stat = Math.max(0, t(el.stat)) + t("power");
    const fixed = t("damage") + t(el.damage);
    const normal = ((line.min + line.max) / 2) * (1 + stat / 100) + fixed;
    const critLine =
      grade.criticalLines.find((c, j) => j === i && c.element === line.element) ??
      grade.criticalLines.find((c) => c.element === line.element && c.kind === line.kind);
    // Un coup critique ne fait jamais moins qu'un coup normal : les dégâts
    // augmentent ainsi toujours avec le % critique (nécessaire à l'optimiseur exact).
    const crit = critLine
      ? Math.max(
          normal,
          ((critLine.min + critLine.max) / 2) * (1 + stat / 100) + fixed + t("criticalDamage"),
        )
      : normal;
    sum += Math.max(0, (1 - p) * normal + p * crit);
  });
  return (sum * finalPct) / 100;
}

// ─── Recherche du stuff ────────────────────────────────────────────────────

/**
 * Objets de maître du jeu ou de test, interdits en jeu normal : jamais proposés
 * par l'optimiseur. Les objets dont le nom contient « (MJ) » le sont aussi.
 */
export const EXCLUDED_ITEMS: readonly { id: number; name: string }[] = [
  { id: 2154, name: "Bague De Sendar" },
  { id: 2155, name: "Amulette de Jiva" },
  { id: 6894, name: "Surpuissant Chacha de Combat (MJ)" },
  { id: 6895, name: "Petit Chacha de Combat (MJ)" },
  { id: 7913, name: "Le Diviseur (MJ)" },
  { id: 9031, name: "Annobusé de Maître Jarbo" },
];
const EXCLUDED_IDS = new Set(EXCLUDED_ITEMS.map((i) => i.id));

/** L'objet est-il autorisé (pas un objet de MJ) ? */
export function isAllowedItem(item: Pick<DofusItem, "id" | "name">): boolean {
  return !EXCLUDED_IDS.has(item.id) && !/\(MJ\)/i.test(item.name);
}

/** Groupe d'objets dont un seul exemplaire peut être porté (une seule Prysmaradite). */
function uniqueGroup(item: Pick<DofusItem, "type">): string | null {
  return /prysmaradite/i.test(item.type) ? "prysmaradite" : null;
}

/** Poids approximatifs pour présélectionner les objets utiles à des éléments donnés. */
export function damageProxyWeights(elements: readonly DofusElement[]): StatWeights {
  const weights: StatWeights = {
    power: 1,
    damage: 5,
    criticalDamage: 2,
    critical: 3,
    spellDamagePct: 5,
    meleeDamagePct: 2,
    rangedDamagePct: 2,
    ap: 150,
  };
  for (const e of elements) {
    weights[ELEMENTS[e].stat] = 1;
    weights[ELEMENTS[e].damage] = 5;
  }
  return weights;
}

interface Candidate {
  id: number;
  family: SlotFamily;
  setId: number | null;
  group: string | null;
  stats: [StatKey, number][];
  /** Valeur de l'objet seul (poids approximatifs). */
  value: number;
}

export interface OptimizeInput {
  level: number;
  /** Poids approximatifs : présélection des objets et premier stuff. */
  weights: StatWeights;
  /**
   * Note d'un stuff à partir de ses caractéristiques totales (base comprise,
   * PA/PM/PO plafonnés). Sans objectif : somme pondérée par `weights`.
   */
  objective?: (total: (k: StatKey) => number) => number;
  /** Caractéristiques hors équipement (points, parchemins, PA/PM de base). */
  base?: StatWeights;
  items: readonly DofusItem[];
  sets: readonly DofusSet[];
  perFamily?: number;
  restarts?: number;
  seed?: number;
}

export interface OptimizeResult {
  slots: Partial<Record<SlotId, number>>;
  score: number;
  evaluations: number;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOT_LIST = SLOTS.map((s) => ({ id: s.id as SlotId, family: s.family as SlotFamily }));

/**
 * Cherche le stuff qui maximise l'objectif, bonus de panoplie compris :
 * présélection par poids approximatifs, stuff glouton, recherche locale
 * (changer un objet, poser une panoplie entière) puis redémarrages perturbés.
 */
export function optimizeStuff(input: OptimizeInput): OptimizeResult {
  const { weights, level } = input;
  const perFamily = input.perFamily ?? 40;
  const restarts = input.restarts ?? 10;
  const rand = random(input.seed ?? 42);
  const w = (k: StatKey) => weights[k] ?? 0;
  const objective =
    input.objective ??
    ((total: (k: StatKey) => number) => {
      let score = 0;
      for (const k of Object.keys(weights) as StatKey[]) score += w(k) * total(k);
      return score;
    });

  const setOf = new Map<number, number>();
  for (const set of input.sets) for (const id of set.itemIds) setOf.set(id, set.id);

  const toPairs = (effects: DofusItem["effects"]) => {
    const acc = new Map<StatKey, number>();
    for (const e of effects) if (e.stat) acc.set(e.stat, (acc.get(e.stat) ?? 0) + e.value);
    return [...acc.entries()];
  };

  const all: Candidate[] = [];
  for (const item of input.items) {
    if (!item.family || item.level > level || !isAllowedItem(item)) continue;
    const stats = toPairs(item.effects);
    all.push({
      id: item.id,
      family: item.family,
      setId: setOf.get(item.id) ?? null,
      group: uniqueGroup(item),
      stats,
      value: stats.reduce((sum, [k, v]) => sum + w(k) * v, 0),
    });
  }

  // Par famille : les meilleurs objets seuls, plus les autres objets de leurs panoplies.
  const kept = new Set<number>();
  const keptSets = new Set<number>();
  for (const family of new Set(SLOT_LIST.map((s) => s.family))) {
    const best = all
      .filter((c) => c.family === family)
      .sort((a, b) => b.value - a.value)
      .slice(0, perFamily);
    for (const c of best) {
      kept.add(c.id);
      if (c.setId !== null) keptSets.add(c.setId);
    }
  }
  for (const c of all) if (c.setId !== null && keptSets.has(c.setId)) kept.add(c.id);
  const byId = new Map<number, Candidate>();
  const byFamily = new Map<SlotFamily, Candidate[]>();
  for (const c of all) {
    if (!kept.has(c.id)) continue;
    byId.set(c.id, c);
    byFamily.set(c.family, [...(byFamily.get(c.family) ?? []), c]);
  }

  // Bonus de panoplie cumulés selon le nombre d'objets portés.
  const setTiers = new Map<number, ([StatKey, number][] | null)[]>();
  for (const set of input.sets) {
    if (!keptSets.has(set.id)) continue;
    const tiers: ([StatKey, number][] | null)[] = [];
    let last: [StatKey, number][] | null = null;
    for (let n = 0; n <= set.itemIds.length; n++) {
      const effects = set.bonuses[n];
      if (n >= 2 && effects && effects.length > 0) last = toPairs(effects);
      tiers[n] = n >= 2 ? last : null;
    }
    setTiers.set(set.id, tiers);
  }

  const base = Object.entries(input.base ?? {}) as [StatKey, number][];
  let evaluations = 0;
  const totals = new Map<StatKey, number>();
  const counts = new Map<number, number>();
  const add = (pairs: [StatKey, number][]) => {
    for (const [k, v] of pairs) totals.set(k, (totals.get(k) ?? 0) + v);
  };
  const capped = (k: StatKey) => {
    const v = totals.get(k) ?? 0;
    return k === "ap" || k === "mp" || k === "range" ? Math.min(v, STAT_CAPS[k]) : v;
  };
  function evaluate(slots: (Candidate | null)[]): number {
    evaluations++;
    totals.clear();
    counts.clear();
    add(base);
    for (const c of slots) {
      if (!c) continue;
      add(c.stats);
      if (c.setId !== null) counts.set(c.setId, (counts.get(c.setId) ?? 0) + 1);
    }
    for (const [setId, n] of counts) {
      const tier = setTiers.get(setId)?.[n];
      if (tier) add(tier);
    }
    return objective(capped);
  }

  /** L'objet est-il déjà porté ailleurs (ou un autre objet de son groupe unique) ? */
  const used = (slots: (Candidate | null)[], id: number, except: number) => {
    const group = byId.get(id)?.group ?? null;
    return slots.some(
      (c, i) =>
        i !== except && c !== null && (c.id === id || (group !== null && c.group === group)),
    );
  };

  function greedy(): (Candidate | null)[] {
    const slots: (Candidate | null)[] = SLOT_LIST.map(() => null);
    SLOT_LIST.forEach((slot, i) => {
      const options = [...(byFamily.get(slot.family) ?? [])].sort((a, b) => b.value - a.value);
      slots[i] = options.find((c) => !used(slots, c.id, i)) ?? null;
    });
    return slots;
  }

  /** Pose tous les objets d'une panoplie, en remplaçant les moins utiles. */
  function withSet(slots: (Candidate | null)[], setId: number): (Candidate | null)[] {
    const next = [...slots];
    const placed = new Set<number>();
    for (const c of byId.values()) {
      if (c.setId !== setId || next.some((x) => x?.id === c.id)) continue;
      const free = SLOT_LIST.map((s, i) => ({ s, i })).filter(
        ({ s, i }) => s.family === c.family && !placed.has(i),
      );
      if (free.length === 0) continue;
      const target = free.reduce((worst, cur) =>
        (next[cur.i]?.value ?? -Infinity) < (next[worst.i]?.value ?? -Infinity) ? cur : worst,
      );
      next[target.i] = c;
      placed.add(target.i);
    }
    return next;
  }

  function localSearch(start: (Candidate | null)[]) {
    let slots = start;
    let score = evaluate(slots);
    for (let round = 0; round < 30; round++) {
      let improved = false;
      for (let i = 0; i < SLOT_LIST.length; i++) {
        // Chaque objet de la famille, ou l'emplacement vide (si tous les objets nuisent).
        for (const c of [...(byFamily.get(SLOT_LIST[i]!.family) ?? []), null]) {
          if (c === null ? slots[i] === null : c.id === slots[i]?.id || used(slots, c.id, i)) {
            continue;
          }
          const trial = [...slots];
          trial[i] = c;
          const s = evaluate(trial);
          if (s > score + 1e-9) {
            slots = trial;
            score = s;
            improved = true;
          }
        }
      }
      for (const setId of setTiers.keys()) {
        const trial = withSet(slots, setId);
        const s = evaluate(trial);
        if (s > score + 1e-9) {
          slots = trial;
          score = s;
          improved = true;
        }
      }
      if (!improved) break;
    }
    return { slots, score };
  }

  let best = localSearch(greedy());
  const setIds = [...setTiers.keys()];
  for (let r = 0; r < restarts; r++) {
    let start = [...best.slots];
    if (setIds.length > 0 && rand() < 0.5) {
      start = withSet(start, setIds[Math.floor(rand() * setIds.length)]!);
    }
    for (let k = 0; k < 4; k++) {
      const i = Math.floor(rand() * SLOT_LIST.length);
      const options = byFamily.get(SLOT_LIST[i]!.family) ?? [];
      const c = options[Math.floor(rand() * options.length)];
      if (c && !used(start, c.id, i)) start[i] = c;
    }
    const result = localSearch(start);
    if (result.score > best.score) best = result;
  }

  const slots: Partial<Record<SlotId, number>> = {};
  best.slots.forEach((c, i) => {
    if (c) slots[SLOT_LIST[i]!.id] = c.id;
  });
  return { slots, score: best.score, evaluations };
}

// ─── Optimisation des dégâts d'un tour ─────────────────────────────────────

export interface DamageOptimizeInput {
  level: number;
  elements: readonly DofusElement[];
  /** PA visés : le stuff doit les atteindre, le combo se calcule dessus. */
  ap: number;
  /** Exos disponibles : +1 PA, PM ou PO en plus de l'équipement. */
  exos?: Partial<Exos>;
  spells: readonly DofusSpell[];
  items: readonly DofusItem[];
  sets: readonly DofusSet[];
  restarts?: number;
}

/**
 * Stuff qui maximise les dégâts d'un tour : le meilleur combo de sorts des
 * éléments choisis avec les PA visés. Les points de caractéristique sont
 * répartis dans les éléments choisis, parchemins complets ; un stuff qui
 * n'atteint pas les PA visés est fortement pénalisé.
 */
export function optimizeTurnDamage(input: DamageOptimizeInput) {
  const { level, elements, ap } = input;
  const stats = elementCharacteristics(elements);
  const points = allocatePoints(level, stats);
  const scrolls = Object.fromEntries(
    CHARACTERISTICS.map((c) => [c, stats.includes(c) ? SCROLL_MAX : 0]),
  ) as Record<Characteristic, number>;
  // Un exo ajoute +1 à l'équipement : il faut un PA de moins sur les objets.
  const base: StatWeights = {
    ap: (level >= 100 ? 7 : 6) + (input.exos?.ap ? 1 : 0),
    mp: 3 + (input.exos?.mp ? 1 : 0),
    range: input.exos?.range ? 1 : 0,
  };
  for (const c of CHARACTERISTICS) base[c] = points[c] + scrolls[c];

  const spells = turnSpells(input.spells, level, elements, ap);
  const byVariant = new Map<number, number[]>();
  spells.forEach((s, i) =>
    byVariant.set(s.spell.variant, [...(byVariant.get(s.spell.variant) ?? []), i]),
  );
  const groups = [...byVariant.values()];
  const result = optimizeStuff({
    level,
    weights: damageProxyWeights(elements),
    base,
    items: input.items,
    sets: input.sets,
    restarts: input.restarts,
    objective: (total) => {
      const damage = bestComboDamage(spells, groups, ap, (s) => fastPerCast(s, total));
      const missing = Math.max(0, ap - total("ap"));
      return damage - missing * 100_000;
    },
  });
  return { ...result, points, scrolls, spells, base };
}
