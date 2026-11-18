import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { updateProfileSchema } from "@kenpai/shared";
import { users, type Database } from "@kenpai/db";
import { HttpError, parseInput, uniqueViolation } from "../../lib/errors";
import { currentUser, requireUser } from "../../plugins/auth";
import { toSessionUser, usernameTaken } from "./repository";

export const userRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  /** Modifie le profil de l'utilisateur connecté (pseudo et/ou avatar). */
  app.patch("/me", { preHandler: requireUser }, async (request) => {
    const me = currentUser(request);
    const input = parseInput(updateProfileSchema, request.body);

    if (input.username && (await usernameTaken(db, input.username, me.id))) {
      throw new HttpError(409, "Ce pseudo est déjà pris.", {
        username: "Ce pseudo est déjà pris.",
      });
    }

    try {
      const [updated] = await db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, me.id))
        .returning();
      if (!updated) throw new HttpError(404, "Utilisateur introuvable.");
      return { user: toSessionUser(updated) };
    } catch (error) {
      if (uniqueViolation(error) !== null) {
        throw new HttpError(409, "Ce pseudo est déjà pris.", {
          username: "Ce pseudo est déjà pris.",
        });
      }
      throw error;
    }
  });
};
