import type { ZodType } from "zod";

/** Erreur métier renvoyée telle quelle au client (statut + message en français). */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/**
 * Valide une entrée avec un schéma Zod. En cas d'échec, lève une erreur 400
 * listant le premier problème de chaque champ.
 */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_";
    fields[key] ??= issue.message;
  }
  const message = fields._ ?? "Certaines informations sont invalides.";
  delete fields._;
  throw new HttpError(400, message, Object.keys(fields).length > 0 ? fields : undefined);
}

/** Détecte une violation de contrainte d'unicité PostgreSQL et renvoie son nom. */
export function uniqueViolation(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    const e = current as { code?: string; constraint_name?: string; cause?: unknown };
    if (e.code === "23505") return e.constraint_name ?? "";
    current = e.cause;
  }
  return null;
}
