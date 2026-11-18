import { createDatabase } from "@kenpai/db";
import { buildApp } from "./app";
import { loadEnv } from "./env";
import { deleteExpiredSessions } from "./modules/auth/sessions";

const env = loadEnv();
const database = createDatabase(env.DATABASE_URL);

// Les migrations sont appliquées à chaque démarrage (sans effet si la base est à jour).
await database.migrate(env.MIGRATIONS_DIR);

const app = await buildApp({ env, db: database.db, pingDatabase: database.ping });

// Nettoyage périodique des sessions expirées.
const cleanup = setInterval(
  () => {
    deleteExpiredSessions(database.db)
      .then((n) => n > 0 && app.log.info(`${n} session(s) expirée(s) supprimée(s)`))
      .catch((error: unknown) => app.log.error(error));
  },
  60 * 60 * 1000,
);
cleanup.unref();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} reçu, arrêt en cours…`);
  clearInterval(cleanup);
  await app.close();
  await database.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: env.API_PORT, host: env.API_HOST });
