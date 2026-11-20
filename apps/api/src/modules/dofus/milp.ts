/**
 * Optimiseur exact par programmation linéaire en nombres entiers (MILP, solveur HiGHS).
 *
 * Les dégâts d'un tour sont un produit (100 + % dommages) × (caractéristique,
 * Dommages, critique…) : ce n'est pas linéaire. On découpe donc l'espace en
 * « cellules » selon le % dommages et le % critique. Dans une cellule où ces
 * valeurs sont au plus Pmax et Cmax, les dégâts de tout stuff sont au plus
 * U(stuff) = max sur les combos de sorts d'une expression LINÉAIRE (calculée
 * avec Pmax et Cmax) : HiGHS trouve le maximum exact de U dans la cellule,
 * panoplies comprises.
 *
 * - Si ce maximum ne dépasse pas le meilleur stuff connu, la cellule ne peut
 *   pas contenir mieux : elle est écartée (preuve).
 * - Sinon, le stuff trouvé est évalué avec la vraie formule (il devient le
 *   meilleur s'il l'est), puis la cellule est coupée en deux autour de ses
 *   valeurs réelles de % dommages ou de % critique, et on recommence.
 * Quand toutes les cellules sont écartées, le meilleur stuff est l'optimum.
 */
import { inProcessSolver, workerSolver, type SolveResult } from "./highs-pool";
import {
  SLOTS,
  buildDamageModel,
  type Cand,
  type DamageModelInput,
  type SlotFamily,
  type SlotId,
  type TurnSpell,
  type CriteriaTree,
  type StatKey,
  type Vec,
} from "@kenpai/shared";

export interface MilpInput extends DamageModelInput {
  /** Un bon stuff de départ (recherche locale) : les cellules moins bonnes tombent vite. */
  initial?: Partial<Record<SlotId, number>>;
  timeLimitMs?: number;
  /** Fils de calcul HiGHS en parallèle (0 ou absent : dans le fil courant). */
  workers?: number;
  /** Appelé après chaque cellule : meilleur stuff actuel et travail restant. */
  onProgress?: (progress: MilpProgress) => void;
}

export interface MilpProgress {
  damage: number;
  slots: Partial<Record<SlotId, number>>;
  /** Dégâts maximaux encore imaginables (cellules restantes). */
  upper: number;
  cellsLeft: number;
  solves: number;
}

export interface MilpResult {
  slots: Partial<Record<SlotId, number>>;
  /** Dégâts moyens du tour (formule de l'optimiseur, sans les arrondis du jeu). */
  damage: number;
  /** Vrai si toutes les cellules ont été écartées : aucun stuff ne fait mieux. */
  proven: boolean;
  /** Programmes linéaires résolus. */
  solves: number;
  /** Si la preuve n'a pas abouti : dégâts maximaux encore imaginables. */
  upper: number;
  /** Objets candidats après élimination des objets dominés. */
  candidates: number;
  considered: number;
  ms: number;
}

/** Un combo de sorts : sorts lancés et nombre de lancers. */
type Combo = { spell: TurnSpell; casts: number }[];

/** Tous les combos « pleins » (on ne peut plus rien lancer) dans les PA visés. */
function enumerateCombos(
  spells: readonly TurnSpell[],
  groups: readonly number[][],
  ap: number,
): Combo[] {
  const result: Combo[] = [];
  const current: Combo = [];
  const visit = (g: number, left: number) => {
    if (g === groups.length) {
      // Plein : aucun sort encore lançable (nouveau groupe ou lancer supplémentaire).
      const full = groups.every((group) =>
        group.every((i) => {
          const s = spells[i]!;
          const used = current.find((c) => c.spell === s);
          const usedGroup = current.some((c) => group.includes(spells.indexOf(c.spell)));
          if (usedGroup && !used) return true; // l'autre variante est prise
          const casts = used?.casts ?? 0;
          return casts >= s.limit || s.grade.apCost > left;
        }),
      );
      if (full && current.length > 0) result.push(current.map((c) => ({ ...c })));
      return;
    }
    visit(g + 1, left);
    for (const i of groups[g]!) {
      const s = spells[i]!;
      for (let n = 1; n <= s.limit && n * s.grade.apCost <= left; n++) {
        current.push({ spell: s, casts: n });
        visit(g + 1, left - n * s.grade.apCost);
        current.pop();
      }
    }
  };
  visit(0, ap);
  return result;
}

interface Cell {
  /** % dommages (par type : mêlée, distance) : bornes incluses. */
  pctLo: number[];
  pctHi: number[];
  critLo: number;
  critHi: number;
  /**
   * Dommages critiques ≥ 0 (cas normal : ils s'ajoutent au coup critique) ou
   * < 0 (le coup critique ne dépasse alors pas le jet critique).
   */
  cdPositive: boolean;
  /** Borne supérieure de dégâts déjà connue (cellule mère), pour l'ordre de traitement. */
  upper: number;
  /** Stuffs déjà évalués, interdits dans cette cellule (indices des objets). */
  cuts: number[][];
}

const fmt = (x: number) => {
  const r = Math.round(x * 1e9) / 1e9;
  return Object.is(r, -0) ? "0" : String(r);
};

export async function optimizeTurnDamageMilp(input: MilpInput): Promise<MilpResult> {
  const started = Date.now();
  const timeLimit = input.timeLimitMs ?? 120_000;
  // Fils de calcul en parallèle si demandé, sinon dans le fil courant.
  const solver = input.workers ? workerSolver(input.workers) : await inProcessSolver();
  const model = buildDamageModel(input);
  const { D, AP, CRIT, CRIT_DMG, MELEE, RANGED, baseVec, prepared, setTiers } = model;
  const apTarget = input.ap;
  const pctDims = [MELEE, RANGED].filter((d) => d >= 0);
  // Au-delà de ce % critique, tous les sorts sont des coups critiques : inutile de distinguer.
  const critCap = 100 - Math.min(...input.spells.map((sp) => prepared.get(sp)!.critBase));

  // ── Candidats et panoplies utiles ───────────────────────────────────────
  const families = [...new Set(SLOTS.map((s) => s.family as SlotFamily))];
  const cands: { c: Cand; family: SlotFamily; var: string }[] = [];
  for (const family of families) {
    for (const c of model.byFamily.get(family) ?? []) {
      cands.push({ c, family, var: `x${cands.length}` });
    }
  }
  const membersOf = new Map<number, number[]>();
  cands.forEach(({ c }, i) => {
    if (c.set >= 0) membersOf.set(c.set, [...(membersOf.get(c.set) ?? []), i]);
  });
  // Une panoplie ne donne de bonus qu'à partir de 2 objets.
  const sets = [...membersOf.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([set, members], k) => {
      const tiers = setTiers[set]!;
      const max = Math.min(members.length, tiers.length - 1);
      return { set, members, tiers: tiers.slice(0, max + 1), var: `u${k}` };
    });

  // ── Bornes de départ de chaque caractéristique ──────────────────────────
  const extreme = (d: number, sign: 1 | -1) => {
    let total = baseVec[d]!;
    for (const family of families) {
      const k = model.slotsOf(family);
      const values = cands
        .filter((x) => x.family === family)
        .map((x) => sign * x.c.v[d]!)
        .filter((v) => v > 0)
        .sort((a, b) => b - a);
      for (let i = 0; i < k && i < values.length; i++) total += sign * values[i]!;
    }
    for (const s of sets) {
      total += sign * Math.max(0, ...s.tiers.map((t) => sign * t[d]!));
    }
    return Math.round(total);
  };
  // Équipement seul (sans la base) : bornes basse et haute de chaque caractéristique.
  const gearLo = Float64Array.from({ length: D }, (_, d) => extreme(d, -1) - baseVec[d]!);
  const gearHi = Float64Array.from({ length: D }, (_, d) => extreme(d, 1) - baseVec[d]!);

  // ── Combos de sorts ─────────────────────────────────────────────────────
  const spells = input.spells;
  const combos = enumerateCombos(spells, model.groups, apTarget);

  /** Expression linéaire U pour un combo et une cellule : constante + coefficients. */
  function comboLinear(combo: Combo, cell: Cell) {
    const coef = new Float64Array(D);
    let constant = 0;
    for (const { spell, casts } of combo) {
      const p = prepared.get(spell)!;
      const pctIndex = pctDims.indexOf(p.pct);
      const factor = (casts * (100 + (pctIndex >= 0 ? cell.pctHi[pctIndex]! : 0))) / 100;
      const pBar = Math.min(1, Math.max(0, (p.critBase + cell.critHi) / 100));
      for (const line of p.lines) {
        const rc = line.crit === null ? line.normal : Math.max(line.crit, line.normal);
        const a = (1 - pBar) * line.normal + pBar * rc;
        constant += factor * a;
        coef[line.stat]! += (factor * a) / 100;
        coef[line.damage]! += factor;
        if (line.crit !== null && cell.cdPositive) coef[CRIT_DMG]! += factor * pBar;
      }
    }
    // La base s'ajoute à la constante.
    for (let d = 0; d < D; d++) constant += coef[d]! * baseVec[d]!;
    return { coef, constant };
  }

  /** U(vecteur) = max sur les combos, pour comparer et choisir où couper. */
  function upperAt(gear: Vec, cell: Cell): number {
    let best = 0;
    for (const combo of combos) {
      const { coef, constant } = comboLinear(combo, cell);
      let value = constant;
      for (let d = 0; d < D; d++) value += coef[d]! * gear[d]!;
      if (value > best) best = value;
    }
    return best;
  }

  // ── Programme linéaire d'une cellule ────────────────────────────────────
  /** Terme « Σ coef × caractéristique » écrit avec les variables objets et panoplies. */
  function featureTerms(weights: Vec): string[] {
    const terms: string[] = [];
    for (const { c, var: v } of cands) {
      let w = 0;
      for (let d = 0; d < D; d++) w += weights[d]! * c.v[d]!;
      if (Math.abs(w) > 1e-9) terms.push(`${w >= 0 ? "+" : "-"} ${fmt(Math.abs(w))} ${v}`);
    }
    for (const s of sets) {
      s.tiers.forEach((tier, n) => {
        let w = 0;
        for (let d = 0; d < D; d++) w += weights[d]! * tier[d]!;
        if (Math.abs(w) > 1e-9) {
          terms.push(`${w >= 0 ? "+" : "-"} ${fmt(Math.abs(w))} ${s.var}_${n}`);
        }
      });
    }
    return terms;
  }
  const unit = (d: number) => {
    const w = new Float64Array(D);
    w[d] = 1;
    return w;
  };
  const row = (name: string, terms: string[], op: string, rhs: number) =>
    ` ${name}: ${terms.length > 0 ? terms.join(" ") : "0 x0"} ${op} ${fmt(rhs)}`;

  // Contraintes communes à toutes les cellules (emplacements, panoplies, PA).
  const common: string[] = [];
  for (const family of families) {
    const vars = cands.filter((x) => x.family === family).map((x) => `+ ${x.var}`);
    if (vars.length > 0) common.push(row(`slot_${family}`, vars, "<=", model.slotsOf(family)));
  }
  const prysmas = cands.filter((x) => x.c.prysma).map((x) => `+ ${x.var}`);
  if (prysmas.length > 1) common.push(row("prysma", prysmas, "<=", 1));
  for (const s of sets) {
    common.push(
      row(
        `${s.var}_one`,
        s.tiers.map((_, n) => `+ ${s.var}_${n}`),
        "=",
        1,
      ),
    );
    common.push(
      row(
        `${s.var}_count`,
        [
          ...s.tiers.slice(1).map((_, n) => `+ ${n + 1} ${s.var}_${n + 1}`),
          ...s.members.map((i) => `- ${cands[i]!.var}`),
        ],
        "=",
        0,
      ),
    );
  }
  common.push(row("ap", featureTerms(unit(AP)), ">=", apTarget - baseVec[AP]!));
  const binaries = [
    ...cands.map((x) => x.var),
    ...sets.flatMap((s) => s.tiers.map((_, n) => `${s.var}_${n}`)),
  ];

  // ── Conditions des objets ───────────────────────────────────────────────
  // « Si l'objet est porté, alors total ≤ / ≥ valeur » : contrainte linéaire
  // désactivée quand l'objet n'est pas porté (grand M). Les « ou » reçoivent
  // une variable par branche (au moins une branche respectée).
  const itemById = new Map(input.items.map((i) => [i.id, i]));
  const rawStat = (effects: readonly { stat: string | null; value: number }[], stat: StatKey) =>
    effects.reduce((sum, e) => (e.stat === stat ? sum + e.value : sum), 0);
  /** Bonus brut d'une panoplie portée à n objets (palier le plus haut atteint). */
  const setBonusAt = (set: number, n: number) => {
    if (n < 2) return [];
    const bonuses = input.sets[set]!.bonuses;
    const tier = Math.max(
      0,
      ...Object.keys(bonuses)
        .map(Number)
        .filter((k) => k <= n),
    );
    return bonuses[tier] ?? [];
  };
  /** Total d'une caractéristique : termes (objets, panoplies), constante, ampleur maximale. */
  function statExpression(stat: StatKey) {
    const terms: string[] = [];
    let size = 0;
    for (const x of cands) {
      const w = rawStat(itemById.get(x.c.id)?.effects ?? [], stat);
      if (w !== 0) {
        terms.push(`${w >= 0 ? "+" : "-"} ${fmt(Math.abs(w))} ${x.var}`);
        size += Math.abs(w);
      }
    }
    for (const s of sets) {
      let largest = 0;
      s.tiers.forEach((_, n) => {
        const w = rawStat(setBonusAt(s.set, n), stat);
        if (w !== 0) terms.push(`${w >= 0 ? "+" : "-"} ${fmt(Math.abs(w))} ${s.var}_${n}`);
        largest = Math.max(largest, Math.abs(w));
      });
      size += largest;
    }
    return { terms, constant: input.base[stat] ?? 0, size };
  }
  /** Nombre de panoplies au bonus actif : Σ (1 − u_0 − u_1). */
  function activeSetsExpression() {
    const terms = sets.flatMap((s) => [`- ${s.var}_0`, `- ${s.var}_1`]);
    return { terms, constant: sets.length, size: sets.length };
  }
  let orCount = 0;
  function encode(tree: CriteriaTree, active: string, name: string) {
    switch (tree.kind) {
      case "true":
      case "breed":
        return;
      case "false":
        common.push(row(`${name}_no`, [`+ ${active}`], "<=", 0));
        return;
      case "and":
        tree.children.forEach((c, k) => encode(c, active, `${name}a${k}`));
        return;
      case "or": {
        const branches = tree.children.map(() => `o${orCount++}`);
        binaries.push(...branches);
        common.push(row(`${name}_or`, [...branches.map((b) => `+ ${b}`), `- ${active}`], ">=", 0));
        tree.children.forEach((c, k) => encode(c, branches[k]!, `${name}o${k}`));
        return;
      }
      case "stat":
      case "sets": {
        if (tree.op === "!") return; // « différent de » : rare, laissé de côté
        const { terms, constant, size } =
          tree.kind === "stat" ? statExpression(tree.stat) : activeSetsExpression();
        const bigM = size + Math.abs(constant) + Math.abs(tree.value) + 2;
        if (tree.op === "<" || tree.op === "=") {
          const limit = tree.op === "<" ? tree.value - 1 : tree.value;
          common.push(
            row(
              `${name}_le`,
              [...terms, `+ ${fmt(bigM)} ${active}`],
              "<=",
              limit - constant + bigM,
            ),
          );
        }
        if (tree.op === ">" || tree.op === "=") {
          const limit = tree.op === ">" ? tree.value + 1 : tree.value;
          common.push(
            row(
              `${name}_ge`,
              [...terms, `- ${fmt(bigM)} ${active}`],
              ">=",
              limit - constant - bigM,
            ),
          );
        }
        return;
      }
    }
  }
  cands.forEach((x, i) => {
    const item = itemById.get(x.c.id);
    const criteria = item ? model.criteriaOf(item) : null;
    if (criteria) encode(criteria, x.var, `cond${i}`);
  });

  function buildLps(
    cell: Cell,
  ): { constant: number; relaxed: string; lp: (fixed: Map<string, 0 | 1>) => string }[] {
    const rows = [...common];
    // Stuffs déjà évalués : interdits (au moins un objet doit changer).
    cell.cuts.forEach((chosenSet, k) => {
      const inSet = new Set(chosenSet);
      rows.push(
        row(
          `cut${k}`,
          cands.map((x, i) => (inSet.has(i) ? `+ ${x.var}` : `- ${x.var}`)),
          "<=",
          chosenSet.length - 1,
        ),
      );
    });
    pctDims.forEach((d, k) => {
      const terms = featureTerms(unit(d));
      rows.push(row(`pct${k}_lo`, terms, ">=", cell.pctLo[k]! - baseVec[d]!));
      rows.push(row(`pct${k}_hi`, terms, "<=", cell.pctHi[k]! - baseVec[d]!));
    });
    rows.push(
      row(
        "crit_dmg",
        featureTerms(unit(CRIT_DMG)),
        cell.cdPositive ? ">=" : "<=",
        (cell.cdPositive ? 0 : -1) - baseVec[CRIT_DMG]!,
      ),
    );
    const critTerms = featureTerms(unit(CRIT));
    rows.push(row("crit_lo", critTerms, ">=", cell.critLo - baseVec[CRIT]!));
    if (cell.critHi < critCap) {
      rows.push(row("crit_hi", critTerms, "<=", cell.critHi - baseVec[CRIT]!));
    }
    // Combos : on écarte ceux qu'un autre combo bat pour TOUT stuff possible.
    const linears = combos.map((combo) => comboLinear(combo, cell));
    const useful = linears.filter(
      (a, i) =>
        !linears.some((b, j) => {
          if (i === j) return false;
          let margin = b.constant - a.constant;
          for (let d = 0; d < D; d++) {
            const diff = b.coef[d]! - a.coef[d]!;
            margin += diff >= 0 ? diff * gearLo[d]! : diff * gearHi[d]!;
          }
          return margin > 1e-9 || (margin > -1e-9 && j < i);
        }),
    );
    // Un programme par combo utile : maximiser U_k (linéaire) dans la cellule.
    return useful.map(({ coef, constant }) => {
      const head = [
        "Maximize",
        ` obj: ${featureTerms(coef).join(" ") || "0 x0"}`,
        "Subject To",
        ...rows,
      ];
      return {
        constant,
        // Relaxation continue (variables entre 0 et 1) : borne rapide, souvent suffisante.
        relaxed: [...head, "Bounds", ...binaries.map((b) => ` 0 <= ${b} <= 1`), "End"].join("\n"),
        /** Programme en nombres entiers, avec des objets éventuellement fixés. */
        lp: (fixed: Map<string, 0 | 1>) =>
          [
            ...head,
            ...(fixed.size > 0 ? ["Bounds", ...[...fixed].map(([v, x]) => ` ${v} = ${x}`)] : []),
            "Binary",
            ...binaries.map((b) => ` ${b}`),
            "End",
          ].join("\n"),
      };
    });
  }

  // ── Stuff : vecteur, emplacements ───────────────────────────────────────
  function slotsFromSolution(chosen: Set<number>): Partial<Record<SlotId, number>> {
    const slots: Partial<Record<SlotId, number>> = {};
    for (const family of families) {
      const ids = cands.filter((x, i) => x.family === family && chosen.has(i)).map((x) => x.c.id);
      SLOTS.filter((s) => s.family === family).forEach((slot, n) => {
        if (ids[n] !== undefined) slots[slot.id as SlotId] = ids[n];
      });
    }
    return slots;
  }
  function gearOf(chosen: Set<number>): Vec {
    const gear = new Float64Array(D);
    const counts = new Map<number, number>();
    chosen.forEach((i) => {
      const c = cands[i]!.c;
      for (let d = 0; d < D; d++) gear[d]! += c.v[d]!;
      if (c.set >= 0) counts.set(c.set, (counts.get(c.set) ?? 0) + 1);
    });
    for (const [set, n] of counts) {
      const tiers = setTiers[set]!;
      const tier = tiers[Math.min(n, tiers.length - 1)]!;
      for (let d = 0; d < D; d++) gear[d]! += tier[d]!;
    }
    return gear;
  }

  // ── Recherche par cellules ──────────────────────────────────────────────
  let bestDamage = -Infinity;
  let bestSlots: Partial<Record<SlotId, number>> = {};
  // Le stuff de départ ne sert que s'il respecte toutes les conditions.
  if (input.initial && model.feasible(input.initial)) {
    bestDamage = model.evaluateSlots(input.initial);
    bestSlots = { ...input.initial };
  }

  // Cellules les plus prometteuses d'abord (borne de la cellule mère la plus haute).
  const queue: Cell[] = [true, false].map((cdPositive) => ({
    pctLo: pctDims.map((d) => extreme(d, -1)),
    pctHi: pctDims.map((d) => extreme(d, 1)),
    critLo: extreme(CRIT, -1),
    critHi: Math.min(extreme(CRIT, 1), critCap),
    cdPositive,
    upper: Infinity,
    cuts: [],
  }));
  let solves = 0;
  let relaxSolves = 0;
  let proven = true;
  const eps = 1e-6;

  // Cellules abandonnées (erreur du solveur) : leur borne reste à prendre en compte.
  let lostUpper = -Infinity;
  const upperLeft = () =>
    [...queue, ...running.values()].reduce(
      (m, c) => Math.max(m, c.upper),
      Math.max(bestDamage, lostUpper),
    );
  /** Traite une cellule : bornes, programmes en nombres entiers, puis coupe ou abandon. */
  async function processCell(cell: Cell): Promise<void> {
    // Maximum de U dans la cellule : le meilleur des programmes (un par combo).
    let cellUpper = -Infinity;
    let chosen: Set<number> | null = null;
    let failed = false;
    const programs = buildLps(cell);
    // 1. Relaxation continue de chaque combo : borne rapide, souvent suffisante.
    const open: {
      constant: number;
      lp: (fixed: Map<string, 0 | 1>) => string;
      relaxUpper: number;
      fixed: Map<string, 0 | 1>;
    }[] = [];
    for (const { constant, relaxed, lp } of programs) {
      const remaining = Math.max(1, (timeLimit - (Date.now() - started)) / 1000);
      let relaxUpper = Infinity;
      const fixed = new Map<string, 0 | 1>();
      try {
        const relax = await solver.solve(relaxed, { time_limit: remaining, output_flag: false });
        relaxSolves++;
        if (relax.Status === "Infeasible") continue;
        if (relax.Status === "Optimal") {
          relaxUpper = relax.ObjectiveValue + constant;
          // Fixation par coûts réduits : forcer l'objet à l'autre valeur fait perdre au
          // moins |coût réduit| à la relaxation ; si l'on retombe sous le meilleur stuff,
          // aucun stuff meilleur ne peut faire ce choix.
          const columns = relax.Columns as Record<string, { Primal: number; Dual: number }>;
          for (const { var: v } of cands) {
            const col = columns[v];
            if (!col || relaxUpper - Math.abs(col.Dual) > bestDamage + eps) continue;
            if (col.Primal < 1e-9) fixed.set(v, 0);
            else if (col.Primal > 1 - 1e-9) fixed.set(v, 1);
          }
        }
      } catch {
        // Pas de conclusion : le programme en nombres entiers tranchera.
      }
      if (relaxUpper <= bestDamage + eps) continue;
      open.push({ constant, lp, relaxUpper, fixed });
    }
    open.sort((a, b) => b.relaxUpper - a.relaxUpper);
    // Borne valable de la cellule tant qu'on n'a pas fait mieux : la plus haute relaxation.
    const relaxBound = open.reduce((m, o) => Math.max(m, o.relaxUpper), -Infinity);

    // 2. Programmes en nombres entiers, du plus prometteur au moins prometteur. Dès
    //    qu'un combo peut dépasser le meilleur stuff, la cellule sera coupée : inutile
    //    de résoudre les autres, ni d'aller jusqu'au maximum exact (cible de HiGHS).
    for (const { constant, lp, fixed } of open) {
      const remaining = Math.max(1, (timeLimit - (Date.now() - started)) / 1000);
      // Avec une cible, HiGHS s'arrête dès qu'il la dépasse ; ses valeurs ne forment
      // alors pas toujours un vrai stuff. On vérifie, et sinon on résout sans cible.
      const solve = (withTarget: boolean) =>
        solver.solve(lp(fixed), {
          mip_rel_gap: 1e-9,
          mip_abs_gap: 1e-6,
          time_limit: remaining,
          ...(withTarget ? { objective_target: bestDamage + eps - constant } : {}),
          output_flag: false,
        });
      const readStuff = (solution: SolveResult) => {
        const columns = solution.Columns as Record<string, { Primal: number }>;
        const picked = new Set<number>();
        let integral = true;
        cands.forEach((x, i) => {
          const value = columns[x.var]?.Primal ?? 0;
          if (value > 1e-6 && value < 1 - 1e-6) integral = false;
          if (value > 0.5) picked.add(i);
        });
        const counts = new Map<SlotFamily, number>();
        picked.forEach((i) =>
          counts.set(cands[i]!.family, (counts.get(cands[i]!.family) ?? 0) + 1),
        );
        const fits = [...counts].every(([family, n]) => n <= model.slotsOf(family));
        const valid =
          integral &&
          fits &&
          model.feasible(slotsFromSolution(picked)) &&
          model.objective(gearOf(picked)) > -Infinity;
        return { picked, valid };
      };
      let solution: SolveResult;
      let stuff: { picked: Set<number>; valid: boolean };
      try {
        solution = await solve(true);
        solves++;
        if (solution.Status === "Target for objective reached") {
          stuff = readStuff(solution);
          if (!stuff.valid) {
            solution = await solve(false);
            solves++;
          }
        }
      } catch {
        failed = true; // erreur du solveur : rien de sûr sur cette cellule
        break;
      }
      if (solution.Status === "Infeasible") continue;
      const targetReached = solution.Status === "Target for objective reached";
      if (solution.Status !== "Optimal" && !targetReached) {
        failed = true;
        break;
      }
      const upper = solution.ObjectiveValue + constant;
      stuff = readStuff(solution);
      if (!stuff.valid) {
        // Solution inattendue (même « optimale ») : on ne conclut rien de faux.
        failed = true;
        break;
      }
      const picked = stuff.picked;
      // Chaque stuff trouvé est évalué avec la vraie formule.
      const value = model.objective(gearOf(picked));
      if (value > bestDamage) {
        bestDamage = value;
        bestSlots = slotsFromSolution(picked);
      }
      if (upper > bestDamage + eps || targetReached) {
        cellUpper = Math.max(upper, relaxBound);
        chosen = picked;
        break;
      }
    }
    if (failed) {
      proven = false;
      lostUpper = Math.max(lostUpper, cell.upper);
      return;
    }
    if (!chosen || cellUpper <= bestDamage + eps) return;
    const gear = gearOf(chosen);

    // Couper la cellule là où la borne est la plus lâche pour ce stuff.
    const total = (d: number) => Math.round(gear[d]! + baseVec[d]!);
    const here = upperAt(gear, cell);
    let bestSplit: { gain: number; apply: (lo: Cell, hi: Cell) => void } | null = null;
    // Plage large : on coupe au milieu ; plage étroite : juste au niveau du stuff trouvé.
    const cut = (lo: number, hi: number, at: number, wide: number) =>
      hi - lo > wide ? Math.floor((lo + hi) / 2) : Math.min(at, hi);
    pctDims.forEach((d, k) => {
      const value = cut(cell.pctLo[k]!, cell.pctHi[k]!, total(d), 4);
      if (value >= cell.pctHi[k]!) return;
      const tighter = { ...cell, pctHi: cell.pctHi.map((x, j) => (j === k ? value : x)) };
      const gain = here - upperAt(gear, tighter);
      if (!bestSplit || gain > bestSplit.gain) {
        bestSplit = {
          gain,
          apply: (lo, hi) => {
            lo.pctHi = lo.pctHi.map((x, j) => (j === k ? value : x));
            hi.pctLo = hi.pctLo.map((x, j) => (j === k ? value + 1 : x));
          },
        };
      }
    });
    const crit = cut(Math.max(cell.critLo, 0), cell.critHi, total(CRIT), 8);
    if (crit < cell.critHi) {
      const gain = here - upperAt(gear, { ...cell, critHi: crit });
      if (!bestSplit || gain > (bestSplit as { gain: number }).gain) {
        bestSplit = {
          gain,
          apply: (lo, hi) => {
            lo.critHi = crit;
            hi.critLo = crit + 1;
          },
        };
      }
    }
    if (!bestSplit) {
      // Le stuff est au coin de la cellule : seule la différence d'arrondis sépare
      // la borne des vrais dégâts. On interdit ce stuff précis et on recommence.
      queue.push({
        ...cell,
        upper: cellUpper,
        cuts: [...cell.cuts, [...chosen]],
      });
      return;
    }
    const lo: Cell = { ...cell, pctLo: [...cell.pctLo], pctHi: [...cell.pctHi], upper: cellUpper };
    const hi: Cell = { ...cell, pctLo: [...cell.pctLo], pctHi: [...cell.pctHi], upper: cellUpper };
    (bestSplit as { apply: (lo: Cell, hi: Cell) => void }).apply(lo, hi);
    queue.push(hi, lo);
  }

  // Plusieurs cellules à la fois (une par fil de calcul), les plus prometteuses d'abord.
  const running = new Map<Promise<void>, Cell>();
  let timeUp = false;
  for (;;) {
    input.onProgress?.({
      damage: bestDamage,
      slots: bestSlots,
      upper: upperLeft(),
      cellsLeft: queue.length + running.size,
      solves: solves + relaxSolves,
    });
    if (Date.now() - started > timeLimit) timeUp = true;
    while (!timeUp && running.size < solver.size && queue.length > 0) {
      let top = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i]!.upper > queue[top]!.upper) top = i;
      const cell = queue.splice(top, 1)[0]!;
      if (cell.upper <= bestDamage + eps) continue;
      const task: Promise<void> = processCell(cell).finally(() => running.delete(task));
      running.set(task, cell);
    }
    if (running.size === 0) break;
    await Promise.race(running.keys());
  }
  if (timeUp && queue.some((c) => c.upper > bestDamage + eps)) proven = false;

  return {
    slots: bestSlots,
    damage: bestDamage,
    proven,
    upper: proven ? bestDamage : Math.max(upperLeft(), bestDamage),
    solves: solves + relaxSolves,
    candidates: cands.length,
    considered: model.considered,
    ms: Date.now() - started,
  };
}
