import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createDatabase } from "@kenpai/db";

/**
 * Base de données dédiée aux tests d'intégration (jamais la base de développement).
 * Elle est créée si besoin, migrée, puis vidée entre chaque test.
 */
const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://kenpai:kenpai@localhost:5432/kenpai_test";
const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/db/migrations",
);

export async function databaseAvailable(): Promise<boolean> {
  const url = new URL(TEST_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = postgres(url.toString(), { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (rows.length === 0) await admin.unsafe(`create database "${dbName.replace(/"/g, "")}"`);
    return true;
  } catch {
    return false;
  } finally {
    await admin.end({ timeout: 1 });
  }
}

export async function openTestDatabase() {
  const database = createDatabase(TEST_URL, { max: 4 });
  await database.migrate(migrationsFolder);
  return {
    ...database,
    reset: () =>
      database.db.execute(
        "truncate table reviews, games, friendships, sessions, users restart identity cascade",
      ),
  };
}

/** Les tests d'intégration sont obligatoires en CI, facultatifs en local sans base. */
export const requireDatabase = process.env.CI === "true" || process.env.REQUIRE_DB_TESTS === "1";
