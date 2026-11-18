import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { FriendsOverview } from "@kenpai/shared";
import { buildApp } from "../../app";
import { databaseAvailable, openTestDatabase, requireDatabase } from "../../test/database";
import { SESSION_COOKIE } from "../auth/sessions";

const available = await databaseAvailable();
if (!available && requireDatabase) throw new Error("Base de test PostgreSQL indisponible.");

const env = {
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  COOKIE_SECURE: false,
} as const;

type Cookies = Record<string, string>;

describe.skipIf(!available)("amis et présence", () => {
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

  async function register(username: string): Promise<Cookies> {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        username,
        email: `${username.toLowerCase()}@example.com`,
        password: "mot-de-passe",
      },
    });
    expect(res.statusCode).toBe(201);
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
    return { [SESSION_COOKIE]: cookie.value };
  }

  const list = async (cookies: Cookies) =>
    (await app.inject({ method: "GET", url: "/api/friends", cookies })).json<FriendsOverview>();

  const invite = (cookies: Cookies, username: string) =>
    app.inject({ method: "POST", url: "/api/friends/requests", cookies, payload: { username } });

  it("envoie une demande, visible des deux côtés, puis l'accepte", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");

    expect((await invite(alice, "bob")).statusCode).toBe(201);
    const aliceView = await list(alice);
    expect(aliceView.outgoing.map((r) => r.user.username)).toEqual(["Bob"]);
    const bobView = await list(bob);
    expect(bobView.incoming).toHaveLength(1);
    expect(bobView.incoming[0]!.user).not.toHaveProperty("email");

    const accept = await app.inject({
      method: "POST",
      url: `/api/friends/requests/${bobView.incoming[0]!.id}/accept`,
      cookies: bob,
    });
    expect(accept.statusCode).toBe(200);

    expect((await list(alice)).friends.map((f) => f.username)).toEqual(["Bob"]);
    const bobAfter = await list(bob);
    expect(bobAfter.friends.map((f) => f.username)).toEqual(["Alice"]);
    expect(bobAfter.incoming).toEqual([]);
  });

  it("refuse une demande : elle disparaît et peut être renvoyée", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    await invite(alice, "Bob");
    const [request] = (await list(bob)).incoming;
    const decline = await app.inject({
      method: "POST",
      url: `/api/friends/requests/${request!.id}/decline`,
      cookies: bob,
    });
    expect(decline.statusCode).toBe(204);
    expect(await list(alice)).toEqual({ friends: [], incoming: [], outgoing: [] });
    expect((await invite(alice, "Bob")).statusCode).toBe(201);
  });

  it("seul le destinataire peut accepter ou refuser", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    const carol = await register("Carol");
    await invite(alice, "Bob");
    const [request] = (await list(alice)).outgoing;
    for (const cookies of [alice, carol]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/friends/requests/${request!.id}/accept`,
        cookies,
      });
      expect(res.statusCode).toBe(404);
    }
    expect((await list(bob)).friends).toEqual([]);
  });

  it("accepte automatiquement si l'autre personne avait déjà invité", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    await invite(alice, "Bob");
    const res = await invite(bob, "alice");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "accepted" });
    expect((await list(alice)).friends).toHaveLength(1);
  });

  it("refuse les demandes invalides ou en double", async () => {
    const alice = await register("Alice");
    await register("Bob");
    expect((await invite(alice, "personne")).statusCode).toBe(404);
    expect((await invite(alice, "ALICE")).statusCode).toBe(400);
    expect((await invite(alice, "alice@example.com")).statusCode).toBe(404);
    expect((await invite(alice, "Bob")).statusCode).toBe(201);
    const again = await invite(alice, "bob");
    expect(again.statusCode).toBe(409);
    expect(again.json().fields.username).toMatch(/déjà invité/);
  });

  it("annule une demande envoyée", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    await invite(alice, "Bob");
    const [request] = (await list(alice)).outgoing;
    const byBob = await app.inject({
      method: "DELETE",
      url: `/api/friends/requests/${request!.id}`,
      cookies: bob,
    });
    expect(byBob.statusCode).toBe(404);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/friends/requests/${request!.id}`,
      cookies: alice,
    });
    expect(res.statusCode).toBe(204);
    expect((await list(bob)).incoming).toEqual([]);
  });

  it("retire un ami pour les deux personnes", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    await invite(alice, "Bob");
    await invite(bob, "Alice");
    const [friend] = (await list(alice)).friends;
    const res = await app.inject({
      method: "DELETE",
      url: `/api/friends/${friend!.id}`,
      cookies: alice,
    });
    expect(res.statusCode).toBe(204);
    expect((await list(bob)).friends).toEqual([]);
    const again = await app.inject({
      method: "DELETE",
      url: `/api/friends/${friend!.id}`,
      cookies: alice,
    });
    expect(again.statusCode).toBe(404);
  });

  it("indique si un ami est en ligne, et le passe hors ligne à la déconnexion", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    await invite(alice, "Bob");
    await invite(bob, "Alice");
    expect((await list(alice)).friends[0]!.online).toBe(true);

    await database.db.execute("update users set last_seen_at = now() - interval '10 minutes'");
    expect((await list(alice)).friends[0]!.online).toBe(false);

    await app.inject({ method: "GET", url: "/api/auth/me", cookies: bob });
    expect((await list(alice)).friends[0]!.online).toBe(true);

    await app.inject({ method: "POST", url: "/api/auth/logout", cookies: bob });
    expect((await list(alice)).friends[0]!.online).toBe(false);
  });

  it("protège les routes et valide les identifiants", async () => {
    expect((await app.inject({ method: "GET", url: "/api/friends" })).statusCode).toBe(401);
    const alice = await register("Alice");
    const res = await app.inject({
      method: "POST",
      url: "/api/friends/requests/pas-un-uuid/accept",
      cookies: alice,
    });
    expect(res.statusCode).toBe(400);
  });
});
