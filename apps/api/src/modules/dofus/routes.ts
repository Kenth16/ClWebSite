import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  LEVEL_MAX,
  SLOT_SUBTYPES,
  SLOT_TYPES,
  isAllowedItem,
  optimizeRequestSchema,
  parseStatFilters,
  type ItemStatFilter,
  type SlotFamily,
} from "@kenpai/shared";
import { HttpError, parseInput } from "../../lib/errors";
import type { DofusClient } from "./client";
import { OptimizeJobs } from "./optimize-jobs";
import { DofusDbClient } from "./spells";

const searchQuery = z.object({
  family: z.enum(Object.keys(SLOT_TYPES) as [SlotFamily, ...SlotFamily[]], "Emplacement inconnu."),
  q: z.string().trim().max(60).optional().default(""),
  maxLevel: z.coerce.number().int().min(1).max(LEVEL_MAX).optional().default(LEVEL_MAX),
  subtype: z.string().max(30).optional(),
  stats: z
    .string()
    .max(200)
    .optional()
    .default("")
    .transform((raw, ctx): ItemStatFilter[] => {
      const filters = parseStatFilters(raw);
      if (filters === null) {
        ctx.addIssue({ code: "custom", message: "Filtre de caractéristiques invalide." });
        return z.NEVER;
      }
      return filters;
    }),
});
const idParams = z.object({ id: z.coerce.number().int().positive("Identifiant invalide.") });

/** Données Dofus (objets, panoplies), relayées depuis l'API DofusDude. */
export const dofusRoutes: FastifyPluginAsync<{
  client: DofusClient;
  spells?: DofusDbClient;
}> = async (app, { client, spells = new DofusDbClient() }) => {
  const limited = { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } };

  app.get("/items", limited, async (request) => {
    const { family, q, maxLevel, subtype, stats } = parseInput(searchQuery, request.query);
    if (subtype && !SLOT_SUBTYPES[family]?.some((s) => s.id === subtype)) {
      throw new HttpError(400, "Catégorie inconnue.");
    }
    return { items: await client.searchItems(family, q, maxLevel, { subtype, stats }) };
  });

  /** Tous les Dofus (pas les trophées) : liste « Dofus possédés » de l'optimiseur. */
  app.get("/dofus", limited, async () => {
    const all = await client.allEquipment();
    const dofus = all
      .filter((i) => i.type === "Dofus" && isAllowedItem(i))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "fr"));
    return { items: dofus };
  });

  app.get("/items/:id", limited, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return { item: await client.item(id) };
  });

  /** Monstres du jeu (DofusDB) : cible des sorts dans l'optimiseur. */
  const monsterQuery = z.object({
    q: z.string().trim().min(2, "Tapez au moins 2 lettres.").max(40),
  });
  app.get("/monsters", limited, async (request) => {
    const { q } = parseInput(monsterQuery, request.query);
    return { monsters: await spells.monsters(q) };
  });

  /** Classes jouables (DofusDB). */
  app.get("/classes", limited, async () => ({ classes: await spells.breeds() }));

  /** Sorts d'une classe avec leurs dégâts par grade (DofusDB). */
  app.get("/classes/:id/spells", limited, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return { spells: await spells.spells(id) };
  });

  const setQuery = z.object({
    q: z.string().trim().max(60).optional().default(""),
    maxLevel: z.coerce.number().int().min(1).max(LEVEL_MAX).optional().default(LEVEL_MAX),
  });

  /** Recherche de panoplies (DofusDude). */
  app.get("/sets", limited, async (request) => {
    const { q, maxLevel } = parseInput(setQuery, request.query);
    return { sets: await client.searchSets(q, maxLevel) };
  });

  /** Une panoplie avec ses objets, pour les équiper d'un coup. */
  app.get("/sets/:id/items", limited, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return client.setWithItems(id);
  });

  /**
   * Optimiseur : le stuff qui fait PROUVABLEMENT le plus de dégâts sur un tour
   * (meilleur combo de sorts des éléments choisis, avec les PA visés). Le calcul
   * tourne en tâche de fond : on le lance, puis on suit sa progression.
   */
  const jobs = new OptimizeJobs(client, spells);
  app.post(
    "/optimize",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parseInput(optimizeRequestSchema, request.body);
      return reply.status(202).send({ job: jobs.start(body) });
    },
  );
  const jobParams = z.object({ id: z.uuid("Identifiant invalide.") });
  app.get("/optimize/:id", async (request) => {
    const { id } = parseInput(jobParams, request.params);
    const since = Number((request.query as { since?: string }).since ?? 0);
    const job = jobs.get(id, Number.isFinite(since) ? since : 0);
    if (!job) throw new HttpError(404, "Ce calcul n'existe plus.");
    return { job };
  });

  app.get("/sets/:id", limited, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return { set: await client.set(id) };
  });
};
