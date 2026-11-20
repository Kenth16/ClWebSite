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
import { criteriaMet, simplifyCriteria, type CriteriaTree } from "./dofus-criteria";
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
  /**
   * « rotation » : dégâts = somme des sorts choisis, chacun lancé une fois.
   * « combo » (par défaut) : meilleur combo de sorts dans les PA visés.
   */
  mode?: "combo" | "rotation";
  /** Distance ou mêlée imposée : un seul % dommages (sorts + ce type) pour tous les sorts. */
  attack?: "melee" | "ranged";
  /** false : pas de coups critiques (dégâts normaux seulement). */
  critical?: boolean;
  /** Points de caractéristique à répartir par l'optimiseur (sinon déjà dans la base). */
  pointsBudget?: number;
  /** Exigences minimales sur les totaux bruts (ex. vitalité, PM, % résistance). */
  minimums?: Partial<Record<StatKey, number>>;
}

/** Coût d'un point de caractéristique, par paliers : [jusqu'à, prix]. */
export const POINT_TIERS: Record<string, [number, number][]> = {
  vitality: [[Infinity, 1]],
  wisdom: [[Infinity, 3]],
  strength: [
    [100, 1],
    [200, 2],
    [300, 3],
    [Infinity, 4],
  ],
  intelligence: [
    [100, 1],
    [200, 2],
    [300, 3],
    [Infinity, 4],
  ],
  chance: [
    [100, 1],
    [200, 2],
    [300, 3],
    [Infinity, 4],
  ],
  agility: [
    [100, 1],
    [200, 2],
    [300, 3],
    [Infinity, 4],
  ],
};

/** Points de caractéristique maximum dans une caractéristique, pour un budget donné. */
export function maxPointsIn(stat: string, budget: number): number {
  let left = budget;
  let value = 0;
  let from = 0;
  for (const [to, price] of POINT_TIERS[stat] ?? []) {
    const n = Math.min(to - from, Math.floor(left / price));
    value += n;
    left -= n * price;
    if (n < to - from) break;
    from = to;
  }
  return value;
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
  /** L'objet a des conditions (il ne peut alors pas servir à en écarter un autre). */
  conditional: boolean;
  /** Conditions de l'objet (texte normalisé), pour comparer deux objets. */
  criteriaKey: string | null;
  /** Caractéristiques visées par des conditions : apport minimal / maximal (panoplie comprise). */
  rawLo: number[];
  rawHi: number[];
  /** Sens imposés par ses propres conditions (« PA < 12 » : les PA ne doivent pas monter). */
  own: Directions;
  item: DofusItem;
}

/** Caractéristiques qui ne doivent pas monter / baisser, et nombre de panoplies actives. */
interface Directions {
  rise: Set<StatKey>;
  fall: Set<StatKey>;
  setsRise: boolean;
  setsFall: boolean;
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
  const withCrit = input.critical !== false;
  const CRIT = withCrit ? feature("critical") : -1;
  const CRIT_DMG = withCrit ? feature("criticalDamage") : -1;
  // Type d'attaque : imposé par le joueur, sinon d'après la portée de chaque sort.
  const isMelee = (s: TurnSpell) => (input.attack ? input.attack === "melee" : s.grade.range <= 1);
  const MELEE = spells.some(isMelee) ? feature("spellDamagePct", "meleeDamagePct") : -1;
  const RANGED = spells.some((s) => !isMelee(s))
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
          rolls: [line.min, line.max],
          critRolls: critLine ? [critLine.min, critLine.max] : null,
        };
      });
      return [s, { pct: isMelee(s) ? MELEE : RANGED, critBase: grade.criticalChance, lines }];
    }),
  );

  /**
   * Dégâts du tour pour un vecteur d'équipement (base ajoutée ici), avec la
   * formule du jeu : chaque étape est arrondie à l'inférieur, comme dans le
   * calcul des dégâts du simulateur. Croît avec chaque caractéristique
   * regroupée, et ne dépasse jamais la version sans arrondi : les bornes des
   * optimiseurs restent valables.
   */
  function objective(gear: Vec, extra?: Vec): number {
    const f = (i: number) => (i < 0 ? 0 : gear[i]! + baseVec[i]! + (extra ? extra[i]! : 0));
    if (Math.min(f(AP), STAT_CAPS.ap) < apTarget) return -Infinity;
    const critDamage = f(CRIT_DMG);
    const critical = f(CRIT);
    const perCast = (s: TurnSpell) => {
      const p = prepared.get(s)!;
      const chance = withCrit ? Math.min(100, Math.max(0, p.critBase + critical)) / 100 : 0;
      const pct = 100 + f(p.pct);
      let sum = 0;
      for (const line of p.lines) {
        const scale = 100 + f(line.stat);
        const fixed = f(line.damage);
        const hit = (roll: number, extra: number) =>
          Math.max(0, Math.floor(((Math.floor((roll * scale) / 100) + fixed + extra) * pct) / 100));
        const normal = (hit(line.rolls[0]!, 0) + hit(line.rolls[1]!, 0)) / 2;
        const crit = line.critRolls
          ? (hit(line.critRolls[0]!, critDamage) + hit(line.critRolls[1]!, critDamage)) / 2
          : normal;
        sum += (1 - chance) * normal + chance * crit;
      }
      return sum;
    };
    if (input.mode === "rotation") return spells.reduce((sum, s) => sum + perCast(s), 0);
    return bestComboDamage(spells, groups, apTarget, perCast);
  }

  /** Vecteur des caractéristiques regroupées apporté par des points de caractéristique. */
  const pointsVec = (points: Partial<Record<StatKey, number>>) =>
    vecOf(
      (Object.entries(points) as [StatKey, number][]).map(([stat, value]) => ({ stat, value })),
    );

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
  // ── Conditions présentes : quelles caractéristiques ne doivent pas monter
  // (« PA < 12 »), lesquelles ne doivent pas baisser (« Force > 99 »), et le
  // nombre de panoplies actives (« bonus de panoplie < 2 »).
  // D'abord, les conditions toujours vraies ou toujours fausses (vu les bornes
  // possibles de chaque total) sont simplifiées : elles ne contraignent rien.
  const rawOfItem = (effects: readonly { stat: StatKey | null; value: number }[], stat: StatKey) =>
    effects.reduce((sum, e) => (e.stat === stat ? sum + e.value : sum), 0);
  const usable = input.items.filter(
    (i) => i.family && i.level <= input.level && isAllowedItem(i) && i.criteria?.kind !== "false",
  );
  const totalRange = new Map<StatKey, [number, number]>();
  const rangeOf = (stat: StatKey): [number, number] => {
    const known = totalRange.get(stat);
    if (known) return known;
    let lo = input.base[stat] ?? 0;
    let hi = lo;
    for (const family of new Set(SLOTS.map((x) => x.family as SlotFamily))) {
      const k = SLOTS.filter((x) => x.family === family).length;
      const values = usable
        .filter((i) => i.family === family)
        .map((i) => rawOfItem(i.effects, stat));
      const neg = values
        .filter((v) => v < 0)
        .sort((a, b) => a - b)
        .slice(0, k);
      const pos = values
        .filter((v) => v > 0)
        .sort((a, b) => b - a)
        .slice(0, k);
      lo += neg.reduce((a, b) => a + b, 0);
      hi += pos.reduce((a, b) => a + b, 0);
    }
    for (const set of input.sets) {
      for (const effects of Object.values(set.bonuses)) {
        const v = rawOfItem(effects, stat);
        if (v < 0) lo += v;
        if (v > 0) hi += v;
      }
    }
    // Les PA visés sont obligatoires : un total en dessous est impossible.
    if (stat === "ap") lo = Math.max(lo, apTarget);
    if (input.pointsBudget) hi += maxPointsIn(stat, input.pointsBudget);
    const range: [number, number] = [lo, hi];
    totalRange.set(stat, range);
    return range;
  };
  const decideWith = (range: (stat: StatKey) => [number, number]) => {
    const decide = (t: CriteriaTree): CriteriaTree => {
      if (t.kind === "and" || t.kind === "or") return { ...t, children: t.children.map(decide) };
      if (t.kind !== "stat") return t;
      const [lo, hi] = range(t.stat);
      const always =
        t.op === "<"
          ? hi < t.value
          : t.op === ">"
            ? lo > t.value
            : t.op === "="
              ? lo === hi && lo === t.value
              : hi < t.value || lo > t.value;
      const never =
        t.op === "<"
          ? lo >= t.value
          : t.op === ">"
            ? hi <= t.value
            : t.op === "="
              ? t.value < lo || t.value > hi
              : lo === hi && lo === t.value;
      return always ? { kind: "true" } : never ? { kind: "false" } : t;
    };
    return decide;
  };
  const decide = decideWith(rangeOf);
  const simplified = new Map<number, CriteriaTree | null>();
  for (const item of usable) {
    if (item.criteria) simplified.set(item.id, simplifyCriteria(decide(item.criteria), {}));
  }
  const criteriaOf = (item: DofusItem): CriteriaTree | null =>
    simplified.has(item.id) ? simplified.get(item.id)! : (item.criteria ?? null);

  /** Sens qu'une condition impose aux totaux du stuff. */
  const directionsOf = (tree: CriteriaTree | null): Directions => {
    const d: Directions = { rise: new Set(), fall: new Set(), setsRise: false, setsFall: false };
    const scan = (t: CriteriaTree) => {
      if (t.kind === "and" || t.kind === "or") t.children.forEach(scan);
      else if (t.kind === "stat") {
        if (t.op !== ">") d.rise.add(t.stat);
        if (t.op !== "<") d.fall.add(t.stat);
      } else if (t.kind === "sets") {
        if (t.op !== ">") d.setsRise = true;
        if (t.op !== "<") d.setsFall = true;
      }
    };
    if (tree && tree.kind !== "false") scan(tree);
    return d;
  };
  const allStats = new Set<StatKey>();
  for (const item of usable) {
    const d = directionsOf(criteriaOf(item));
    d.rise.forEach((x) => allStats.add(x));
    d.fall.forEach((x) => allStats.add(x));
  }
  // Les exigences minimales du joueur (PV, PM, résistances…) protègent aussi leurs
  // caractéristiques : un remplacement ne doit pas les faire baisser.
  const minimumStats = Object.keys(input.minimums ?? {}) as StatKey[];
  minimumStats.forEach((x) => allStats.add(x));
  const condStats = [...allStats];
  const rawOf = (effects: readonly { stat: StatKey | null; value: number }[], stat: StatKey) =>
    effects.reduce((sum, e) => (e.stat === stat ? sum + e.value : sum), 0);
  /** Apport brut d'un objet aux caractéristiques des conditions, bonus de panoplie au pire / au mieux. */
  const rawRange = (item: DofusItem, set: number) => {
    const rawLo: number[] = [];
    const rawHi: number[] = [];
    for (const stat of condStats) {
      const own = rawOf(item.effects, stat);
      let lo = 0;
      let hi = 0;
      if (set >= 0) {
        const bonuses = input.sets[set]!.bonuses;
        const at = (n: number) => {
          if (n < 2) return 0;
          const tier = Math.max(
            0,
            ...Object.keys(bonuses)
              .map(Number)
              .filter((k) => k <= n),
          );
          return rawOf(bonuses[tier] ?? [], stat);
        };
        lo = Infinity;
        hi = -Infinity;
        for (let n = 0; n < input.sets[set]!.itemIds.length; n++) {
          const step = at(n + 1) - at(n);
          lo = Math.min(lo, step);
          hi = Math.max(hi, step);
        }
        if (!Number.isFinite(lo)) lo = hi = 0;
      }
      rawLo.push(own + lo);
      rawHi.push(own + hi);
    }
    return { rawLo, rawHi };
  };
  /**
   * Remplacer a par b (ou par l'emplacement vide si b est null) garde-t-il
   * toutes les conditions du stuff ? b n'a pas de conditions (ou les mêmes que
   * a), ne fait monter aucune caractéristique bornée par le haut, ne fait
   * baisser aucune caractéristique bornée par le bas, et ne change pas le
   * nombre de panoplies actives dans le mauvais sens.
   */
  /**
   * Conditions encore en jeu : comptées sur les seuls objets candidats (un
   * objet écarté ne fera partie d'aucun stuff étudié, sa condition non plus).
   */
  let counts = {
    rise: new Map<StatKey, number>(),
    fall: new Map<StatKey, number>(),
    setsRise: 0,
    setsFall: 0,
  };
  const countDirections = (cands: Cand[]) => {
    counts = { rise: new Map(), fall: new Map(), setsRise: 0, setsFall: 0 };
    for (const c of cands) {
      c.own.rise.forEach((x) => counts.rise.set(x, (counts.rise.get(x) ?? 0) + 1));
      c.own.fall.forEach((x) => counts.fall.set(x, (counts.fall.get(x) ?? 0) + 1));
      if (c.own.setsRise) counts.setsRise++;
      if (c.own.setsFall) counts.setsFall++;
    }
    for (const x of minimumStats) counts.fall.set(x, (counts.fall.get(x) ?? 0) + 1_000_000);
  };
  const safeSwap = (a: Cand, b: Cand | null) => {
    if (b && b.criteriaKey !== null && b.criteriaKey !== a.criteriaKey) return false;
    // Les conditions de a ne comptent plus une fois a retiré… sauf si b a les mêmes.
    const mine = b && b.criteriaKey !== null ? null : a.own;
    const active = (n: number | undefined, isMine: boolean) => (n ?? 0) - (isMine ? 1 : 0) > 0;
    for (let k = 0; k < condStats.length; k++) {
      const stat = condStats[k]!;
      const bLo = b ? b.rawLo[k]! : 0;
      const bHi = b ? b.rawHi[k]! : 0;
      if (active(counts.rise.get(stat), !!mine?.rise.has(stat)) && bHi > a.rawLo[k]!) return false;
      if (active(counts.fall.get(stat), !!mine?.fall.has(stat)) && bLo < a.rawHi[k]!) return false;
    }
    if (active(counts.setsRise, !!mine?.setsRise) && b && b.set >= 0) return false;
    if (active(counts.setsFall, !!mine?.setsFall) && a.set >= 0) return false;
    return true;
  };

  for (const item of input.items) {
    if (!item.family || item.level > input.level || !isAllowedItem(item)) continue;
    const criteria = criteriaOf(item);
    if (criteria?.kind === "false") continue; // jamais portable (autre classe, condition impossible)
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
    list.push({
      id: item.id,
      set,
      prysma: /prysmaradite/i.test(item.type),
      v,
      hi,
      lo,
      up,
      proxy,
      conditional: !!criteria,
      criteriaKey: criteria ? JSON.stringify(criteria) : null,
      own: directionsOf(criteria),
      item,
      ...rawRange(item, set),
    });
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
  // On recommence tant que des objets tombent : moins de candidats, moins de
  // conditions en jeu, donc de nouveaux remplacements sûrs.
  for (let round = 0; round < 10; round++) {
    let removed = 0;
    // Bornes des totaux recalculées sur les seuls candidats : plus serrées, elles
    // rendent certaines conditions toujours vraies ou impossibles.
    const current = [...byFamily.values()].flat();
    const ranges = new Map<StatKey, [number, number]>();
    const memberCount = new Map<number, number>();
    for (const c of current)
      if (c.set >= 0) memberCount.set(c.set, (memberCount.get(c.set) ?? 0) + 1);
    const rangeNow = (stat: StatKey): [number, number] => {
      const known = ranges.get(stat);
      if (known) return known;
      let lo = input.base[stat] ?? 0;
      let hi = lo;
      for (const [family, list] of byFamily) {
        const k = slotsOf(family);
        const values = list.map((c) => rawOfItem(c.item.effects, stat));
        lo += values
          .filter((v) => v < 0)
          .sort((a, b) => a - b)
          .slice(0, k)
          .reduce((a, b) => a + b, 0);
        hi += values
          .filter((v) => v > 0)
          .sort((a, b) => b - a)
          .slice(0, k)
          .reduce((a, b) => a + b, 0);
      }
      for (const [set, n] of memberCount) {
        if (n < 2) continue;
        const values = Object.values(input.sets[set]!.bonuses).map((e) => rawOfItem(e, stat));
        lo += Math.min(0, ...values);
        hi += Math.max(0, ...values);
      }
      if (stat === "ap") lo = Math.max(lo, apTarget);
      if (input.pointsBudget) hi += maxPointsIn(stat, input.pointsBudget);
      const range: [number, number] = [lo, hi];
      ranges.set(stat, range);
      return range;
    };
    const decideNow = decideWith(rangeNow);
    for (const [family, list] of byFamily) {
      const kept = list.filter((c) => {
        if (!c.item.criteria) return true;
        const tree = simplifyCriteria(decideNow(c.item.criteria), {});
        simplified.set(c.id, tree);
        if (tree?.kind === "false") return false;
        c.conditional = !!tree;
        c.criteriaKey = tree ? JSON.stringify(tree) : null;
        c.own = directionsOf(tree);
        return true;
      });
      removed += list.length - kept.length;
      byFamily.set(family, kept);
    }
    countDirections([...byFamily.values()].flat());
    for (const [family, list] of byFamily) {
      const k = slotsOf(family);
      const kept = list.filter((a) => {
        // L'emplacement vide fait au moins aussi bien.
        if (geq(zero, a.hi) && safeSwap(a, null)) return false;
        let plain = 0;
        let prysma = 0;
        for (const b of list) {
          if (b === a || (a.set >= 0 && b.set === a.set)) continue;
          if (!geq(b.lo, a.hi) || !safeSwap(a, b)) continue;
          // Égalité parfaite : on n'en garde qu'un (le plus petit identifiant).
          if (equal(b.lo, a.hi) && equal(a.lo, b.hi) && b.id > a.id) continue;
          if (b.prysma) prysma++;
          else plain++;
        }
        if (a.prysma && prysma > 0) return false;
        return plain + Math.min(prysma, 1) < k;
      });
      removed += list.length - kept.length;
      kept.sort((a, b) => b.proxy - a.proxy);
      byFamily.set(family, kept);
    }
    if (removed === 0) break;
  }

  const itemById = new Map(input.items.map((i) => [i.id, i]));
  /** Dégâts exacts d'un stuff donné par ses objets (bonus de panoplie compris). */
  function evaluateSlots(
    slots: Partial<Record<SlotId, number>>,
    points?: Partial<Record<StatKey, number>>,
  ): number {
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
    return objective(gear, points ? pointsVec(points) : undefined);
  }

  /**
   * Le stuff respecte-t-il les conditions de tous ses objets ? Totaux bruts :
   * base (points, parchemins, PA, PM) + objets + bonus de panoplie.
   */
  function feasible(
    slots: Partial<Record<SlotId, number>>,
    points?: Partial<Record<StatKey, number>>,
  ): boolean {
    const items = Object.values(slots)
      .map((id) => (id !== undefined ? itemById.get(id) : undefined))
      .filter((i): i is DofusItem => !!i);
    const totals = new Map<StatKey, number>(Object.entries(input.base) as [StatKey, number][]);
    const add = (effects: readonly { stat: StatKey | null; value: number }[]) => {
      for (const e of effects) if (e.stat) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
    };
    items.forEach((i) => add(i.effects));
    if (points) {
      add(
        (Object.entries(points) as [StatKey, number][]).map(([stat, value]) => ({ stat, value })),
      );
    }
    const counts = new Map<number, number>();
    for (const i of items) {
      const s = setOfItem.get(i.id);
      if (s !== undefined) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let activeSets = 0;
    for (const [s, n] of counts) {
      if (n < 2) continue;
      activeSets++;
      const bonuses = input.sets[s]!.bonuses;
      const tier = Math.max(
        ...Object.keys(bonuses)
          .map(Number)
          .filter((k) => k <= n),
        0,
      );
      add(bonuses[tier] ?? []);
    }
    const context = { total: (k: StatKey) => totals.get(k) ?? 0, activeSets };
    const minimumsMet = (Object.entries(input.minimums ?? {}) as [StatKey, number][]).every(
      ([stat, min]) => (totals.get(stat) ?? 0) >= min,
    );
    return minimumsMet && items.every((i) => criteriaMet(i.criteria, context));
  }

  return {
    feasible,
    pointsVec,
    withCrit,
    /** Conditions simplifiées d'un objet (null : toujours remplies). */
    criteriaOf,
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
