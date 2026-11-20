import { randomUUID } from "node:crypto";
import {
  classElements,
  computeCharacter,
  optimizeTurnDamage,
  optimizeTurnDamageExact,
  turnCombo,
  type DofusBreed,
  type OptimizeRequest,
  type SlotId,
} from "@kenpai/shared";
import { HttpError } from "../../lib/errors";
import type { DofusClient } from "./client";
import { optimizeTurnDamageMilp } from "./milp";
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

export interface OptimizeJobView {
  id: string;
  status: JobStatus;
  /** Place dans la file d'attente (0 : en cours ou terminé). */
  position: number;
  progress: JobProgress;
  result?: unknown;
  error?: string;
  elapsedMs: number;
}

interface Job extends OptimizeJobView {
  createdAt: number;
  startedAt: number | null;
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
      createdAt: Date.now(),
      startedAt: null,
    };
    this.jobs.set(job.id, job);
    this.waiting.push(job.id);
    this.chain = this.chain.then(() => this.run(job, request));
    return this.view(job);
  }

  get(id: string): OptimizeJobView | null {
    const job = this.jobs.get(id);
    return job ? this.view(job) : null;
  }

  private view(job: Job): OptimizeJobView {
    const index = this.waiting.indexOf(job.id);
    return {
      id: job.id,
      status: job.status,
      position: job.status === "queued" ? index + 1 : 0,
      progress: { ...job.progress },
      result: job.result,
      error: job.error,
      elapsedMs: job.startedAt ? Date.now() - job.startedAt : 0,
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
      job.result = await this.optimize(request, job.progress);
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = e instanceof HttpError ? e.message : "L'optimisation a échoué.";
    } finally {
      job.elapsedMs = Date.now() - (job.startedAt ?? Date.now());
    }
  }

  private async optimize(request: OptimizeRequest, progress: JobProgress) {
    const { breedId, level, elements, ap, exos } = request;
    const [breeds, classSpells, items, sets] = await Promise.all([
      this.spells.breeds(),
      this.spells.spells(breedId),
      this.client.allEquipment(),
      this.client.allSets(),
    ]);
    const breed: DofusBreed | undefined = breeds.find((b) => b.id === breedId);
    if (!breed) throw new HttpError(404, "Classe inconnue.");

    // 1. Recherche locale : un bon stuff en moins d'une seconde.
    progress.phase = "search";
    const local = optimizeTurnDamage({
      level,
      elements,
      ap,
      exos,
      spells: classSpells,
      items,
      sets,
    });
    if (local.spells.length === 0) {
      throw new HttpError(
        422,
        "Cette classe n'a aucun sort de dégâts dans ces éléments à ce niveau.",
      );
    }
    progress.damage = local.score;
    await new Promise((resolve) => setImmediate(resolve));

    // 2. Exploration rapide (branch and bound, 2 s) : souvent un meilleur départ.
    const quick = optimizeTurnDamageExact({
      level,
      elements,
      ap,
      base: local.base,
      spells: local.spells,
      items,
      sets,
      initial: local.slots,
      timeLimitMs: 2_000,
    });
    progress.damage = Math.max(progress.damage, quick.damage);

    // 3. Preuve par programmation linéaire en nombres entiers (HiGHS).
    progress.phase = "proof";
    const proof = await optimizeTurnDamageMilp({
      level,
      elements,
      ap,
      base: local.base,
      spells: local.spells,
      items,
      sets,
      initial: quick.damage >= local.score ? quick.slots : local.slots,
      timeLimitMs: PROOF_TIME_LIMIT_MS,
      onProgress: (p) => {
        progress.damage = p.damage;
        progress.upper = p.upper;
        progress.cellsLeft = p.cellsLeft;
        progress.solves = p.solves;
      },
    });

    // Fiches complètes des objets retenus et combo exact (formule du jeu, arrondis compris).
    const slots: Partial<Record<SlotId, number>> = proof.slots;
    const ids = Object.values(slots).filter((id): id is number => id !== undefined);
    const chosen = await Promise.all(ids.map((id) => this.client.item(id)));
    const setIds = new Set(chosen.map((i) => i.set?.id).filter((id): id is number => !!id));
    const usedSets = sets.filter((s) => setIds.has(s.id));
    const character = computeCharacter({
      level,
      base: local.points,
      scrolls: local.scrolls,
      items: chosen,
      sets: usedSets,
      exos,
    });
    return {
      breed,
      level,
      elements,
      ap,
      exos,
      classElements: classElements(classSpells, level),
      points: local.points,
      scrolls: local.scrolls,
      slots,
      combo: turnCombo(character.totals, local.spells, ap),
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
        localDamage: local.score,
      },
    };
  }
}
