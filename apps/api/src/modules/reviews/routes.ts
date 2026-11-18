import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  REVIEW_CRITERIA,
  gameInputSchema,
  reviewInputSchema,
  totalScore,
  type CatalogGame,
  type CriterionKey,
  type GameDetail,
  type GameInfo,
  type GameReview,
  type GameSummary,
  type ReviewScores,
} from "@kenpai/shared";
import { games, reviews, users, type Database, type Game } from "@kenpai/db";
import { HttpError, parseInput } from "../../lib/errors";
import { currentUser, requireUser } from "../../plugins/auth";
import { toPublicUser } from "../friends/repository";
import type { RawgClient } from "../rawg/client";

const idParams = z.object({ id: z.uuid("Identifiant invalide.") });
const listQuery = z.object({
  reviewed: z
    .enum(["0", "1"])
    .optional()
    .transform((v) => v === "1"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const catalogQuery = z.object({
  q: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).max(50).optional().default(1),
});

function gameInfo(game: Game): GameInfo {
  return {
    title: game.title,
    cover: game.coverUrl,
    released: game.released,
    platforms: game.platforms,
    genres: game.genres,
  };
}

/** Ramène les notes stockées au format attendu (critères manquants à 0). */
function readScores(raw: Record<string, number>): ReviewScores {
  return Object.fromEntries(
    REVIEW_CRITERIA.map((c) => [c.key, Number(raw[c.key] ?? 0)]),
  ) as ReviewScores;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const reviewRoutes: FastifyPluginAsync<{ db: Database; rawg: RawgClient }> = async (
  app,
  { db, rawg },
) => {
  async function findGame(id: string) {
    const [game] = await db.select().from(games).where(eq(games.id, id)).limit(1);
    if (!game) throw new HttpError(404, "Ce jeu n'existe pas.");
    return game;
  }

  /** Statistiques d'avis des jeux donnés (ou de tous). */
  function gameStats(meId: string | null) {
    const lastActivity = sql<Date>`coalesce(max(${reviews.updatedAt}), ${games.createdAt})`;
    const reviewCount = sql<number>`count(${reviews.id})::int`;
    const query = db
      .select({
        game: games,
        reviewCount,
        averageTenths: sql<number | null>`avg(${reviews.totalTenths})::float`,
        lastActivityAt: lastActivity,
        reviewedByMe: meId
          ? sql<boolean>`coalesce(bool_or(${reviews.userId} = ${meId}), false)`
          : sql<boolean>`false`,
      })
      .from(games)
      .leftJoin(reviews, eq(reviews.gameId, games.id))
      .groupBy(games.id)
      .$dynamic();
    return { query, lastActivity, reviewCount };
  }

  const average = (tenths: number | null) => (tenths === null ? null : round1(tenths / 10));

  /**
   * Jeux évalués, les plus récemment notés d'abord.
   * `reviewed=1` : uniquement les jeux ayant au moins un avis ; `limit` : nombre maximal.
   */
  app.get("/", async (request): Promise<{ games: GameSummary[] }> => {
    const { reviewed, limit } = parseInput(listQuery, request.query);
    const { query, lastActivity, reviewCount } = gameStats(request.user?.id ?? null);
    if (reviewed) query.having(sql`${reviewCount} > 0`);
    query.orderBy(desc(lastActivity), games.title);
    if (limit) query.limit(limit);
    const rows = await query;

    // Dernier avis de chaque jeu (pseudo, note, date).
    const ids = rows.map((r) => r.game.id);
    const last =
      ids.length === 0
        ? []
        : await db
            .selectDistinctOn([reviews.gameId], {
              gameId: reviews.gameId,
              totalTenths: reviews.totalTenths,
              updatedAt: reviews.updatedAt,
              user: { id: users.id, username: users.username, avatar: users.avatar },
            })
            .from(reviews)
            .innerJoin(users, eq(users.id, reviews.userId))
            .where(inArray(reviews.gameId, ids))
            .orderBy(reviews.gameId, desc(reviews.updatedAt));
    const lastByGame = new Map(last.map((l) => [l.gameId, l]));

    return {
      games: rows.map((r) => {
        const l = lastByGame.get(r.game.id);
        return {
          id: r.game.id,
          ...gameInfo(r.game),
          reviewCount: r.reviewCount,
          average: average(r.averageTenths),
          lastActivityAt: new Date(r.lastActivityAt).toISOString(),
          reviewedByMe: r.reviewedByMe,
          lastReview: l
            ? {
                user: toPublicUser(l.user),
                total: l.totalTenths / 10,
                at: l.updatedAt.toISOString(),
              }
            : null,
        };
      }),
    };
  });

  /** Catalogue RAWG : recherche par titre (ou jeux populaires), avec les notes Kenpai existantes. */
  app.get(
    "/catalog",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request): Promise<{ games: CatalogGame[]; hasMore: boolean }> => {
      const { q, page } = parseInput(catalogQuery, request.query);
      const result = await rawg.search(q, page);
      const rawgIds = result.games.map((g) => g.rawgId);
      const known =
        rawgIds.length === 0
          ? []
          : await gameStats(null).query.where(inArray(games.rawgId, rawgIds));
      const byRawg = new Map(known.map((k) => [k.game.rawgId, k]));
      return {
        hasMore: result.hasMore,
        games: result.games.map((g) => {
          const k = byRawg.get(g.rawgId);
          return {
            ...g,
            gameId: k?.game.id ?? null,
            reviewCount: k?.reviewCount ?? 0,
            average: k ? average(k.averageTenths) : null,
          };
        }),
      };
    },
  );

  /** Ajoute un jeu du catalogue (ou renvoie celui déjà présent). */
  app.post(
    "/",
    { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const me = currentUser(request);
      const { rawgId } = parseInput(gameInputSchema, request.body);
      const existing = async () => {
        const [game] = await db
          .select({ id: games.id, title: games.title })
          .from(games)
          .where(eq(games.rawgId, rawgId))
          .limit(1);
        return game;
      };

      const found = await existing();
      if (found) return reply.status(200).send({ game: found, created: false });
      const info = await rawg.game(rawgId);
      const [game] = await db
        .insert(games)
        .values({
          rawgId,
          title: info.title,
          coverUrl: info.cover,
          released: info.released,
          platforms: info.platforms,
          genres: info.genres,
          createdBy: me.id,
        })
        .onConflictDoNothing({ target: games.rawgId })
        .returning({ id: games.id, title: games.title });
      if (game) return reply.status(201).send({ game, created: true });
      // Ajouté au même moment par quelqu'un d'autre.
      return reply.status(200).send({ game: await existing(), created: false });
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
      game: { id: game.id, ...gameInfo(game), createdAt: game.createdAt.toISOString() },
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
