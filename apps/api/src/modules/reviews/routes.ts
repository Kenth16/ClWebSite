import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  REVIEW_CRITERIA,
  gameInputSchema,
  reviewInputSchema,
  totalScore,
  type CriterionKey,
  type GameDetail,
  type GameReview,
  type GameSummary,
  type ReviewScores,
} from "@kenpai/shared";
import { games, reviews, users, type Database } from "@kenpai/db";
import { HttpError, parseInput, uniqueViolation } from "../../lib/errors";
import { currentUser, requireUser } from "../../plugins/auth";
import { toPublicUser } from "../friends/repository";

const idParams = z.object({ id: z.uuid("Identifiant invalide.") });

/** Ramène les notes stockées au format attendu (critères manquants à 0). */
function readScores(raw: Record<string, number>): ReviewScores {
  return Object.fromEntries(
    REVIEW_CRITERIA.map((c) => [c.key, Number(raw[c.key] ?? 0)]),
  ) as ReviewScores;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const reviewRoutes: FastifyPluginAsync<{ db: Database }> = async (app, { db }) => {
  async function findGame(id: string) {
    const [game] = await db.select().from(games).where(eq(games.id, id)).limit(1);
    if (!game) throw new HttpError(404, "Ce jeu n'existe pas.");
    return game;
  }

  /** Liste des jeux avec leur note moyenne, les plus récemment évalués d'abord. */
  app.get("/", async (request): Promise<{ games: GameSummary[] }> => {
    const meId = request.user?.id ?? null;
    const lastActivity = sql<Date>`coalesce(max(${reviews.updatedAt}), ${games.createdAt})`;
    const rows = await db
      .select({
        id: games.id,
        title: games.title,
        reviewCount: sql<number>`count(${reviews.id})::int`,
        averageTenths: sql<number | null>`avg(${reviews.totalTenths})::float`,
        lastActivityAt: lastActivity,
        reviewedByMe: meId
          ? sql<boolean>`coalesce(bool_or(${reviews.userId} = ${meId}), false)`
          : sql<boolean>`false`,
      })
      .from(games)
      .leftJoin(reviews, eq(reviews.gameId, games.id))
      .groupBy(games.id)
      .orderBy(desc(lastActivity), games.title);

    return {
      games: rows.map((r) => ({
        id: r.id,
        title: r.title,
        reviewCount: r.reviewCount,
        average: r.averageTenths === null ? null : round1(r.averageTenths / 10),
        lastActivityAt: new Date(r.lastActivityAt).toISOString(),
        reviewedByMe: r.reviewedByMe,
      })),
    };
  });

  /** Ajoute un jeu, ou renvoie celui qui porte déjà ce titre. */
  app.post(
    "/",
    { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const me = currentUser(request);
      const { title } = parseInput(gameInputSchema, request.body);
      const existing = async () => {
        const [game] = await db
          .select({ id: games.id, title: games.title })
          .from(games)
          .where(eq(sql`lower(${games.title})`, title.toLowerCase()))
          .limit(1);
        return game;
      };

      const found = await existing();
      if (found) return reply.status(200).send({ game: found, created: false });
      try {
        const [game] = await db
          .insert(games)
          .values({ title, createdBy: me.id })
          .returning({ id: games.id, title: games.title });
        return reply.status(201).send({ game, created: true });
      } catch (error) {
        if (uniqueViolation(error) === null) throw error;
        return reply.status(200).send({ game: await existing(), created: false });
      }
    },
  );

  /** Détail d'un jeu : moyennes par critère et tous les avis. */
  app.get("/:id", async (request): Promise<GameDetail> => {
    const { id } = parseInput(idParams, request.params);
    const game = await findGame(id);
    const rows = await db
      .select({
        review: reviews,
        user: { id: users.id, username: users.username, avatar: users.avatar },
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(eq(reviews.gameId, id))
      .orderBy(desc(reviews.updatedAt));

    const list: GameReview[] = rows.map(({ review, user }) => ({
      id: review.id,
      user: toPublicUser(user),
      scores: readScores(review.scores),
      total: review.totalTenths / 10,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    }));

    let criteriaAverages: GameDetail["criteriaAverages"] = null;
    if (list.length > 0) {
      criteriaAverages = Object.fromEntries(
        REVIEW_CRITERIA.map((c) => [
          c.key,
          round1(list.reduce((s, r) => s + r.scores[c.key], 0) / list.length),
        ]),
      ) as Record<CriterionKey, number>;
    }

    return {
      game: { id: game.id, title: game.title, createdAt: game.createdAt.toISOString() },
      reviewCount: list.length,
      average: list.length > 0 ? round1(list.reduce((s, r) => s + r.total, 0) / list.length) : null,
      criteriaAverages,
      reviews: list,
      myReview: request.user ? (list.find((r) => r.user.id === request.user!.id) ?? null) : null,
    };
  });

  /** Enregistre ou met à jour l'évaluation de l'utilisateur connecté. */
  app.put("/:id/review", { preHandler: requireUser }, async (request) => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    await findGame(id);
    const input = parseInput(reviewInputSchema, request.body);
    const totalTenths = Math.round(totalScore(input.scores) * 10);
    const now = new Date();
    await db
      .insert(reviews)
      .values({
        gameId: id,
        userId: me.id,
        scores: input.scores,
        totalTenths,
        comment: input.comment,
      })
      .onConflictDoUpdate({
        target: [reviews.gameId, reviews.userId],
        set: { scores: input.scores, totalTenths, comment: input.comment, updatedAt: now },
      });
    return { total: totalTenths / 10 };
  });

  /** Supprime l'évaluation de l'utilisateur connecté. */
  app.delete("/:id/review", { preHandler: requireUser }, async (request, reply) => {
    const me = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    const deleted = await db
      .delete(reviews)
      .where(and(eq(reviews.gameId, id), eq(reviews.userId, me.id)))
      .returning({ id: reviews.id });
    if (deleted.length === 0) throw new HttpError(404, "Vous n'avez pas encore noté ce jeu.");
    return reply.status(204).send();
  });
};
