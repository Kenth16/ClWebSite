import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { ApiErrorBody } from "@kenpai/shared";
import type { Database } from "@kenpai/db";
import type { Env } from "./env";
import { HttpError } from "./lib/errors";
import { authPlugin } from "./plugins/auth";
import { originCheckPlugin } from "./plugins/origin-check";
import { authRoutes } from "./modules/auth/routes";
import { userRoutes } from "./modules/users/routes";
import { friendRoutes } from "./modules/friends/routes";
import { reviewRoutes } from "./modules/reviews/routes";
import { DofusClient } from "./modules/dofus/client";
import { RawgClient } from "./modules/rawg/client";
import { dofusRoutes } from "./modules/dofus/routes";
import { dofusBuildRoutes } from "./modules/dofus/builds";
import { healthRoutes } from "./routes/health";

export interface AppDeps {
  env: Pick<Env, "NODE_ENV" | "WEB_ORIGIN" | "COOKIE_SECURE"> & { RAWG_API_KEY?: string };
  db: Database;
  /** Vérifie la disponibilité de la base (injecté pour faciliter les tests). */
  pingDatabase: () => Promise<boolean>;
  /** Tentatives de connexion / inscription par minute et par IP (10 par défaut). */
  authRateLimit?: number;
  /** Accès aux données Dofus (remplaçable dans les tests). */
  dofus?: DofusClient;
  /** Catalogue de jeux RAWG (remplaçable dans les tests). */
  rawg?: RawgClient;
}

/**
 * Construit l'application Fastify. Toutes les routes sont préfixées par /api,
 * ce qui permet de servir le site et l'API sous la même origine.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.env.NODE_ENV === "test" ? false : { level: "info" },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet);
  await app.register(cors, { origin: deps.env.WEB_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new HttpError(
        429,
        `Trop de tentatives. Réessayez dans ${Math.ceil(context.ttl / 1000)} secondes.`,
      ),
  });

  // Gestion des erreurs homogène : jamais de détails internes renvoyés au client.
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      const body: ApiErrorBody = { error: error.message, fields: error.fields };
      return reply.status(error.statusCode).send(body);
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) request.log.error(error);
    const body: ApiErrorBody = {
      error: statusCode >= 500 ? "Erreur interne du serveur." : "Requête invalide.",
    };
    return reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: "Ressource introuvable." } satisfies ApiErrorBody);
  });

  await app.register(originCheckPlugin, { webOrigin: deps.env.WEB_ORIGIN });
  await app.register(authPlugin, { db: deps.db, cookieSecure: deps.env.COOKIE_SECURE });

  await app.register(healthRoutes, { prefix: "/api", pingDatabase: deps.pingDatabase });
  await app.register(authRoutes, {
    prefix: "/api/auth",
    db: deps.db,
    rateLimitMax: deps.authRateLimit ?? 10,
  });
  await app.register(userRoutes, { prefix: "/api/users", db: deps.db });
  await app.register(friendRoutes, { prefix: "/api/friends", db: deps.db });
  await app.register(reviewRoutes, {
    prefix: "/api/games",
    db: deps.db,
    rawg: deps.rawg ?? new RawgClient({ apiKey: deps.env.RAWG_API_KEY }),
  });
  await app.register(dofusBuildRoutes, { prefix: "/api/dofus/builds", db: deps.db });
  await app.register(dofusRoutes, {
    prefix: "/api/dofus",
    client: deps.dofus ?? new DofusClient(),
  });

  return app;
}
