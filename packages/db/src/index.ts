import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDatabase>["db"];

/**
 * Crée une connexion à PostgreSQL. Toutes les requêtes passent par Drizzle
 * (requêtes paramétrées), ce qui protège contre les injections SQL.
 */
export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return {
    db,
    /** Vérifie que la base répond (utilisé par la route /api/health). */
    async ping(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    /** Applique les migrations en attente (idempotent). */
    migrate: (migrationsFolder: string) => migrate(db, { migrationsFolder }),
    close: () => client.end({ timeout: 5 }),
  };
}

export { schema };
export * from "./schema/index";
