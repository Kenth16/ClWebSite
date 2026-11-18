import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database, User } from "@kenpai/db";
import { HttpError } from "../lib/errors";
import { SESSION_COOKIE, SESSION_DURATION_MS, validateSession } from "../modules/auth/sessions";

declare module "fastify" {
  interface FastifyRequest {
    /** Utilisateur connecté, ou null. Renseigné pour chaque requête. */
    user: User | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    setSessionCookie: (reply: FastifyReply, token: string, expiresAt: Date) => void;
    clearSessionCookie: (reply: FastifyReply) => void;
  }
}

interface AuthPluginOptions {
  db: Database;
  cookieSecure: boolean;
}

/** Identifie l'utilisateur à partir du cookie de session. */
export const authPlugin = fp<AuthPluginOptions>(async (app, { db, cookieSecure }) => {
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure,
  };

  app.decorate("setSessionCookie", (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
  });
  app.decorate("clearSessionCookie", (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
  });

  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);

  app.addHook("onRequest", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const session = await validateSession(db, token);
    if (!session) {
      app.clearSessionCookie(reply);
      return;
    }
    request.user = session.user;
    request.sessionId = session.sessionId;
    if (session.renewedUntil) app.setSessionCookie(reply, token, session.renewedUntil);
  });
});

/** À utiliser en `preHandler` : refuse la requête si personne n'est connecté. */
export async function requireUser(request: FastifyRequest) {
  if (!request.user) throw new HttpError(401, "Vous devez être connecté.");
}

/** Raccourci typé : l'utilisateur connecté (après `requireUser`). */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw new HttpError(401, "Vous devez être connecté.");
  return request.user;
}

export { SESSION_DURATION_MS };
