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
import { RawgClient } from "../rawg/client";

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

/** Faux catalogue RAWG. */
const CATALOG = [
  {
    id: 1,
    name: "Grand Theft Auto VI",
    released: null,
    background_image: "https://media.rawg.io/media/games/a/gta6.jpg",
    genres: [{ name: "Action" }],
    platforms: [{ platform: { name: "PlayStation 5" } }],
  },
  {
    id: 2,
    name: "Jeu raté",
    released: "2020-01-01",
    background_image: null,
    genres: [],
    platforms: [],
  },
  { id: 3, name: "Jeu", released: "2021-05-04", background_image: null, genres: [], platforms: [] },
];
const fakeRawg = new RawgClient({
  apiKey: "test",
  baseUrl: "https://rawg.test/api",
  fetch: (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const match = /\/games\/(\d+)$/.exec(url.pathname);
    if (match) {
      const game = CATALOG.find((g) => g.id === Number(match[1]));
      return game ? json(game) : json({ detail: "Not found." }, 404);
    }
    const q = (url.searchParams.get("search") ?? "").toLowerCase();
    return json({ results: CATALOG.filter((g) => g.name.toLowerCase().includes(q)), next: null });
  }) as typeof fetch,
});

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
      rawg: fakeRawg,
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

  /** Ajoute un jeu du faux catalogue à partir de son titre. */
  const addGame = (cookies: Cookies, title: string) =>
    app.inject({
      method: "POST",
      url: "/api/games",
      cookies,
      payload: { rawgId: CATALOG.find((g) => g.name === title)?.id ?? 999 },
    });
  const rate = (cookies: Cookies, id: string, scores: ReviewScores, comment?: string) =>
    app.inject({
      method: "PUT",
      url: `/api/games/${id}/review`,
      cookies,
      payload: { scores, comment },
    });
  const detail = async (id: string, cookies?: Cookies) =>
    (await app.inject({ method: "GET", url: `/api/games/${id}`, cookies })).json<GameDetail>();

  it("ajoute un jeu du catalogue une seule fois, avec son image et ses infos", async () => {
    const alice = await register("Alice");
    const first = await addGame(alice, "Grand Theft Auto VI");
    expect(first.statusCode).toBe(201);
    const again = await addGame(alice, "Grand Theft Auto VI");
    expect(again.statusCode).toBe(200);
    expect(again.json().game.id).toBe(first.json().game.id);
    const d = await detail(first.json().game.id);
    expect(d.game).toMatchObject({
      title: "Grand Theft Auto VI",
      cover: "https://media.rawg.io/media/crop/600/400/games/a/gta6.jpg",
      released: null,
      platforms: ["PlayStation 5"],
      genres: ["Action"],
    });
    expect((await addGame(alice, "Inconnu")).statusCode).toBe(404);
    const freeText = await app.inject({
      method: "POST",
      url: "/api/games",
      cookies: alice,
      payload: { title: "GTA 6" },
    });
    expect(freeText.statusCode).toBe(400);
  });

  it("indique dans le catalogue les jeux déjà notés", async () => {
    const alice = await register("Alice");
    const { game } = (await addGame(alice, "Jeu raté")).json();
    await rate(alice, game.id, all(4));
    const res = await app.inject({ method: "GET", url: "/api/games/catalog?q=jeu" });
    expect(res.statusCode).toBe(200);
    const games: { rawgId: number }[] = res.json().games;
    expect(games.find((g) => g.rawgId === 2)).toMatchObject({
      gameId: game.id,
      average: 40,
      reviewCount: 1,
    });
    expect(games.find((g) => g.rawgId === 3)).toMatchObject({ gameId: null, average: null });
  });

  it("liste les derniers jeux notés avec le dernier avis", async () => {
    const alice = await register("Alice");
    const bob = await register("Bob");
    const a = (await addGame(alice, "Jeu raté")).json().game;
    await addGame(alice, "Jeu"); // ajouté mais jamais noté
    await rate(alice, a.id, all(2));
    await rate(bob, a.id, all(6));
    const res = await app.inject({ method: "GET", url: "/api/games?reviewed=1&limit=8" });
    const { games } = res.json<{ games: GameSummary[] }>();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ title: "Jeu raté", reviewCount: 2, average: 40 });
    expect(games[0]!.lastReview).toMatchObject({ user: { username: "Bob" }, total: 60 });
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
