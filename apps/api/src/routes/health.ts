import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@kenpai/shared";

interface HealthOptions {
  pingDatabase: () => Promise<boolean>;
}

export const healthRoutes: FastifyPluginAsync<HealthOptions> = async (app, opts) => {
  app.get("/health", async (_request, reply) => {
    const databaseUp = await opts.pingDatabase();
    const body: HealthResponse = {
      status: databaseUp ? "ok" : "degraded",
      database: databaseUp ? "up" : "down",
      uptimeSeconds: Math.round(process.uptime()),
    };
    return reply.status(databaseUp ? 200 : 503).send(body);
  });
};
