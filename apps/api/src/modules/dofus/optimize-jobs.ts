import { randomUUID } from "node:crypto";
import {
  CHARACTERISTICS,
  RESISTANCE_STATS,
  allocatePoints,
  availablePoints,
  buildDamageModel,
  computeCharacter,
  computeSpellDamage,
  damageProxyWeights,
  elementCharacteristics,
  optimizeStuff,
  parseCriteria,
  rotationDamage,
  simplifyCriteria,
  spellGradeAt,
  type Characteristic,
  type DofusBreed,
  type OptimizeRequest,
  type SlotId,
  type StatKey,
  type StatWeights,
  type TurnSpell,
} from "@kenpai/shared";
import { HttpError } from "../../lib/errors";
import type { DofusClient } from "./client";
import { defaultWorkers } from "./highs-pool";
import { optimizeTurnDamageMilp, type CellRange, type CellTrace } from "./milp";
import type { DofusDbClient } from "./spells";

/** Temps maximal d'une preuve ; au-delà, le meilleur stuff trouvé est rendu. */
const PROOF_TIME_LIMIT_MS = 5 * 60_000;
/** Calculs en attente au plus (les calculs passent un par un). */
const QUEUE_MAX = 5;
/** Durée de conservation d'un résultat. */
const KEEP_MS = 30 * 60_000;

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobProgress {
  phase: "data" | "search" | "proof";
  /** Meilleurs dégâts trouvés jusqu'ici (moyenne par tour). */
  damage: number | null;
  /** Dégâts maximaux encore imaginables (preuve en cours). */
  upper: number | null;
  cellsLeft: number;
  solves: number;
}

/** Déroulé détaillé du calcul, pour l'explication affichée au joueur (et le débogage). */
export interface JobTrace {
  /** Entonnoir des objets : écartés (niveau, interdits, non portables) puis candidats. */
  funnel: unknown;
  /** Dégâts du stuff de départ trouvé par la recherche locale. */
  localDamage: number | null;
  /** Évolution (ms, meilleurs dégâts, borne) pendant la preuve. */
  history: [number, number | null, number | null][];
  /** Cellules en cours de calcul. */
  running: CellRange[];
  /** Nombre total de cellules traitées. */
  cellCount: number;
}

const TRACE_CELLS_MAX = 20_000;

export interface OptimizeJobView {
  id: string;
  status: JobStatus;
  /** Place dans la file d'attente (0 : en cours ou terminé). */
  position: number;
  progress: JobProgress;
  result?: unknown;
  error?: string;
  elapsedMs: number;
  trace: JobTrace;
  /** Cellules traitées depuis l'index demandé (`since`). */
  cells: CellTrace[];
  /** Index de la première cellule renvoyée. */
  cellsFrom: number;
}

interface Job extends Omit<OptimizeJobView, "cells" | "cellsFrom"> {
  createdAt: number;
  startedAt: number | null;
  allCells: CellTrace[];
}

/**
 * Calculs d'optimisation en tâche de fond : ils peuvent durer de quelques
 * secondes à quelques minutes. Un seul tourne à la fois ; le site suit leur
 * progression en interrogeant régulièrement l'API.
 */
export class OptimizeJobs {
  private readonly jobs = new Map<string, Job>();
  private readonly waiting: string[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly client: DofusClient,
    private readonly spells: DofusDbClient,
  ) {}

  start(request: OptimizeRequest): OptimizeJobView {
    this.cleanup();
    if (this.waiting.length >= QUEUE_MAX) {
      throw new HttpError(429, "Trop de calculs en cours : réessayez dans un instant.");
    }
    const job: Job = {
      id: randomUUID(),
      status: "queued",
      position: 0,
      progress: { phase: "data", damage: null, upper: null, cellsLeft: 0, solves: 0 },
      elapsedMs: 0,
      trace: { funnel: null, localDamage: null, history: [], running: [], cellCount: 0 },
      allCells: [],
      createdAt: Date.now(),
      startedAt: null,
    };
    this.jobs.set(job.id, job);
    this.waiting.push(job.id);
    this.chain = this.chain.then(() => this.run(job, request));
    return this.view(job);
  }

  get(id: string, since = 0): OptimizeJobView | null {
    const job = this.jobs.get(id);
    return job ? this.view(job, since) : null;
  }

  private view(job: Job, since = 0): OptimizeJobView {
    const index = this.waiting.indexOf(job.id);
    const from = Math.max(0, Math.min(since, job.allCells.length));
    return {
      id: job.id,
      status: job.status,
      position: job.status === "queued" ? index + 1 : 0,
      progress: { ...job.progress },
      result: job.result,
      error: job.error,
      elapsedMs: job.startedAt ? Date.now() - job.startedAt : 0,
      trace: { ...job.trace, history: [...job.trace.history] },
      cells: job.allCells.slice(from, from + 2000),
      cellsFrom: from,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if ((job.status === "done" || job.status === "error") && now - job.createdAt > KEEP_MS) {
        this.jobs.delete(id);
      }
    }
  }

  private async run(job: Job, request: OptimizeRequest) {
    this.waiting.splice(this.waiting.indexOf(job.id), 1);
    job.status = "running";
    job.startedAt = Date.now();
    try {
      job.result = await this.optimize(request, job);
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = e instanceof HttpError ? e.message : "L'optimisation a échoué.";
    } finally {
      job.elapsedMs = Date.now() - (job.startedAt ?? Date.now());
    }
  }

  private async optimize(request: OptimizeRequest, job: Job) {
    const { progress, trace } = job;
    const { breedId, level, ap, exos, critical, attack, scrolls, minimums } = request;
    const [breeds, classSpells, equipment, sets] = await Promise.all([
      this.spells.breeds(),
      this.spells.spells(breedId),
      this.client.allEquipment(),
      this.client.allSets(),
    ]);
    // Conditions des objets (DofusDB) : caractéristiques, panoplies actives, classe.
    const criteria = await this.spells.itemCriteria(equipment.map((i) => i.id));
    const items = equipment.map((item) => {
      const tree = parseCriteria(criteria.get(item.id));
      return { ...item, criteria: tree ? simplifyCriteria(tree, { breedId }) : null };
    });
    const breed: DofusBreed | undefined = breeds.find((b) => b.id === breedId);
    if (!breed) throw new HttpError(404, "Classe inconnue.");

    // Sorts choisis : grade disponible au niveau, avec des dégâts.
    const spells: TurnSpell[] = [];
    for (const spell of classSpells) {
      if (!request.spellIds.includes(spell.id)) continue;
      const grade = spellGradeAt(spell, level);
      if (grade && grade.lines.length > 0) spells.push({ spell, grade, limit: 1 });
    }
    if (spells.length === 0) {
      throw new HttpError(422, "Aucun des sorts choisis ne fait de dégâts à ce niveau.");
    }
    const elements = [...new Set(spells.flatMap((s) => s.grade.lines.map((l) => l.element)))];

    // Base hors équipement : PA/PM/PO de base et exos, parchemins. Les points de
    // caractéristique, eux, sont répartis par l'optimiseur.
    const base: StatWeights = {
      ap: (level >= 100 ? 7 : 6) + (exos.ap ? 1 : 0),
      mp: 3 + (exos.mp ? 1 : 0),
      range: exos.range ? 1 : 0,
    };
    const scrollsBy = Object.fromEntries(CHARACTERISTICS.map((c) => [c, scrolls])) as Record<
      Characteristic,
      number
    >;
    for (const c of CHARACTERISTICS) base[c] = scrolls;
    const pointsBudget = availablePoints(level);
    // Exigences : PV = 50 + 5 × niveau + Vitalité ; PM ; PO ; % de résistance.
    const mins: Partial<Record<StatKey, number>> = {};
    if (minimums.hp) mins.vitality = minimums.hp - (50 + 5 * level);
    if (minimums.mp) mins.mp = minimums.mp;
    if (minimums.range) mins.range = minimums.range;
    for (const [element, stat] of Object.entries(RESISTANCE_STATS)) {
      const value = minimums.resistances[element as keyof typeof RESISTANCE_STATS];
      if (value !== undefined) mins[stat] = value;
    }

    // 1. Recherche locale rapide : un premier stuff, avec une répartition simple des
    //    points (éléments des sorts, et Vitalité si des PV sont exigés).
    progress.phase = "search";
    const model = buildDamageModel({
      level,
      elements,
      ap,
      base,
      spells,
      items,
      sets,
      mode: "rotation",
      attack,
      critical,
      pointsBudget,
      minimums: mins,
    });
    trace.funnel = model.funnel;
    const allocations: Partial<Record<StatKey, number>>[] = [];
    const elementStats = elementCharacteristics(elements);
    allocations.push(allocatePoints(level, elementStats));
    if (mins.vitality && mins.vitality > 0) {
      const vitality = Math.min(pointsBudget, mins.vitality);
      const rest = allocatePoints(1 + Math.floor((pointsBudget - vitality) / 5), elementStats);
      allocations.push({ ...rest, vitality });
    }
    let start: {
      slots: Partial<Record<SlotId, number>>;
      points: Partial<Record<StatKey, number>>;
    } | null = null;
    let startDamage = -Infinity;
    for (const points of allocations) {
      const withPoints: StatWeights = { ...base };
      for (const [k, v] of Object.entries(points) as [StatKey, number][]) {
        withPoints[k] = (withPoints[k] ?? 0) + v;
      }
      const local = optimizeStuff({
        level,
        weights: damageProxyWeights(elements),
        base: withPoints,
        items,
        sets,
        objective: (total) => {
          // Exigences non remplies : très pénalisées, pour que la recherche s'en écarte.
          let shortfall = 0;
          for (const [stat, min] of Object.entries(mins) as [StatKey, number][]) {
            shortfall += Math.max(0, min - total(stat));
          }
          shortfall += Math.max(0, ap - total("ap")) * 100;
          return rotationDamage(total, spells, { attack, critical }) - shortfall * 10_000;
        },
      });
      if (!model.feasible(local.slots, points)) continue;
      const damage = model.evaluateSlots(local.slots, points);
      if (damage > startDamage) {
        startDamage = damage;
        start = { slots: local.slots, points };
      }
    }
    progress.damage = start ? startDamage : null;
    trace.localDamage = progress.damage;
    await new Promise((resolve) => setImmediate(resolve));

    // 2. Preuve par programmation linéaire en nombres entiers (HiGHS), en parallèle.
    progress.phase = "proof";
    const proofStart = Date.now();
    let lastSample = -Infinity;
    const proof = await optimizeTurnDamageMilp({
      level,
      elements,
      ap,
      base,
      spells,
      items,
      sets,
      mode: "rotation",
      attack,
      critical,
      pointsBudget,
      minimums: mins,
      initial: start?.slots,
      initialPoints: start?.points,
      workers: defaultWorkers(),
      timeLimitMs: PROOF_TIME_LIMIT_MS,
      onProgress: (p) => {
        progress.damage = p.damage;
        progress.upper = p.upper;
        progress.cellsLeft = p.cellsLeft;
        progress.solves = p.solves;
        trace.running = p.running;
        const t = Date.now() - proofStart;
        if (t - lastSample >= 150 && trace.history.length < 4000) {
          lastSample = t;
          const finite = (x: number) => (Number.isFinite(x) ? x : null);
          trace.history.push([t, finite(p.damage), finite(p.upper)]);
        }
      },
      onCell: (cell) => {
        trace.cellCount++;
        if (job.allCells.length < TRACE_CELLS_MAX) job.allCells.push(cell);
      },
    });
    trace.running = [];
    trace.history.push([
      Date.now() - proofStart,
      Number.isFinite(proof.damage) ? proof.damage : null,
      Number.isFinite(proof.upper) ? proof.upper : null,
    ]);
    if (proof.damage === -Infinity) {
      throw new HttpError(
        422,
        proof.proven
          ? "Aucun stuff ne remplit toutes ces exigences : assouplissez-en une."
          : "Aucun stuff remplissant ces exigences n'a été trouvé à temps.",
      );
    }

    // Fiches complètes des objets retenus, caractéristiques et dégâts par sort.
    const slots: Partial<Record<SlotId, number>> = proof.slots;
    const ids = Object.values(slots).filter((id): id is number => id !== undefined);
    const chosen = await Promise.all(ids.map((id) => this.client.item(id)));
    const setIds = new Set(chosen.map((i) => i.set?.id).filter((id): id is number => !!id));
    const usedSets = sets.filter((s) => setIds.has(s.id));
    const points = Object.fromEntries(
      CHARACTERISTICS.map((c) => [c, proof.points[c] ?? 0]),
    ) as Record<Characteristic, number>;
    const character = computeCharacter({
      level,
      base: points,
      scrolls: scrollsBy,
      items: chosen,
      sets: usedSets,
      exos,
    });
    const totals = { ...character.totals };
    if (!critical) totals.critical = -1000;
    const perSpell = spells.map((s) => {
      const grade = { ...s.grade, range: attack === "melee" ? 1 : Math.max(2, s.grade.range) };
      const damage = computeSpellDamage(totals, grade);
      return {
        spellId: s.spell.id,
        name: s.spell.name,
        icon: s.spell.icon,
        apCost: s.grade.apCost,
        average: damage.exactAverage,
        lines: damage.lines,
        criticalChance: critical ? damage.criticalChance : 0,
      };
    });
    return {
      breed,
      level,
      ap,
      exos,
      critical,
      attack,
      scrolls,
      minimums,
      points,
      slots,
      damage: perSpell.reduce((sum, s) => sum + s.average, 0),
      spells: perSpell,
      hp: character.hp,
      totals: character.totals,
      items: chosen,
      sets: usedSets,
      proof: {
        proven: proof.proven,
        damage: proof.damage,
        upper: proof.upper,
        solves: proof.solves,
        candidates: proof.candidates,
        considered: proof.considered,
        ms: proof.ms,
        localDamage: startDamage,
      },
    };
  }
}
