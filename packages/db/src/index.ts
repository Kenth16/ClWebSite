import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDatabase>["db"];

/**
 * Crée une connexion à PostgreSQL. Toutes les requêtes passent par Drizzle
 * (requêtes paramétrées), ce qui protège contre les injections SQL.
 */
export function createDatabase(url: string) {
  const client = postgres(url, { max: 10, prepare: true });
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
    close: () => client.end({ timeout: 5 }),
  };
}

export { schema };
