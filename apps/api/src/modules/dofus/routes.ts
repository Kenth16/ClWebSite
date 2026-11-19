import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { LEVEL_MAX, SLOT_TYPES, type SlotFamily } from "@kenpai/shared";
import { parseInput } from "../../lib/errors";
import type { DofusClient } from "./client";
import { DofusDbClient } from "./spells";

const searchQuery = z.object({
  family: z.enum(Object.keys(SLOT_TYPES) as [SlotFamily, ...SlotFamily[]], "Emplacement inconnu."),
  q: z.string().trim().max(60).optional().default(""),
  maxLevel: z.coerce.number().int().min(1).max(LEVEL_MAX).optional().default(LEVEL_MAX),
});
const idParams = z.object({ id: z.coerce.number().int().positive("Identifiant invalide.") });

/** Données Dofus (objets, panoplies), relayées depuis l'API DofusDude. */
export const dofusRoutes: FastifyPluginAsync<{
  client: DofusClient;
  spells?: DofusDbClient;
}> = async (app, { client, spells = new DofusDbClient() }) => {
  const limited = { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } };

  app.get("/items", limited, async (request) => {
    const { family, q, maxLevel } = parseInput(searchQuery, request.query);
    return { items: await client.searchItems(family, q, maxLevel) };
  });

  app.get("/items/:id", limited, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return { item: await client.item(id) };
  });

  /** Classes jouables (DofusDB). */
  app.get("/classes", limited, async () => ({ classes: await spells.breeds() }));

  /** Sorts d'une classe avec leurs dégâts par grade (DofusDB). */
  app.get("/classes/:id/spells", limited, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return { spells: await spells.spells(id) };
  });

  app.get("/sets/:id", limited, async (request) => {
    const { id } = parseInput(idParams, request.params);
    return { set: await client.set(id) };
  });
};
