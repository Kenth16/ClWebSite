/**
 * Fil de calcul HiGHS : reçoit des programmes (format LP), renvoie leurs
 * solutions. Plusieurs fils tournent en parallèle pour l'optimiseur.
 */
import { parentPort } from "node:worker_threads";
import highsLoader from "highs";

type Highs = Awaited<ReturnType<typeof highsLoader>>;
let highs: Highs = await highsLoader();

parentPort!.on(
  "message",
  async (message: { id: number; lp: string; options: Record<string, unknown> }) => {
    try {
      const r = highs.solve(message.lp, message.options as never);
      parentPort!.postMessage({
        id: message.id,
        result: { Status: r.Status, ObjectiveValue: r.ObjectiveValue, Columns: r.Columns },
      });
    } catch (e) {
      parentPort!.postMessage({ id: message.id, error: String(e) });
      // Après une erreur, l'instance WebAssembly peut être abîmée : on la recrée.
      highs = await highsLoader();
    }
  },
);
