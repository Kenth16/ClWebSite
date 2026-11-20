/**
 * Optimiseur exact (« branch and bound ») : trouve le stuff qui fait
 * PROUVABLEMENT le plus de dégâts sur un tour, bonus de panoplie compris.
 *
 * 1. Chaque objet est réduit aux caractéristiques qui comptent pour les dégâts
 *    (élément, Puissance, Dommages, critique, dommages critiques, % dommages, PA).
 * 2. Dominance : un objet est retiré s'il existe assez d'objets du même
 *    emplacement qui apportent à coup sûr au moins autant, même en comptant le
 *    mieux possible ce qu'il ajoute à sa panoplie (ex. l'anneau Volkorne garde
 *    sa chance grâce au bonus de panoplie qu'il peut débloquer). Ce tri ne fait
 *    jamais perdre la solution optimale.
 * 3. Exploration : on remplit les emplacements un par un. À chaque étape, une
 *    borne optimiste (le meilleur de chaque caractéristique encore possible)
 *    donne les dégâts maximaux atteignables ; si elle ne bat pas le meilleur
 *    stuff connu, toute la branche est abandonnée.
 * Les dégâts augmentent avec chacune de ces caractéristiques : la borne ne
 * sous-estime jamais, donc le résultat est l'optimum.
 */
import {
  ELEMENTS,
  SLOTS,
  STAT_CAPS,
  type DofusItem,
  type DofusSet,
  type SlotFamily,
  type SlotId,
} from "./dofus";
import { buildDamageModel, type Cand, type Vec } from "./dofus-model";
import {
  bestComboDamage,
  optimizeStuff,
  optimizeTurnDamage,
  type DamageOptimizeInput,
  type StatWeights,
  type TurnSpell,
} from "./dofus-optimizer";

export interface ExactInput {
  level: number;
  elements: readonly (keyof typeof ELEMENTS)[];
  ap: number;
  /** Caractéristiques hors équipement (points, parchemins, PA de base, exos). */
  base: StatWeights;
  spells: readonly TurnSpell[];
  items: readonly DofusItem[];
  sets: readonly DofusSet[];
  /** Un stuff de départ (ex. trouvé par la recherche locale), pour couper tôt. */
  initial?: Partial<Record<SlotId, number>>;
  /** Temps maximal ; au-delà, le meilleur stuff trouvé est rendu sans preuve. */
  timeLimitMs?: number;
}

export interface ExactResult {
  slots: Partial<Record<SlotId, number>>;
  /** Dégâts moyens du tour (formule rapide, sans les arrondis du jeu). */
  damage: number;
  /** Vrai si toute l'exploration a abouti : aucun stuff ne fait mieux. */
  proven: boolean;
  /** Nœuds de l'arbre explorés. */
  nodes: number;
  /** Objets restants après dominance (tous emplacements). */
  candidates: number;
  /** Objets du niveau autorisé avant dominance. */
  considered: number;
  ms: number;
  /** Borne de départ : dégâts maximaux imaginables (diagnostic). */
  rootBound: number;
  /** Objets gardés par famille, dont ceux de panoplie (diagnostic). */
  families: Record<string, { kept: number; inSets: number }>;
}

/** Ordre de remplissage : les emplacements qui pèsent le plus d'abord. */
const FAMILY_ORDER: SlotFamily[] = [
  "dofus",
  "weapon",
  "amulet",
  "ring",
  "hat",
  "cloak",
  "belt",
  "boots",
  "shield",
  "pet",
];

export function optimizeTurnDamageExact(input: ExactInput): ExactResult {
  const started = Date.now();
  const timeLimit = input.timeLimitMs ?? 180_000;
  const { ap: apTarget, spells } = input;

  const model = buildDamageModel(input);
  const {
    D,
    contrib,
    AP,
    CRIT,
    CRIT_DMG,
    MELEE,
    RANGED,
    groups,
    baseVec,
    prepared,
    objective,
    setTiers,
    proxyWeights,
    byFamily,
    considered,
    evaluateSlots,
  } = model;

  // ── Ordre des emplacements et bornes ───────────────────────────────────
  const order: { family: SlotFamily; slotIds: SlotId[] }[] = FAMILY_ORDER.map((family) => ({
    family,
    slotIds: SLOTS.filter((s) => s.family === family).map((s) => s.id as SlotId),
  }));
  const positions: { family: number; nth: number }[] = [];
  order.forEach((o, f) => o.slotIds.forEach((_, nth) => positions.push({ family: f, nth })));
  const P = positions.length;
  const cands = order.map((o) => byFamily.get(o.family) ?? []);

  // ── Stuff de départ ────────────────────────────────────────────────────
  let bestDamage = -Infinity;
  let bestSlots: Partial<Record<SlotId, number>> = {};
  if (input.initial) {
    const value = evaluateSlots(input.initial);
    if (value > bestDamage) {
      bestDamage = value;
      bestSlots = { ...input.initial };
    }
  }

  // ── Borne « produit » ───────────────────────────────────────────────────
  // Dégâts d'un lancer = (100 + % dommages) / 100 × (partie linéaire en
  // caractéristique, Dommages, dommages critiques). Pour tout λ > 0 :
  //   Y × ℓ ≤ (λY + ℓ/λ)² / 4,
  // et λY + ℓ/λ est une SOMME d'apports objet par objet : on peut la borner
  // emplacement par emplacement sans dissocier les caractéristiques d'un même
  // objet. Le terme μ × (PA − PA visés), positif pour tout stuff valable, fait
  // payer les objets PA indispensables (relaxation lagrangienne).
  const pos = (x: number) => (x > 0 ? x : 0);
  const pctOf = (v: Vec) =>
    Math.max(MELEE >= 0 ? v[MELEE]! : -Infinity, RANGED >= 0 ? v[RANGED]! : -Infinity);

  // Panoplies : apport minimal en % critique par objet (pour la pénalité de tranche).
  const critLowShare = setTiers.map((tiers) => {
    let low = 0;
    for (let n = 1; n < tiers.length; n++) low = Math.min(low, tiers[n]![CRIT]! / n);
    return low;
  });

  /** Somme des r plus grandes valeurs positives (l'emplacement vide vaut 0). */
  const topSum = (values: ArrayLike<number>, r: number) => {
    const top: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const x = values[i]!;
      if (x <= 0) continue;
      if (top.length < r) {
        top.push(x);
        top.sort((a, b) => b - a);
      } else if (x > top[r - 1]!) {
        top[r - 1] = x;
        top.sort((a, b) => b - a);
      }
    }
    return top.reduce((a, b) => a + b, 0);
  };

  /**
   * Construit la borne produit. Le % critique est découpé en tranches : dans la
   * tranche « % critique ≤ c », chaque sort est compté avec c % de critiques,
   * et la pénalité ρ × (c − % critique), positive dans la tranche, fait payer
   * les objets critiques. La borne d'un nœud est la plus haute des tranches.
   */
  function buildProduct() {
    const sumTop = (d: number, sign: 1 | -1) => {
      let total = 0;
      cands.forEach((list, f) => {
        total += topSum(
          list.map((c) => sign * c.up[d]!),
          order[f]!.slotIds.length,
        );
      });
      return total;
    };
    const critHigh = baseVec[CRIT]! + sumTop(CRIT, 1);
    const critLow = baseVec[CRIT]! - sumTop(CRIT, -1);
    const minCritBase = Math.min(...spells.map((sp) => prepared.get(sp)!.critBase));

    const candY = cands.map((list) => list.map((c) => pos(pctOf(c.up))));
    const candA = cands.map((list) => list.map((c) => pos(c.up[AP]!)));
    // % critique d'un objet : au pire (pénalité « ≤ haut de tranche ») et au mieux
    // (bonus « ≥ bas de tranche »).
    const candC = cands.map((list) =>
      list.map((c) => c.v[CRIT]! + (c.set >= 0 ? critLowShare[c.set]! : 0)),
    );
    const candCUp = cands.map((list) => list.map((c) => c.up[CRIT]!));
    const y0 = 100 + pos(pctOf(baseVec));
    const ap0 = baseVec[AP]!;

    // Tranches de % critique : de critLow à 100 % de critiques assurés.
    const cuts: number[] = [];
    const last = Math.min(critHigh, 100 - minCritBase);
    for (let c = Math.ceil(critLow / 5) * 5; c < last; c += 5) cuts.push(c);
    cuts.push(last);

    const terms: {
      bin: number;
      constant: number;
      cand: Float64Array[];
      table: Float64Array[];
      after: Float64Array;
      value: number;
    }[] = [];
    let root = -Infinity;

    cuts.forEach((cut, bin) => {
      // Partie linéaire des sorts avec cut % critique, maximum sur les combos.
      const linear = new Map(
        spells.map((sp) => {
          const p = prepared.get(sp)!;
          const pBar = Math.min(1, Math.max(0, (p.critBase + cut) / 100));
          const k = new Float64Array(D);
          let c0 = 0;
          for (const line of p.lines) {
            const rc = line.crit === null ? line.normal : Math.max(line.crit, line.normal);
            const a = (1 - pBar) * line.normal + pBar * rc;
            c0 += a;
            k[line.stat]! += a / 100;
            k[line.damage]! += 1;
            if (line.crit !== null) k[CRIT_DMG]! += pBar;
          }
          return [sp, { k, c0 }];
        }),
      );
      const lk = new Float64Array(D);
      for (let d = 0; d < D; d++) {
        if (spells.some((sp) => linear.get(sp)!.k[d]! > 0)) {
          lk[d] = bestComboDamage(spells, groups, apTarget, (sp) => linear.get(sp)!.k[d]!);
        }
      }
      const l0 = bestComboDamage(spells, groups, apTarget, (sp) => linear.get(sp)!.c0);
      const ellOf = (v: Vec) => {
        let x = 0;
        for (let d = 0; d < D; d++) if (lk[d]! > 0) x += lk[d]! * pos(v[d]!);
        return x;
      };
      const candL = cands.map((list) => list.map((c) => ellOf(c.up)));
      const ell0 = l0 + ellOf(baseVec);
      // Tranche ]bas, haut] : ρ < 0 fait payer le critique au-delà du haut (aucune
      // limite pour la dernière tranche) ; ρ > 0 exige d'atteindre le bas (aucun
      // bas pour la première).
      const isLast = bin === cuts.length - 1;
      const low = bin === 0 ? -Infinity : cuts[bin - 1]!;

      const scalars = (lambda: number, mu: number, rho: number) =>
        cands.map((list, f) =>
          Float64Array.from(
            list,
            (_, i) =>
              lambda * candY[f]![i]! +
              candL[f]![i]! / lambda +
              mu * candA[f]![i]! +
              rho * (rho > 0 ? candCUp[f]![i]! : candC[f]![i]!),
          ),
        );
      const constantOf = (lambda: number, mu: number, rho: number) =>
        lambda * y0 +
        ell0 / lambda +
        mu * (ap0 - apTarget) +
        rho * baseVec[CRIT]! -
        (rho > 0 ? rho * low : rho * cut);
      const rootValue = (lambda: number, mu: number, rho: number) => {
        let sum = constantOf(lambda, mu, rho);
        scalars(lambda, mu, rho).forEach((values, f) => {
          sum += topSum(values, order[f]!.slotIds.length);
        });
        return sum > 0 ? (sum * sum) / 400 : -Infinity;
      };

      // Recherche des meilleurs (λ, μ, ρ) : grille grossière puis affinage local.
      const lambdaStar = Math.sqrt(ell0 / y0) || 1;
      let best = { lambda: lambdaStar, mu: 0, rho: 0, value: rootValue(lambdaStar, 0, 0) };
      const candidatesGrid: { lambda: number; mu: number; rho: number; value: number }[] = [];
      for (let a = -8; a <= 8; a += 2) {
        const lambda = lambdaStar * 2 ** (a / 4);
        for (const muStep of [0, 0.5, 1, 2, 4, 8, 16, 32]) {
          const rhoSteps = [0];
          if (!isLast) rhoSteps.push(-1, -2, -4, -8, -16, -32);
          if (bin > 0) rhoSteps.push(1, 2, 4, 8, 16, 32);
          for (const rhoStep of rhoSteps) {
            const mu = muStep * lambda * 5;
            const rho = (rhoStep * ell0) / lambda / 200;
            const value = rootValue(lambda, mu, rho);
            candidatesGrid.push({ lambda, mu, rho, value });
            if (value < best.value) best = { lambda, mu, rho, value };
          }
        }
      }
      // Affinage : quelques passes de recherche par coordonnées autour du meilleur.
      for (let pass = 0; pass < 3; pass++) {
        for (const key of ["lambda", "mu", "rho"] as const) {
          for (const factor of [0.5, 0.7, 0.85, 1.2, 1.4, 2]) {
            if (best[key] === 0) continue;
            const trial = { ...best, [key]: best[key] * factor };
            trial.value = rootValue(trial.lambda, trial.mu, trial.rho);
            if (trial.value < best.value) best = trial;
          }
        }
      }
      candidatesGrid.push(best);
      candidatesGrid.sort((a, b) => a.value - b.value);
      const chosen = candidatesGrid.slice(0, 3);
      root = Math.max(root, chosen[0]!.value);

      for (const { lambda, mu, rho, value } of chosen) {
        const cand = scalars(lambda, mu, rho);
        const table = cand.map((values, f) => {
          const k = order[f]!.slotIds.length;
          const n = values.length;
          const t = new Float64Array((n + 1) * (k + 1));
          const top: number[] = [];
          for (let i = n - 1; i >= 0; i--) {
            const x = values[i]!;
            if (x > 0) {
              top.push(x);
              top.sort((a, b) => b - a);
              if (top.length > k) top.length = k;
            }
            let sum = 0;
            for (let r = 1; r <= k; r++) {
              sum += top[r - 1] ?? 0;
              t[i * (k + 1) + r] = sum;
            }
          }
          return t;
        });
        const after = new Float64Array(order.length + 1);
        for (let f = order.length - 1; f >= 0; f--) {
          after[f] = after[f + 1]! + table[f]![order[f]!.slotIds.length]!;
        }
        terms.push({ bin, constant: constantOf(lambda, mu, rho), cand, table, after, value });
      }
    });
    return { terms, bins: cuts.length, root };
  }

  /** Borne produit « au mieux » : la plus haute des tranches (chacune au plus serré). */
  function productBound(
    product: ReturnType<typeof buildProduct>,
    sumOf: (term: ReturnType<typeof buildProduct>["terms"][number], q: number) => number,
  ): number {
    const perBin = new Float64Array(product.bins).fill(Infinity);
    product.terms.forEach((term, q) => {
      const sum = sumOf(term, q);
      const value = sum > 0 ? (sum * sum) / 400 : -Infinity;
      if (value < perBin[term.bin]!) perBin[term.bin] = value;
    });
    return Math.max(...perBin);
  }

  // Tri par la borne : un objet qui, porté, ne peut pas battre le meilleur stuff
  // connu ne fera jamais partie de l'optimum. On le retire, puis on recommence.
  let product = buildProduct();
  let forced: Float64Array[] = cands.map((list) => new Float64Array(list.length));
  const filter = () => {
    for (let round = 0; round < 6; round++) {
      let removed = 0;
      const nextForced: Float64Array[] = [];
      cands.forEach((list, f) => {
        const k = order[f]!.slotIds.length;
        const values = list.map((_, i) =>
          productBound(product, (term) => {
            const table = term.table[f]!;
            return term.constant + term.after[0]! - table[k]! + table[k - 1]! + term.cand[f]![i]!;
          }),
        );
        const keep = list.filter((_, i) => values[i]! > bestDamage + 1e-9);
        nextForced.push(Float64Array.from(values.filter((v) => v > bestDamage + 1e-9)));
        removed += list.length - keep.length;
        cands[f] = keep;
      });
      forced = nextForced;
      if (removed === 0) return;
      product = buildProduct();
    }
  };
  filter();

  // Meilleur stuff de départ : recherche locale sur les objets restants, avec
  // l'objectif exact. Plus il est bon, plus on coupe ; puis on re-trie.
  const penalized = (v: Vec) => {
    const value = objective(v);
    if (value > -Infinity) return value;
    return -100_000 * (apTarget - Math.min(v[AP]! + baseVec[AP]!, STAT_CAPS.ap));
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const ids = new Set(cands.flatMap((list) => list.map((c) => c.id)));
    const local = optimizeStuff({
      level: input.level,
      weights: proxyWeights,
      items: input.items.filter((i) => ids.has(i.id)),
      sets: input.sets,
      perFamily: 10_000,
      restarts: 20,
      seed: 7 + attempt,
      objective: (t) => {
        const v = new Float64Array(D);
        for (const [k, list] of contrib) {
          const x = t(k);
          for (const [i, c] of list) v[i]! += c * x;
        }
        return penalized(v);
      },
    });
    const value = evaluateSlots(local.slots);
    if (value <= bestDamage + 1e-9) break;
    bestDamage = value;
    bestSlots = local.slots;
    filter();
  }

  // Les objets les plus prometteurs (borne la plus haute s'ils sont portés) d'abord.
  cands.forEach((list, f) => {
    const order2 = list.map((c, i) => ({ c, v: forced[f]![i]! })).sort((a, b) => b.v - a.v);
    cands[f] = order2.map((x) => x.c);
  });
  product = buildProduct();
  const terms = product.terms;
  const Q = terms.length;

  /**
   * suffixTop[f][i][r] : pour chaque caractéristique regroupée, somme des r
   * meilleurs apports parmi les objets i, i+1… de la famille (l'emplacement
   * vide compte pour 0). Les emplacements multiples (anneaux, Dofus) prennent
   * des objets dans l'ordre : seuls ceux qui restent après le dernier choisi comptent.
   */
  const buildSuffix = (key: "hi" | "up") =>
    cands.map((list, f) => {
      const k = order[f]!.slotIds.length;
      const n = list.length;
      const tops: number[][] = Array.from({ length: D }, () => []);
      const table: Vec[][] = new Array(n + 1);
      const snapshot = () =>
        Array.from({ length: k + 1 }, (_, r) => {
          const v = new Float64Array(D);
          for (let d = 0; d < D; d++) {
            for (let i = 0; i < r && i < tops[d]!.length; i++) v[d]! += tops[d]![i]!;
          }
          return v;
        });
      table[n] = snapshot();
      for (let i = n - 1; i >= 0; i--) {
        for (let d = 0; d < D; d++) {
          const x = list[i]![key][d]!;
          if (x <= 0) continue;
          const top = tops[d]!;
          top.push(x);
          top.sort((a, b) => b - a);
          if (top.length > k) top.length = k;
        }
        table[i] = snapshot();
      }
      return table;
    });
  // Deux bornes valables : apport exact déjà choisi + apports marginaux maximaux,
  // ou parts de panoplie partout. On garde la plus petite des deux.
  const suffixMarg = buildSuffix("hi");
  const suffixShare = buildSuffix("up");

  /** Borne des familles qui suivent la famille f (entièrement libres). */
  const buildAfter = (table: Vec[][][]) => {
    const after: Vec[] = new Array(order.length + 1);
    after[order.length] = new Float64Array(D);
    for (let f = order.length - 1; f >= 0; f--) {
      const v = new Float64Array(after[f + 1]!);
      const top = table[f]![0]![order[f]!.slotIds.length]!;
      for (let d = 0; d < D; d++) v[d]! += top[d]!;
      after[f] = v;
    }
    return after;
  };
  const afterMarg = buildAfter(suffixMarg);
  const afterShare = buildAfter(suffixShare);

  const partialQ = new Float64Array(Q);

  // ── Exploration ────────────────────────────────────────────────────────
  const gear = new Float64Array(D);
  const gearShare = new Float64Array(D);
  const counts = new Int32Array(setTiers.length);
  const chosen: (Cand | null)[] = new Array(P).fill(null);
  const bound = new Float64Array(D);
  let nodes = 0;
  let aborted = false;
  let prysmaUsed = false;

  function place(c: Cand, sign: 1 | -1, f: number, i: number) {
    for (let q = 0; q < Q; q++) partialQ[q]! += sign * terms[q]!.cand[f]![i]!;
    for (let d = 0; d < D; d++) {
      gear[d]! += sign * c.v[d]!;
      gearShare[d]! += sign * c.up[d]!;
    }
    if (c.set >= 0) {
      const tiers = setTiers[c.set]!;
      const before = counts[c.set]!;
      const now = before + sign;
      const a = tiers[Math.min(before, tiers.length - 1)]!;
      const b = tiers[Math.min(now, tiers.length - 1)]!;
      for (let d = 0; d < D; d++) gear[d]! += b[d]! - a[d]!;
      counts[c.set] = now;
    }
    if (c.prysma) prysmaUsed = sign === 1;
  }

  function visit(pos: number, minIndex: number) {
    if (aborted) return;
    nodes++;
    if ((nodes & 1023) === 0 && Date.now() - started > timeLimit) {
      aborted = true;
      return;
    }
    if (pos === P) {
      const value = objective(gear);
      if (value > bestDamage) {
        bestDamage = value;
        bestSlots = {};
        chosen.forEach((c, i) => {
          if (!c) return;
          const p = positions[i]!;
          bestSlots[order[p.family]!.slotIds[p.nth]!] = c.id;
        });
      }
      return;
    }
    const { family: f, nth } = positions[pos]!;
    const k = order[f]!.slotIds.length;
    const list = cands[f]!;
    // Borne : déjà choisi + meilleurs apports encore possibles.
    const remaining = k - nth;
    // Borne produit d'abord (rapide), puis borne caractéristique par caractéristique.
    const productValue = productBound(
      product,
      (term, q) =>
        term.constant +
        partialQ[q]! +
        term.table[f]![minIndex * (k + 1) + remaining]! +
        term.after[f + 1]!,
    );
    if (productValue <= bestDamage + 1e-9) return;
    const topM = suffixMarg[f]![minIndex]![remaining]!;
    const restM = afterMarg[f + 1]!;
    const topS = suffixShare[f]![minIndex]![remaining]!;
    const restS = afterShare[f + 1]!;
    for (let d = 0; d < D; d++) {
      bound[d] = Math.min(gear[d]! + topM[d]! + restM[d]!, gearShare[d]! + topS[d]! + restS[d]!);
    }
    if (objective(bound) <= bestDamage + 1e-9) return;

    const nextFamily = nth + 1 === k;
    // Objets dans l'ordre (sans répéter un même objet sur deux emplacements).
    for (let i = minIndex; i < list.length; i++) {
      const c = list[i]!;
      if (c.prysma && prysmaUsed) continue;
      place(c, 1, f, i);
      chosen[pos] = c;
      visit(pos + 1, nextFamily ? 0 : i + 1);
      chosen[pos] = null;
      place(c, -1, f, i);
      if (aborted) return;
    }
    // Emplacement vide : les suivants de la famille restent vides aussi.
    let skip = pos;
    while (skip < P && positions[skip]!.family === f) skip++;
    visit(skip, 0);
  }

  const rootBound = (() => {
    const v = new Float64Array(D);
    for (let d = 0; d < D; d++) v[d] = Math.min(afterMarg[0]![d]!, afterShare[0]![d]!);
    return objective(v);
  })();
  visit(0, 0);

  return {
    slots: bestSlots,
    damage: bestDamage,
    proven: !aborted,
    nodes,
    candidates: cands.reduce((n, l) => n + l.length, 0),
    considered,
    ms: Date.now() - started,
    rootBound: Math.min(rootBound, product.root),
    families: Object.fromEntries(
      order.map((o, f) => [
        o.family,
        { kept: cands[f]!.length, inSets: cands[f]!.filter((c) => c.set >= 0).length },
      ]),
    ),
  };
}

/**
 * Stuff optimal prouvé : la recherche locale donne d'abord un très bon stuff
 * (pour couper tôt), puis le branch and bound prouve l'optimum ou le trouve.
 */
export function optimizeTurnDamageProven(input: DamageOptimizeInput & { timeLimitMs?: number }) {
  const local = optimizeTurnDamage(input);
  const exact = optimizeTurnDamageExact({
    level: input.level,
    elements: input.elements,
    ap: input.ap,
    base: local.base,
    spells: local.spells,
    items: input.items,
    sets: input.sets,
    initial: local.slots,
    timeLimitMs: input.timeLimitMs,
  });
  return {
    ...exact,
    points: local.points,
    scrolls: local.scrolls,
    spells: local.spells,
    /** Dégâts du stuff de la recherche locale, pour comparer. */
    localDamage: local.score,
  };
}
