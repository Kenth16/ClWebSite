import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@kenpai/shared";
import type { Database } from "@kenpai/db";
import { buildApp } from "./app";

const env = {
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  COOKIE_SECURE: false,
} as const;
// Ces tests ne touchent pas la base : un objet vide suffit.
const db = {} as Database;

describe("GET /api/health", () => {
  it("répond 200 quand la base est disponible", async () => {
    const app = await buildApp({ env, db, pingDatabase: async () => true });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ status: "ok", database: "up" });
    await app.close();
  });

  it("répond 503 quand la base est indisponible", async () => {
    const app = await buildApp({ env, db, pingDatabase: async () => false });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", database: "down" });
    await app.close();
  });

  it("renvoie une erreur 404 propre pour une route inconnue", async () => {
    const app = await buildApp({ env, db, pingDatabase: async () => true });
    const res = await app.inject({ method: "GET", url: "/api/inexistant" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Ressource introuvable." });
    await app.close();
  });

  it("ajoute les en-têtes de sécurité", async () => {
    const app = await buildApp({ env, db, pingDatabase: async () => true });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    await app.close();
  });
});
