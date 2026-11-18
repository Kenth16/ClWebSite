import type { FastifyPluginAsync } from "fastify";
import { loginSchema, randomAvatar, registerSchema } from "@kenpai/shared";
import { users, type Database } from "@kenpai/db";
import { HttpError, parseInput, uniqueViolation } from "../../lib/errors";
import { requireUser } from "../../plugins/auth";
import { emailTaken, findByLogin, toSessionUser, usernameTaken } from "../users/repository";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password";
import { createSession, deleteSession } from "./sessions";

interface AuthRoutesOptions {
  db: Database;
  /** Nombre de tentatives de connexion / inscription autorisées par minute et par IP. */
  rateLimitMax: number;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app,
  { db, rateLimitMax },
) => {
  const limited = { config: { rateLimit: { max: rateLimitMax, timeWindow: "1 minute" } } };

  app.post("/register", limited, async (request, reply) => {
    const input = parseInput(registerSchema, request.body);

    const fields: Record<string, string> = {};
    if (await usernameTaken(db, input.username)) fields.username = "Ce pseudo est déjà pris.";
    if (await emailTaken(db, input.email)) fields.email = "Cette adresse e-mail est déjà utilisée.";
    if (Object.keys(fields).length > 0) throw new HttpError(409, "Compte déjà existant.", fields);

    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      [user] = await db
        .insert(users)
        .values({
          username: input.username,
          email: input.email,
          passwordHash,
          avatar: randomAvatar(),
        })
        .returning();
    } catch (error) {
      // Course entre deux inscriptions simultanées : l'index unique tranche.
      const constraint = uniqueViolation(error);
      if (constraint === null) throw error;
      throw new HttpError(
        409,
        "Compte déjà existant.",
        constraint.includes("email")
          ? { email: "Cette adresse e-mail est déjà utilisée." }
          : { username: "Ce pseudo est déjà pris." },
      );
    }
    if (!user) throw new Error("Insertion de l'utilisateur sans résultat.");

    const session = await createSession(db, user.id, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    app.setSessionCookie(reply, session.token, session.expiresAt);
    return reply.status(201).send({ user: toSessionUser(user) });
  });

  app.post("/login", limited, async (request, reply) => {
    const input = parseInput(loginSchema, request.body);
    const user = await findByLogin(db, input.identifier);
    const valid = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyAgainstDummy(input.password);
    if (!user || !valid) throw new HttpError(401, "Identifiant ou mot de passe incorrect.");

    const session = await createSession(db, user.id, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    });
    app.setSessionCookie(reply, session.token, session.expiresAt);
    return { user: toSessionUser(user) };
  });

  app.post("/logout", async (request, reply) => {
    if (request.sessionId) await deleteSession(db, request.sessionId);
    app.clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: requireUser }, async (request) => {
    return { user: toSessionUser(request.user!) };
  });
};
