import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  REVIEW_CRITERIA,
  type GameDetail,
  type GameSummary,
  type ReviewScores,
} from "@kenpai/shared";
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
const all = (n: number) =>
  Object.fromEntries(REVIEW_CRITERIA.map((c) => [c.key, n])) as ReviewScores;

describe.skipIf(!available)("avis désastreux", () => {
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

  const addGame = (cookies: Cookies, title: string) =>
    app.inject({ method: "POST", url: "/api/games", cookies, payload: { title } });
  const rate = (cookies: Cookies, id: string, scores: ReviewScores, comment?: string) =>
    app.inject({
      method: "PUT",
      url: `/api/games/${id}/review`,
      cookies,
      payload: { scores, comment },
    });
  const detail = async (id: string, cookies?: Cookies) =>
    (await app.inject({ method: "GET", url: `/api/games/${id}`, cookies })).json<GameDetail>();

  it("ajoute un jeu une seule fois, sans tenir compte de la casse", async () => {
    const alice = await register("Alice");
    const first = await addGame(alice, "  Cyber Quest 2077 ");
    expect(first.statusCode).toBe(201);
    expect(first.json().game.title).toBe("Cyber Quest 2077");
    const again = await addGame(alice, "cyber quest 2077");
    expect(again.statusCode).toBe(200);
    expect(again.json().game.id).toBe(first.json().game.id);
  });

  it("note un jeu, calcule la note globale et les moyennes", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    const { game } = (await addGame(alice, "Jeu raté")).json();

    const res = await rate(alice, game.id, { ...all(0), gameplay: 7, story: 3 }, "Injouable.");
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(18.5);
    await rate(bob, game.id, all(5));

    const d = await detail(game.id, alice);
    expect(d.reviewCount).toBe(2);
    expect(d.average).toBe(34.3); // (18,5 + 50) / 2 = 34,25
    expect(d.criteriaAverages!.gameplay).toBe(6);
    expect(d.myReview).toMatchObject({ total: 18.5, comment: "Injouable." });
    expect(d.reviews[0]!.user).not.toHaveProperty("email");

    const { games } = (await app.inject({ method: "GET", url: "/api/games", cookies: bob })).json<{
      games: GameSummary[];
    }>();
    expect(games).toEqual([
      expect.objectContaining({
        title: "Jeu raté",
        reviewCount: 2,
        average: 34.3,
        reviewedByMe: true,
      }),
    ]);
  });

  it("une seule évaluation par membre : la seconde la remplace", async () => {
    const alice = await register("Alice");
    const { game } = (await addGame(alice, "Jeu")).json();
    await rate(alice, game.id, all(2));
    await rate(alice, game.id, all(8));
    const d = await detail(game.id);
    expect(d.reviewCount).toBe(1);
    expect(d.average).toBe(80);
    expect(d.myReview).toBeNull(); // visiteur non connecté
  });

  it("supprime sa propre évaluation", async () => {
    const alice = await register("Alice");
    const { game } = (await addGame(alice, "Jeu")).json();
    await rate(alice, game.id, all(4));
    const del = await app.inject({
      method: "DELETE",
      url: `/api/games/${game.id}/review`,
      cookies: alice,
    });
    expect(del.statusCode).toBe(204);
    expect((await detail(game.id)).average).toBeNull();
  });

  it("valide les notes et protège l'écriture", async () => {
    const alice = await register("Alice");
    const { game } = (await addGame(alice, "Jeu")).json();
    expect((await rate(alice, game.id, { ...all(5), art: 12 })).statusCode).toBe(400);
    expect((await rate({}, game.id, all(5))).statusCode).toBe(401);
    expect((await addGame({}, "Autre")).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/games" })).statusCode).toBe(200);
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await rate(alice, unknown, all(5))).statusCode).toBe(404);
  });
});
