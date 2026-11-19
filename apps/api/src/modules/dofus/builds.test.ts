import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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

const zero = { vitality: 0, wisdom: 0, strength: 0, intelligence: 0, chance: 0, agility: 0 };
const build = {
  name: "Cra Terre",
  level: 131,
  base: { ...zero, vitality: 7, strength: 200 },
  scrolls: { ...zero, vitality: 100 },
  slots: { hat: 8009, dofus1: 7754 },
  notes: "PvM",
  image: null,
  breedId: 9,
  exos: { ap: true, mp: false, range: false },
  forgemagic: [
    { stat: "strength", value: 30 },
    { stat: "fireRes", value: -5 },
  ],
};
/** Petite image PNG valide (1 × 1 pixel). */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe.skipIf(!available)("stuffs Dofus enregistrés", () => {
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
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
    return { [SESSION_COOKIE]: cookie.value };
  }

  it("enregistre, liste, recharge, modifie et supprime un stuff", async () => {
    const alice = await register("Alice");
    const created = await app.inject({
      method: "POST",
      url: "/api/dofus/builds",
      cookies: alice,
      payload: build,
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json().build;
    expect(created.json().build).toMatchObject({ name: "Cra Terre", level: 131, itemCount: 2 });

    const list = await app.inject({ method: "GET", url: "/api/dofus/builds", cookies: alice });
    expect(list.json().builds).toHaveLength(1);

    const one = await app.inject({ method: "GET", url: `/api/dofus/builds/${id}`, cookies: alice });
    expect(one.json().build.data).toEqual(build);

    const updated = await app.inject({
      method: "PUT",
      url: `/api/dofus/builds/${id}`,
      cookies: alice,
      payload: { ...build, name: "Cra Air", slots: {} },
    });
    expect(updated.json().build).toMatchObject({ name: "Cra Air", itemCount: 0 });

    const del = await app.inject({
      method: "DELETE",
      url: `/api/dofus/builds/${id}`,
      cookies: alice,
    });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/api/dofus/builds", cookies: alice });
    expect(after.json().builds).toEqual([]);
  });

  it("enregistre l'image du personnage avec le stuff", async () => {
    const alice = await register("Alice");
    const created = await app.inject({
      method: "POST",
      url: "/api/dofus/builds",
      cookies: alice,
      payload: { ...build, image: PNG },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json().build;
    const one = await app.inject({ method: "GET", url: `/api/dofus/builds/${id}`, cookies: alice });
    expect(one.json().build.data.image).toBe(PNG);
  });

  it("garde les stuffs privés", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    const { id } = (
      await app.inject({ method: "POST", url: "/api/dofus/builds", cookies: alice, payload: build })
    ).json().build;
    for (const [method, payload] of [["GET"], ["PUT", build], ["DELETE"]] as const) {
      const res = await app.inject({
        method,
        url: `/api/dofus/builds/${id}`,
        cookies: bob,
        payload,
      });
      expect(res.statusCode, method).toBe(404);
    }
    expect(
      (await app.inject({ method: "GET", url: "/api/dofus/builds", cookies: bob })).json().builds,
    ).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/dofus/builds" })).statusCode).toBe(401);
  });

  it("valide le contenu d'un stuff", async () => {
    const alice = await register("Alice");
    for (const bad of [
      { ...build, name: "" },
      { ...build, level: 201 },
      { ...build, scrolls: { ...zero, vitality: 101 } },
      { ...build, slots: { chaussettes: 1 } },
      { ...build, notes: "x".repeat(256) },
      { ...build, forgemagic: [{ stat: "chaussettes", value: 1 }] },
      { ...build, forgemagic: [{ stat: "strength", value: 10_000 }] },
      { ...build, image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
      { ...build, image: "https://exemple.com/perso.png" },
      { ...build, image: `data:image/png;base64,${"A".repeat(150_000)}` },
    ]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/dofus/builds",
        cookies: alice,
        payload: bad,
      });
      expect(res.statusCode, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
  });
});
