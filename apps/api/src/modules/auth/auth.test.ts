import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { AVATAR_KEYS } from "@kenpai/shared";
import { buildApp } from "../../app";
import { databaseAvailable, openTestDatabase, requireDatabase } from "../../test/database";
import { SESSION_COOKIE } from "./sessions";

const available = await databaseAvailable();
if (!available && requireDatabase) throw new Error("Base de test PostgreSQL indisponible.");

const env = {
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  COOKIE_SECURE: false,
} as const;
const alice = { username: "Alice", email: "alice@example.com", password: "grimoire-secret" };

function sessionCookie(res: LightMyRequestResponse): Record<string, string> {
  const c = res.cookies.find((c) => c.name === SESSION_COOKIE);
  return c ? { [SESSION_COOKIE]: c.value } : {};
}

describe.skipIf(!available)("authentification et profil", () => {
  let database: Awaited<ReturnType<typeof openTestDatabase>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    database = await openTestDatabase();
    app = await buildApp({
      env,
      db: database.db,
      pingDatabase: database.ping,
      authRateLimit: 1000,
    });
  });
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  beforeEach(async () => {
    await database.reset();
  });

  const register = (body: object = alice) =>
    app.inject({ method: "POST", url: "/api/auth/register", payload: body });

  it("inscrit un utilisateur, ouvre une session et attribue un avatar par défaut", async () => {
    const res = await register();
    expect(res.statusCode).toBe(201);
    const { user } = res.json();
    expect(user).toMatchObject({ username: "Alice", email: "alice@example.com" });
    expect(AVATAR_KEYS).toContain(user.avatar);
    expect(user).not.toHaveProperty("passwordHash");

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: sessionCookie(res),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe("Alice");
  });

  it("ne stocke ni le mot de passe ni le jeton de session en clair", async () => {
    const res = await register();
    const rows = await database.db.execute<{ password_hash: string; id: string }>(
      "select u.password_hash, s.id from users u join sessions s on s.user_id = u.id",
    );
    const row = rows[0]!;
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.id).not.toBe(sessionCookie(res)[SESSION_COOKIE]);
  });

  it("refuse un pseudo ou un e-mail déjà utilisé, sans tenir compte de la casse", async () => {
    await register();
    const res = await register({
      username: "ALICE",
      email: "ALICE@example.com",
      password: "autre-mdp-123",
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().fields).toEqual({
      username: "Ce pseudo est déjà pris.",
      email: "Cette adresse e-mail est déjà utilisée.",
    });
  });

  it("valide les données côté serveur", async () => {
    const res = await register({ username: "a", email: "invalide", password: "court" });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().fields).sort()).toEqual(["email", "password", "username"]);
  });

  it("connecte avec l'e-mail ou le pseudo", async () => {
    await register();
    for (const identifier of ["alice@example.com", "alice", " ALICE "]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { identifier, password: alice.password },
      });
      expect(res.statusCode, identifier).toBe(200);
      expect(sessionCookie(res)[SESSION_COOKIE]).toBeTruthy();
    }
  });

  it("refuse un mauvais mot de passe ou un compte inconnu avec le même message", async () => {
    await register();
    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "alice", password: "mauvais-mdp" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "personne", password: "mauvais-mdp" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it("déconnecte : la session est supprimée côté serveur", async () => {
    const cookies = sessionCookie(await register());
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", cookies });
    expect(out.statusCode).toBe(204);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", cookies });
    expect(me.statusCode).toBe(401);
  });

  it("protège les routes privées", async () => {
    expect((await app.inject({ method: "GET", url: "/api/auth/me" })).statusCode).toBe(401);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      payload: { avatar: "lune" },
    });
    expect(res.statusCode).toBe(401);
    const forged = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { [SESSION_COOKIE]: "jeton-invente-de-toutes-pieces-1234567890" },
    });
    expect(forged.statusCode).toBe(401);
  });

  it("modifie le pseudo et l'avatar", async () => {
    const cookies = sessionCookie(await register());
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      cookies,
      payload: { username: "Alice_la_Mage", avatar: "lune" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ username: "Alice_la_Mage", avatar: "lune" });
  });

  it("autorise à changer la casse de son propre pseudo, mais pas à prendre celui d'un autre", async () => {
    await register({ username: "Bob", email: "bob@example.com", password: "mot-de-passe-bob" });
    const cookies = sessionCookie(await register());
    const own = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      cookies,
      payload: { username: "ALICE" },
    });
    expect(own.statusCode).toBe(200);
    const taken = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      cookies,
      payload: { username: "bob" },
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().fields.username).toBe("Ce pseudo est déjà pris.");
  });

  it("refuse un avatar inconnu", async () => {
    const cookies = sessionCookie(await register());
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      cookies,
      payload: { avatar: "dragon" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuse les requêtes provenant d'un autre site (CSRF)", async () => {
    const cookies = sessionCookie(await register());
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      cookies,
      headers: { origin: "https://site-malveillant.example" },
      payload: { avatar: "lune" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("limite le nombre de tentatives de connexion", async () => {
    const limited = await buildApp({
      env,
      db: database.db,
      pingDatabase: database.ping,
      authRateLimit: 3,
    });
    const attempt = () =>
      limited.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { identifier: "x", password: "y" },
      });
    for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/Trop de tentatives/);
    await limited.close();
  });
});
