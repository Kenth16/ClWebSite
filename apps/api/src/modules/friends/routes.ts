import type { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { friendRequestSchema } from "@kenpai/shared";
import { friendships, type Database } from "@kenpai/db";
import { HttpError, parseInput, uniqueViolation } from "../../lib/errors";
import { currentUser, requireUser } from "../../plugins/auth";
import { findByLogin } from "../users/repository";
import { findBetween, findById, overview } from "./repository";

const idParams = z.object({ id: z.uuid("Identifiant invalide.") });

export const friendRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  app.addHook("preHandler", requireUser);

  /** Récupère une demande en attente adressée à l'utilisateur connecté. */
  async function incomingRequest(meId: string, id: string) {
    const request = await findById(db, id);
    if (!request || request.status !== "pending" || request.addresseeId !== meId) {
      throw new HttpError(404, "Cette demande d'ami n'existe plus.");
    }
    return request;
  }

  /** Amis, demandes reçues et envoyées. */
  app.get("/", async (request) => overview(db, currentUser(request).id));

  /** Envoie une demande d'ami par pseudo. */
  app.post(
    "/requests",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const me = currentUser(request);
      const { username } = parseInput(friendRequestSchema, request.body);
      const target = username.includes("@") ? null : await findByLogin(db, username);
      if (!target) {
        throw new HttpError(404, "Aucun membre ne porte ce pseudo.", {
          username: "Aucun membre ne porte ce pseudo.",
        });
      }
      if (target.id === me.id) {
        throw new HttpError(400, "Vous ne pouvez pas vous ajouter vous-même.", {
          username: "Vous ne pouvez pas vous ajouter vous-même.",
        });
      }

      const existing = await findBetween(db, me.id, target.id);
      if (existing?.status === "accepted") {
        throw new HttpError(409, `${target.username} fait déjà partie de vos amis.`, {
          username: `${target.username} fait déjà partie de vos amis.`,
        });
      }
      if (existing && existing.requesterId === me.id) {
        throw new HttpError(409, `Vous avez déjà invité ${target.username}.`, {
          username: `Vous avez déjà invité ${target.username}.`,
        });
      }
      if (existing) {
        // L'autre personne nous avait déjà invités : on accepte directement.
        await db
          .update(friendships)
          .set({ status: "accepted", respondedAt: new Date() })
          .where(eq(friendships.id, existing.id));
        return reply.status(200).send({ status: "accepted" });
      }

      try {
        await db
          .insert(friendships)
          .values({ requesterId: me.id, addresseeId: target.id, status: "pending" });
      } catch (error) {
        if (uniqueViolation(error) === null) throw error;
        throw new HttpError(409, "Une demande existe déjà entre vous.");
      }
      return reply.status(201).send({ status: "pending" });
    },
  );

  /** Accepte une demande reçue. */
  app.post("/requests/:id/accept", async (request) => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    await incomingRequest(me.id, id);
    await db
      .update(friendships)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(friendships.id, id));
    return { status: "accepted" };
  });

  /** Refuse une demande reçue (l'expéditeur pourra en renvoyer une plus tard). */
  app.post("/requests/:id/decline", async (request, reply) => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    await incomingRequest(me.id, id);
    await db.delete(friendships).where(eq(friendships.id, id));
    return reply.status(204).send();
  });

  /** Annule une demande envoyée. */
  app.delete("/requests/:id", async (request, reply) => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    const deleted = await db
      .delete(friendships)
      .where(
        and(
          eq(friendships.id, id),
          eq(friendships.requesterId, me.id),
          eq(friendships.status, "pending"),
        ),
      )
      .returning({ id: friendships.id });
    if (deleted.length === 0) throw new HttpError(404, "Cette demande d'ami n'existe plus.");
    return reply.status(204).send();
  });

  /** Retire un ami (pour les deux personnes). */
  app.delete("/:id", async (request, reply) => {
    const me = currentUser(request);
    const { id: friendId } = parseInput(idParams, request.params);
    const existing = await findBetween(db, me.id, friendId);
    if (!existing || existing.status !== "accepted") {
      throw new HttpError(404, "Cette personne ne fait pas partie de vos amis.");
    }
    await db.delete(friendships).where(eq(friendships.id, existing.id));
    return reply.status(204).send();
  });
};
