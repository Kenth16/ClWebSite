import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import highsLoader from "highs";

/** Ce que l'optimiseur lit d'une solution HiGHS. */
export interface SolveResult {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, { Primal: number; Dual?: number }>;
}

export interface Solver {
  /** Nombre de programmes que le solveur peut résoudre en même temps. */
  size: number;
  solve(lp: string, options: Record<string, unknown>): Promise<SolveResult>;
  close?(): Promise<void>;
}

/** Solveur dans le fil courant (tests, ou machine à un seul cœur). */
export async function inProcessSolver(): Promise<Solver> {
  const highs = await highsLoader();
  return {
    size: 1,
    async solve(lp, options) {
      const r = highs.solve(lp, options as never);
      return { Status: r.Status, ObjectiveValue: r.ObjectiveValue, Columns: r.Columns as never };
    },
  };
}

/** Nombre de fils par défaut : les cœurs disponibles, moins deux pour le reste du serveur. */
export const defaultWorkers = () => Math.max(1, Math.min(12, availableParallelism() - 2));

let pool: Solver | null = null;

/**
 * Pool de fils HiGHS, partagé par tous les calculs : chaque fil résout un
 * programme à la fois ; les demandes attendent qu'un fil se libère.
 */
export function workerSolver(size = defaultWorkers()): Solver {
  if (pool && pool.size === size) return pool;
  // Sources TypeScript (développement) ou bundle compilé (dist/highs-worker.js).
  const file = import.meta.url.endsWith(".ts") ? "./highs-worker.ts" : "./highs-worker.js";
  const workers = Array.from({ length: size }, () => {
    return new Worker(new URL(file, import.meta.url));
  });
  const idle = [...workers];
  const waiting: (() => void)[] = [];
  const pending = new Map<
    number,
    { resolve: (r: SolveResult) => void; reject: (e: Error) => void; worker: Worker }
  >();
  let nextId = 0;
  for (const worker of workers) {
    worker.on("message", (m: { id: number; result?: SolveResult; error?: string }) => {
      const task = pending.get(m.id);
      if (!task) return;
      pending.delete(m.id);
      idle.push(task.worker);
      waiting.shift()?.();
      if (m.error !== undefined) task.reject(new Error(m.error));
      else task.resolve(m.result!);
    });
  }
  pool = {
    size,
    async close() {
      await Promise.all(workers.map((w) => w.terminate()));
      pool = null;
    },
    async solve(lp, options) {
      while (idle.length === 0) await new Promise<void>((resolve) => waiting.push(resolve));
      const worker = idle.pop()!;
      const id = nextId++;
      return new Promise<SolveResult>((resolve, reject) => {
        pending.set(id, { resolve, reject, worker });
        worker.postMessage({ id, lp, options });
      });
    },
  };
  return pool;
}
