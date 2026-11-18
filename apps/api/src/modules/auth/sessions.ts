import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { sessions, users, type Database, type User } from "@kenpai/db";

export const SESSION_COOKIE = "kenpai_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // prolongée s'il reste moins de 15 jours

/** Empreinte stockée en base : le jeton lui-même n'est jamais enregistré. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Database,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 512) ?? null,
    ip: meta.ip?.slice(0, 64) ?? null,
  });
  return { token, expiresAt };
}

export interface ValidatedSession {
  user: User;
  sessionId: string;
  /** Nouvelle date d'expiration si la session vient d'être prolongée. */
  renewedUntil: Date | null;
}

/** Retrouve l'utilisateur d'un jeton valide, en prolongeant la session si besoin. */
export async function validateSession(
  db: Database,
  token: string,
): Promise<ValidatedSession | null> {
  if (token.length < 20 || token.length > 100) return null;
  const sessionId = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;

  let renewedUntil: Date | null = null;
  if (row.expiresAt.getTime() - now.getTime() < RENEW_THRESHOLD_MS) {
    renewedUntil = new Date(now.getTime() + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, sessionId));
  }
  return { user: row.user, sessionId, renewedUntil };
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteExpiredSessions(db: Database): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}
