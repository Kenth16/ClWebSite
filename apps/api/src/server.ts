import { createDatabase } from "@kenpai/db";
import { buildApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);
const app = await buildApp({ env, pingDatabase: database.ping });

const shutdown = async (signal: string) => {
  app.log.info(`${signal} reçu, arrêt en cours…`);
  await app.close();
  await database.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: env.API_PORT, host: env.API_HOST });
