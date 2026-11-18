import path from "node:path";
import { z } from "zod";

/**
 * Variables d'environnement de l'API, validées au démarrage : une
 * configuration incorrecte arrête le serveur immédiatement avec un message clair.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  /** Dossier des migrations SQL (par défaut : celui du paquet @kenpai/db). */
  MIGRATIONS_DIR: z.string().default(path.resolve(process.cwd(), "../../packages/db/migrations")),
  /**
   * Cookie de session réservé au HTTPS. Activé par défaut en production ;
   * à désactiver uniquement pour un test local en HTTP (ex. Docker sur localhost).
   */
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export type Env = Omit<z.infer<typeof envSchema>, "COOKIE_SECURE"> & { COOKIE_SECURE: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configuration invalide :\n${details.join("\n")}`);
  }
  const env = parsed.data;
  return { ...env, COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === "production" };
}
