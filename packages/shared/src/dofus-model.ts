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
  applyTarget,
  hasResistances,
  type DamageTarget,
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
  /** Objets imposés : jamais écartés, toujours portés. */
  forced?: readonly number[];
  /**
   * Bonus de combat de certains objets (situation simulée) : comptés dans les
   * dégâts, les PA et les exigences, mais pas dans les conditions des objets.
   */
  buffs?: ReadonlyMap<number, Partial<Record<StatKey, number>>>;
  /** Cible des sorts (résistances d'un monstre) ; absente : aucune résistance. */
  target?: DamageTarget | null;
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
  // Cible sans aucune résistance (Poutch) : comme sans cible.
  const target = hasResistances(input.target) ? input.target : null;
  /** Part des dégâts qui passe les % de résistance de la cible pour un élément. */
  const resistMul = (element: keyof typeof ELEMENTS) =>
    target ? Math.max(0, 100 - Math.min(100, target.pct[element] ?? 0)) / 100 : 1;
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
  // % dommages finaux : multiplie tous les dégâts (seulement si un objet ou bonus en donne).
  const buffEffects = (id: number) =>
    (Object.entries(input.buffs?.get(id) ?? {}) as [StatKey, number][]).map(([stat, value]) => ({
      stat,
      value,
    }));
  const hasFinal =
    !!input.base.finalDamagePct ||
    [...(input.buffs?.values() ?? [])].some((b) => !!b.finalDamagePct) ||
    input.items.some((i) => i.effects.some((e) => e.stat === "finalDamagePct" && e.value !== 0));
  const FINAL = hasFinal ? feature("finalDamagePct") : -1;

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
          element: line.element,
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
    const final = f(FINAL);
    const finish = (x: number) => (final ? Math.max(0, Math.floor((x * (100 + final)) / 100)) : x);
    const perCast = (s: TurnSpell) => {
      const p = prepared.get(s)!;
      const chance = withCrit ? Math.min(100, Math.max(0, p.critBase + critical)) / 100 : 0;
      const pct = 100 + f(p.pct);
      let sum = 0;
      for (const line of p.lines) {
        const scale = 100 + f(line.stat);
        const fixed = f(line.damage);
        const hit = (roll: number, extra: number, isCrit: boolean) =>
          finish(
            applyTarget(
              Math.max(
                0,
                Math.floor(((Math.floor((roll * scale) / 100) + fixed + extra) * pct) / 100),
              ),
              line.element,
              isCrit,
              target,
            ),
          );
        const normal = (hit(line.rolls[0]!, 0, false) + hit(line.rolls[1]!, 0, false)) / 2;
        const crit = line.critRolls
          ? (hit(line.critRolls[0]!, critDamage, true) +
              hit(line.critRolls[1]!, critDamage, true)) /
            2
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
    const buff = input.buffs?.get(item.id) ?? {};
    for (const stat of condStats) {
      const own = rawOf(item.effects, stat);
      // Bonus de combat : comptés pour les exigences, pas pour les conditions.
      const extra = minimumStats.includes(stat) ? (buff[stat] ?? 0) : 0;
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
      rawLo.push(own + Math.min(0, extra) + lo);
      rawHi.push(own + Math.max(0, extra) + hi);
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

  // Entonnoir (explication et débogage) : pourquoi les objets sont écartés.
  const funnel = {
    total: input.items.length,
    noSlot: 0,
    tooHigh: 0,
    forbidden: 0,
    unwearable: 0,
    byFamily: {} as Partial<Record<SlotFamily, { considered: number; kept: number }>>,
  };
  for (const item of input.items) {
    if (!item.family) {
      funnel.noSlot++;
      continue;
    }
    if (item.level > input.level) {
      funnel.tooHigh++;
      continue;
    }
    if (!isAllowedItem(item)) {
      funnel.forbidden++;
      continue;
    }
    const criteria = criteriaOf(item);
    if (criteria?.kind === "false") {
      funnel.unwearable++; // jamais portable (autre classe, condition impossible)
      continue;
    }
    considered++;
    const f = (funnel.byFamily[item.family] ??= { considered: 0, kept: 0 });
    f.considered++;
    const v = vecOf([...item.effects, ...buffEffects(item.id)]);
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
    for (const e of [...item.effects, ...buffEffects(item.id)]) {
      if (e.stat) proxy += (proxyWeights[e.stat] ?? 0) * e.value;
    }
    if (input.buffs?.get(item.id)?.finalDamagePct) proxy += 100;
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
  const forcedIds = new Set(input.forced ?? []);
  const geq = (a: Vec, b: Vec) => {
    for (let d = 0; d < D; d++) if (a[d]! < b[d]!) return false;
    return true;
  };
  const equal = (a: Vec, b: Vec) => {
    for (let d = 0; d < D; d++) if (a[d]! !== b[d]!) return false;
    return true;
  };
  const zero = new Float64Array(D);

  // ── Dominance pondérée ─────────────────────────────────────────────────
  // À % dommages, % critique et % finaux donnés, les dégâts sont une somme
  // pondérée des autres caractéristiques regroupées (caractéristique +
  // Puissance, Dommages, dommages critiques), avec des poids connus. b remplace
  // donc a sans perte si : b fait au moins aussi bien sur ces multiplicateurs
  // (et les PA), et la somme pondérée de b dépasse celle de a pour TOUT % critique
  // possible, d'une marge qui couvre les arrondis du jeu (chaque étape arrondie
  // à l'inférieur fait perdre moins d'un point). Les poids varient avec le %
  // critique de façon affine par morceaux : il suffit de tester les cassures.
  const multDims = [AP, CRIT, MELEE, RANGED, FINAL].filter((d) => d >= 0);
  const blockDims = [
    ...new Set([...statFeature.values(), ...damageFeature.values()]),
    ...(CRIT_DMG >= 0 ? [CRIT_DMG] : []),
  ];
  /** Groupes de sorts qui partagent un % dommages (somme des sorts) ; un par sort en combo. */
  const spellGroups: TurnSpell[][] =
    input.mode === "rotation"
      ? [MELEE, RANGED]
          .filter((d) => d >= 0)
          .map((d) => spells.filter((s) => prepared.get(s)!.pct === d))
      : spells.map((s) => [s]);
  /** Bornes d'un total regroupé sur les candidats actuels (panoplies comprises). */
  const featureRange = (d: number): [number, number] => {
    let lo = baseVec[d]!;
    let hi = baseVec[d]!;
    for (const [family, list] of byFamily) {
      const k = slotsOf(family);
      lo += list
        .map((c) => c.lo[d]!)
        .filter((x) => x < 0)
        .sort((x, y) => x - y)
        .slice(0, k)
        .reduce((x, y) => x + y, 0);
      hi += list
        .map((c) => c.hi[d]!)
        .filter((x) => x > 0)
        .sort((x, y) => y - x)
        .slice(0, k)
        .reduce((x, y) => x + y, 0);
    }
    return [lo, hi];
  };
  /** Poids des caractéristiques regroupées aux % critiques de cassure, et marge d'arrondi. */
  let weighted: { weights: Float64Array[]; margin: number }[] | null = null;
  const prepareWeighted = () => {
    const [critMin, critHi] = withCrit ? featureRange(CRIT) : [0, 0];
    // Un critique minimum exigé (100 % de critique) est respecté par tout stuff étudié.
    const critLo = Math.max(critMin, input.minimums?.critical ?? -Infinity);
    const finalLo = FINAL >= 0 ? featureRange(FINAL)[0] : 0;
    const groups: { weights: Float64Array[]; margin: number }[] = [];
    for (const group of spellGroups) {
      if (group.length === 0) continue;
      const pctDim = prepared.get(group[0]!)!.pct;
      const pctLo = pctDim >= 0 ? featureRange(pctDim)[0] : 0;
      const pMul = (100 + pctLo) / 100;
      const fMul = (100 + finalLo) / 100;
      // Multiplicateurs trop petits : la marge d'arrondi n'a plus de sens, on s'abstient.
      if (pMul < 0.2 || fMul < 0.2) return null;
      // Perte d'arrondi par ligne, rapportée aux multiplicateurs : moins de
      // 1 (jet × caractéristique) + 1 / P (× % dommages), le tout multiplié par la
      // part qui passe les résistances (plus de 1 sur une faiblesse), + 1 / P pour
      // l'arrondi des % de résistance, + 1 / (F × P) (× % finaux).
      const mMax = Math.max(
        1,
        ...group.flatMap((s) => prepared.get(s)!.lines.map((l) => resistMul(l.element))),
      );
      const perLine =
        mMax * (1 + 1 / pMul) + (target ? 1 / pMul : 0) + (FINAL >= 0 ? 1 / (fMul * pMul) : 0);
      let lines = 0;
      const points = new Set([critLo, critHi]);
      for (const s of group) {
        const p = prepared.get(s)!;
        lines += p.lines.length;
        for (const at of [-p.critBase, 100 - p.critBase]) {
          if (at > critLo && at < critHi) points.add(at);
        }
      }
      const weights = [...(withCrit ? points : [0])].map((crit) => {
        const w = new Float64Array(D);
        for (const s of group) {
          const p = prepared.get(s)!;
          const chance = withCrit ? Math.min(100, Math.max(0, p.critBase + crit)) / 100 : 0;
          for (const line of p.lines) {
            const critRoll = line.crit ?? line.normal;
            const m = resistMul(line.element);
            w[line.stat]! += (m * (line.normal + chance * (critRoll - line.normal))) / 100;
            w[line.damage]! += m;
            if (withCrit && line.crit !== null) w[CRIT_DMG]! += m * chance;
          }
        }
        return w;
      });
      groups.push({ weights, margin: lines * perLine + 1e-9 });
    }
    return groups;
  };
  /** b (apport minimal bLo) fait-il toujours mieux que a (apport maximal aHi) ? */
  const beatsWeighted = (bLo: Vec, aHi: Vec) => {
    if (!weighted) return false;
    for (const d of multDims) if (bLo[d]! < aHi[d]!) return false;
    for (const { weights, margin } of weighted) {
      for (const w of weights) {
        let gain = 0;
        for (const d of blockDims) gain += w[d]! * (bLo[d]! - aHi[d]!);
        if (gain < margin) return false;
      }
    }
    return true;
  };

  /**
   * Panoplies entières. Un objet de panoplie vaut son apport plus, au mieux, le
   * meilleur gain de bonus : comparé seul, il est presque impossible à écarter.
   * On compare donc la panoplie entière : chaque objet reçoit des remplaçants
   * hors panoplie, sans condition, qui font au moins aussi bien sur les
   * multiplicateurs ; si, pour tout nombre n d'objets portés, les n pires
   * objets plus le bonus à n objets font moins bien que leurs remplaçants (avec
   * la marge d'arrondi), aucun stuff optimal n'a besoin de cette panoplie.
   * Sur un emplacement multiple (anneaux), on retient le moins bon de k
   * remplaçants : l'un d'eux est forcément libre.
   */
  const blockScore = (v: Vec) => {
    let score = 0;
    for (const { weights } of weighted ?? []) {
      let worst = Infinity;
      for (const w of weights) {
        let x = 0;
        for (const d of blockDims) x += w[d]! * v[d]!;
        worst = Math.min(worst, x);
      }
      score += worst;
    }
    return score;
  };
  const strategies: ((v: Vec) => number)[] = [
    blockScore,
    // Variante : d'abord les PA et le % critique (bonus de panoplie souvent en PA).
    (v) => v[AP]! * 1e6 + (CRIT >= 0 ? v[CRIT]! * 1e3 : 0) + blockScore(v),
  ];
  const pruneSets = (): number => {
    if (!weighted) return 0;
    const members = new Map<number, Cand[]>();
    for (const list of byFamily.values()) {
      for (const c of list) if (c.set >= 0) members.set(c.set, [...(members.get(c.set) ?? []), c]);
    }
    const doomed = new Set<Cand>();
    for (const [set, list] of members) {
      if (list.some((c) => forcedIds.has(c.id))) continue;
      const tiers = setTiers[set]!;
      const maxN = Math.min(list.length, tiers.length - 1);
      const useless = strategies.some((score) => {
        // Remplaçant garanti de chaque objet : le moins bon de k rivaux libres.
        const subs: Vec[] = [];
        for (const a of list) {
          const family = a.item.family as SlotFamily;
          const k = slotsOf(family);
          const rivals = (byFamily.get(family) ?? [])
            .filter(
              (r) =>
                r.set !== a.set &&
                r.criteriaKey === null &&
                !r.prysma &&
                !forcedIds.has(r.id) &&
                multDims.every((d) => r.lo[d]! >= a.v[d]!) &&
                safeSwap(a, r),
            )
            .sort((x, y) => score(y.lo) - score(x.lo))
            .slice(0, k);
          if (rivals.length < k) return false;
          const sub = new Float64Array(D);
          for (let d = 0; d < D; d++) sub[d] = Math.min(...rivals.map((r) => r.lo[d]!));
          subs.push(sub);
        }
        const topSum = (values: number[], n: number) =>
          values
            .sort((x, y) => y - x)
            .slice(0, n)
            .reduce((x, y) => x + y, 0);
        for (let n = 1; n <= maxN; n++) {
          const bonus = tiers[n]!;
          for (const d of multDims) {
            const loss = topSum(
              list.map((a, i) => a.v[d]! - subs[i]![d]!),
              n,
            );
            if (loss + bonus[d]! > 0) return false;
          }
          for (const { weights, margin } of weighted!) {
            for (const w of weights) {
              const gainOf = (a: Cand, i: number) => {
                let g = 0;
                for (const d of blockDims) g += w[d]! * (a.v[d]! - subs[i]![d]!);
                return g;
              };
              let bonusGain = 0;
              for (const d of blockDims) bonusGain += w[d]! * bonus[d]!;
              if (topSum(list.map(gainOf), n) + bonusGain + margin > 0) return false;
            }
          }
        }
        return true;
      });
      if (useless) list.forEach((c) => doomed.add(c));
    }
    if (doomed.size === 0) return 0;
    for (const [family, list] of byFamily) {
      byFamily.set(
        family,
        list.filter((c) => !doomed.has(c)),
      );
    }
    return doomed.size;
  };

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
    weighted = prepareWeighted();
    for (const [family, list] of byFamily) {
      const k = slotsOf(family);
      const kept = list.filter((a) => {
        if (forcedIds.has(a.id)) return true;
        // L'emplacement vide fait au moins aussi bien.
        if ((geq(zero, a.hi) || beatsWeighted(zero, a.hi)) && safeSwap(a, null)) return false;
        let plain = 0;
        let prysma = 0;
        for (const b of list) {
          if (b === a || (a.set >= 0 && b.set === a.set)) continue;
          if (!(geq(b.lo, a.hi) || beatsWeighted(b.lo, a.hi)) || !safeSwap(a, b)) continue;
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
    removed += pruneSets();
    if (removed === 0) break;
  }
  for (const [family, list] of byFamily) {
    const f = funnel.byFamily[family];
    if (f) f.kept = list.length;
  }
  /** Objets imposés absents des candidats : impossibles à porter (niveau, condition…). */
  const candidateIds = new Set([...byFamily.values()].flat().map((c) => c.id));
  const missingForced = [...forcedIds].filter((id) => !candidateIds.has(id));

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
      const v = vecOf([...item.effects, ...buffEffects(item.id)]);
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
    const combat = (stat: StatKey) =>
      items.reduce((sum, i) => sum + (input.buffs?.get(i.id)?.[stat] ?? 0), 0);
    const minimumsMet = (Object.entries(input.minimums ?? {}) as [StatKey, number][]).every(
      ([stat, min]) => (totals.get(stat) ?? 0) + combat(stat) >= min,
    );
    return minimumsMet && items.every((i) => criteriaMet(i.criteria, context));
  }

  return {
    target,
    resistMul,
    forcedIds,
    missingForced,
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
    FINAL,
    buffEffects,
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
    funnel,
    evaluateSlots,
    slotsOf,
  };
}

export type DamageModel = ReturnType<typeof buildDamageModel>;
