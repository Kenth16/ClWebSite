import type { FastifyPluginAsync } from "fastify";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  BUILDS_PER_USER_MAX,
  dofusBuildSchema,
  type DofusBuild,
  type DofusBuildData,
  type DofusBuildSummary,
} from "@kenpai/shared";
import { dofusBuilds, type Database, type DofusBuildRow } from "@kenpai/db";
import { HttpError, parseInput } from "../../lib/errors";
import { currentUser, requireUser } from "../../plugins/auth";

const idParams = z.object({ id: z.uuid("Identifiant invalide.") });

function summary(row: DofusBuildRow): DofusBuildSummary {
  const data = row.data as DofusBuildData;
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    itemCount: Object.keys(data.slots ?? {}).length,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Stuffs Dofus enregistrés par l'utilisateur connecté (privés). */
export const dofusBuildRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.addHook("preHandler", requireUser);

  async function ownBuild(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(dofusBuilds)
      .where(and(eq(dofusBuilds.id, id), eq(dofusBuilds.userId, userId)))
      .limit(1);
    if (!row) throw new HttpError(404, "Ce stuff n'existe pas.");
    return row;
  }

  app.get("/", async (request): Promise<{ builds: DofusBuildSummary[] }> => {
    const me = currentUser(request);
    const rows = await db
      .select()
      .from(dofusBuilds)
      .where(eq(dofusBuilds.userId, me.id))
      .orderBy(desc(dofusBuilds.updatedAt));
    return { builds: rows.map(summary) };
  });

  app.get("/:id", async (request): Promise<{ build: DofusBuild }> => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    const row = await ownBuild(me.id, id);
    return { build: { ...summary(row), data: row.data as DofusBuildData } };
  });

  // Le stuff peut contenir une petite image : limite de taille plus large ici seulement.
  const withImage = { bodyLimit: 256 * 1024 };

  app.post("/", withImage, async (request, reply) => {
    const me = currentUser(request);
    const data = parseInput(dofusBuildSchema, request.body);
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(dofusBuilds)
      .where(eq(dofusBuilds.userId, me.id));
    if (total >= BUILDS_PER_USER_MAX) {
      throw new HttpError(
        409,
        `Vous avez atteint la limite de ${BUILDS_PER_USER_MAX} stuffs : supprimez-en un pour en enregistrer un nouveau.`,
      );
    }
    const [row] = await db
      .insert(dofusBuilds)
      .values({ userId: me.id, name: data.name, level: data.level, data })
      .returning();
    return reply.status(201).send({ build: summary(row!) });
  });

  app.put("/:id", withImage, async (request) => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    await ownBuild(me.id, id);
    const data = parseInput(dofusBuildSchema, request.body);
    const [row] = await db
      .update(dofusBuilds)
      .set({ name: data.name, level: data.level, data, updatedAt: new Date() })
      .where(eq(dofusBuilds.id, id))
      .returning();
    return { build: summary(row!) };
  });

  app.delete("/:id", async (request, reply) => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    await ownBuild(me.id, id);
    await db.delete(dofusBuilds).where(eq(dofusBuilds.id, id));
    return reply.status(204).send();
  });
};
