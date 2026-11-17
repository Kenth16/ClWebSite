import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import type { Env } from "./env";
import { healthRoutes } from "./routes/health";

export interface AppDeps {
  env: Pick<Env, "NODE_ENV" | "WEB_ORIGIN">;
  /** Vérifie la disponibilité de la base (injecté pour faciliter les tests). */
  pingDatabase: () => Promise<boolean>;
}

/**
 * Construit l'application Fastify. Toutes les routes sont préfixées par /api,
 * ce qui permet de servir le site et l'API sous la même origine.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      deps.env.NODE_ENV === "test"
        ? false
        : deps.env.NODE_ENV === "development"
          ? { level: "info" }
          : { level: "info" },
    trustProxy: true,
  });

  await app.register(helmet);
  await app.register(cors, { origin: deps.env.WEB_ORIGIN, credentials: true });

  // Gestion des erreurs homogène : jamais de détails internes renvoyés au client.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) request.log.error(error);
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Erreur interne du serveur." : error.message,
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: "Ressource introuvable." });
  });

  await app.register(healthRoutes, { prefix: "/api", pingDatabase: deps.pingDatabase });

  return app;
}
