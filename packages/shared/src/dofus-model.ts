/**
 * Modèle des dégâts d'un tour, partagé par les optimiseurs exacts : chaque
 * objet est réduit aux caractéristiques regroupées qui comptent dans la
 * formule, les panoplies à leurs bonus cumulés, et les objets dominés (qui ne
 * peuvent jamais faire mieux qu'un autre, panoplie comprise) sont écartés.
 */
import {
  ELEMENTS,
  SLOTS,
  STAT_CAPS,
  type DofusItem,
  type DofusSet,
  type SlotFamily,
  type SlotId,
  type StatKey,
} from "./dofus";
import {
  bestComboDamage,
  damageProxyWeights,
  isAllowedItem,
  type StatWeights,
  type TurnSpell,
} from "./dofus-optimizer";

export interface DamageModelInput {
  level: number;
  elements: readonly (keyof typeof ELEMENTS)[];
  ap: number;
  /** Caractéristiques hors équipement (points, parchemins, PA de base, exos). */
  base: StatWeights;
  spells: readonly TurnSpell[];
  items: readonly DofusItem[];
  sets: readonly DofusSet[];
}

export type Vec = Float64Array;

export interface Cand {
  id: number;
  /** Indice de la panoplie (ou -1). */
  set: number;
  prysma: boolean;
  v: Vec;
  /** Apport maximal / minimal, panoplie comprise. */
  hi: Vec;
  lo: Vec;
  /** Apport + part maximale du bonus de panoplie par objet porté (pour la borne). */
  up: Vec;
  proxy: number;
}

export function buildDamageModel(input: DamageModelInput) {
  const { ap: apTarget, spells } = input;
  // ── Caractéristiques regroupées comme dans la formule des dégâts ────────
  // AP ; (caractéristique + Puissance) par élément ; (Dommages + Do élément) ;
  // % critique ; dommages critiques ; (% sorts + % mêlée) et (% sorts + % distance).
  const contrib = new Map<StatKey, [number, number][]>();
  let D = 0;
  const feature = (...stats: StatKey[]) => {
    const index = D++;
    for (const k of stats) contrib.set(k, [...(contrib.get(k) ?? []), [index, 1]]);
    return index;
  };
  const AP = feature("ap");
  const statFeature = new Map<string, number>();
  const damageFeature = new Map<string, number>();
  for (const e of input.elements) {
    const { stat, damage } = ELEMENTS[e];
    if (!statFeature.has(stat)) statFeature.set(stat, feature(stat, "power"));
    damageFeature.set(e, feature("damage", damage));
  }
  const CRIT = feature("critical");
  const CRIT_DMG = feature("criticalDamage");
  const MELEE = spells.some((s) => s.grade.range <= 1)
    ? feature("spellDamagePct", "meleeDamagePct")
    : -1;
  const RANGED = spells.some((s) => s.grade.range > 1)
    ? feature("spellDamagePct", "rangedDamagePct")
    : -1;

  const groupsMap = new Map<number, number[]>();
  spells.forEach((s, i) =>
    groupsMap.set(s.spell.variant, [...(groupsMap.get(s.spell.variant) ?? []), i]),
  );
  const groups = [...groupsMap.values()];

  const vecOf = (effects: readonly { stat: StatKey | null; value: number }[]) => {
    const v = new Float64Array(D);
    for (const e of effects) {
      for (const [i, c] of (e.stat && contrib.get(e.stat)) || []) v[i]! += c * e.value;
    }
    return v;
  };
  const baseVec = vecOf(
    (Object.entries(input.base) as [StatKey, number][]).map(([stat, value]) => ({ stat, value })),
  );

  // Sorts précalculés : jets moyens et caractéristiques regroupées utilisées.
  const prepared = new Map(
    spells.map((s) => {
      const { grade } = s;
      const lines = grade.lines.map((line, i) => {
        const critLine =
          grade.criticalLines.find((c, j) => j === i && c.element === line.element) ??
          grade.criticalLines.find((c) => c.element === line.element && c.kind === line.kind);
        return {
          stat: statFeature.get(ELEMENTS[line.element].stat)!,
          damage: damageFeature.get(line.element)!,
          normal: (line.min + line.max) / 2,
          crit: critLine ? (critLine.min + critLine.max) / 2 : null,
        };
      });
      return [s, { pct: grade.range <= 1 ? MELEE : RANGED, critBase: grade.criticalChance, lines }];
    }),
  );

  /**
   * Dégâts du tour pour un vecteur d'équipement (base ajoutée ici). Croît avec
   * chaque caractéristique regroupée : c'est ce qui rend la borne valable.
   */
  function objective(gear: Vec): number {
    const f = (i: number) => (i < 0 ? 0 : gear[i]! + baseVec[i]!);
    if (Math.min(f(AP), STAT_CAPS.ap) < apTarget) return -Infinity;
    const critDamage = f(CRIT_DMG);
    const critical = f(CRIT);
    return bestComboDamage(spells, groups, apTarget, (s) => {
      const p = prepared.get(s)!;
      const chance = Math.min(100, Math.max(0, p.critBase + critical)) / 100;
      let sum = 0;
      for (const line of p.lines) {
        const scale = 1 + f(line.stat) / 100;
        const fixed = f(line.damage);
        const normal = line.normal * scale + fixed;
        const crit =
          line.crit === null ? normal : Math.max(normal, line.crit * scale + fixed + critDamage);
        sum += Math.max(0, (1 - chance) * normal + chance * crit);
      }
      return (sum * (100 + f(p.pct))) / 100;
    });
  }

  // ── Panoplies : bonus cumulé selon le nombre d'objets, apports marginaux ──
  const setIndex = new Map<number, number>();
  const setTiers: Vec[][] = [];
  const setOfItem = new Map<number, number>();
  const maxMarg: Vec[] = [];
  const minMarg: Vec[] = [];
  const shares: Vec[] = [];
  for (const set of input.sets) {
    const index = setTiers.length;
    setIndex.set(set.id, index);
    for (const id of set.itemIds) setOfItem.set(id, index);
    const tiers: Vec[] = [];
    let last = new Float64Array(D);
    for (let n = 0; n <= Math.max(set.itemIds.length, 1); n++) {
      const effects = set.bonuses[n];
      if (n >= 2 && effects && effects.length > 0) last = vecOf(effects);
      tiers.push(n >= 2 ? last : new Float64Array(D));
    }
    setTiers.push(tiers);
    const hi = new Float64Array(D).fill(-Infinity);
    const lo = new Float64Array(D).fill(Infinity);
    for (let n = 0; n + 1 < tiers.length; n++) {
      for (let d = 0; d < D; d++) {
        const m = tiers[n + 1]![d]! - tiers[n]![d]!;
        if (m > hi[d]!) hi[d] = m;
        if (m < lo[d]!) lo[d] = m;
      }
    }
    for (let d = 0; d < D; d++) {
      if (!Number.isFinite(hi[d]!)) hi[d] = 0;
      if (!Number.isFinite(lo[d]!)) lo[d] = 0;
    }
    maxMarg.push(hi);
    minMarg.push(lo);
    // Part par objet : bonus(n) / n au mieux. Le bonus total d'une panoplie
    // portée à n objets ne dépasse jamais n × cette part.
    const part = new Float64Array(D);
    for (let n = 2; n < tiers.length; n++) {
      for (let d = 0; d < D; d++) part[d] = Math.max(part[d]!, tiers[n]![d]! / n);
    }
    shares.push(part);
  }

  // ── Candidats par famille ──────────────────────────────────────────────
  const proxyWeights = damageProxyWeights(input.elements as never);
  const byFamily = new Map<SlotFamily, Cand[]>();
  let considered = 0;
  for (const item of input.items) {
    if (!item.family || item.level > input.level || !isAllowedItem(item)) continue;
    considered++;
    const v = vecOf(item.effects);
    const set = setOfItem.get(item.id) ?? -1;
    const hi = new Float64Array(v);
    const lo = new Float64Array(v);
    const up = new Float64Array(v);
    if (set >= 0) {
      for (let d = 0; d < D; d++) {
        hi[d]! += maxMarg[set]![d]!;
        lo[d]! += minMarg[set]![d]!;
        up[d]! += shares[set]![d]!;
      }
    }
    let proxy = 0;
    for (const e of item.effects) if (e.stat) proxy += (proxyWeights[e.stat] ?? 0) * e.value;
    if (set >= 0) proxy += 50; // à explorer tôt : peut compléter une panoplie
    const list = byFamily.get(item.family) ?? [];
    list.push({ id: item.id, set, prysma: /prysmaradite/i.test(item.type), v, hi, lo, up, proxy });
    byFamily.set(item.family, list);
  }

  const slotsOf = (f: SlotFamily) => SLOTS.filter((s) => s.family === f).length;
  const geq = (a: Vec, b: Vec) => {
    for (let d = 0; d < D; d++) if (a[d]! < b[d]!) return false;
    return true;
  };
  const equal = (a: Vec, b: Vec) => {
    for (let d = 0; d < D; d++) if (a[d]! !== b[d]!) return false;
    return true;
  };
  const zero = new Float64Array(D);

  // Dominance : b remplace a sans perte si son apport minimal ≥ l'apport maximal de a.
  for (const [family, list] of byFamily) {
    const k = slotsOf(family);
    const kept = list.filter((a) => {
      if (geq(zero, a.hi)) return false; // l'emplacement vide fait au moins aussi bien
      let plain = 0;
      let prysma = 0;
      for (const b of list) {
        if (b === a || (a.set >= 0 && b.set === a.set)) continue;
        if (!geq(b.lo, a.hi)) continue;
        // Égalité parfaite : on n'en garde qu'un (le plus petit identifiant).
        if (equal(b.lo, a.hi) && equal(a.lo, b.hi) && b.id > a.id) continue;
        if (b.prysma) prysma++;
        else plain++;
      }
      if (a.prysma && prysma > 0) return false;
      return plain + Math.min(prysma, 1) < k;
    });
    kept.sort((a, b) => b.proxy - a.proxy);
    byFamily.set(family, kept);
  }

  const itemById = new Map(input.items.map((i) => [i.id, i]));
  /** Dégâts exacts d'un stuff donné par ses objets (bonus de panoplie compris). */
  function evaluateSlots(slots: Partial<Record<SlotId, number>>): number {
    const gear = new Float64Array(D);
    const counts = new Map<number, number>();
    for (const id of Object.values(slots)) {
      const item = id !== undefined ? itemById.get(id) : undefined;
      if (!item) continue;
      const v = vecOf(item.effects);
      for (let d = 0; d < D; d++) gear[d]! += v[d]!;
      const s = setOfItem.get(item.id);
      if (s !== undefined) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    for (const [s, n] of counts) {
      const tier = setTiers[s]![Math.min(n, setTiers[s]!.length - 1)]!;
      for (let d = 0; d < D; d++) gear[d]! += tier[d]!;
    }
    return objective(gear);
  }

  return {
    D,
    contrib,
    AP,
    statFeature,
    damageFeature,
    CRIT,
    CRIT_DMG,
    MELEE,
    RANGED,
    groups,
    vecOf,
    baseVec,
    prepared,
    objective,
    setTiers,
    setOfItem,
    proxyWeights,
    byFamily,
    considered,
    evaluateSlots,
    slotsOf,
  };
}

export type DamageModel = ReturnType<typeof buildDamageModel>;
