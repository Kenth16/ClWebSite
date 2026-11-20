import { describe, expect, it } from "vitest";
import type { Database } from "@kenpai/db";
import { buildApp } from "../../app";
import { DofusClient } from "./client";

const env = {
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  COOKIE_SECURE: false,
} as const;

const coiffe = {
  ankama_id: 8009,
  name: "Coiffe du Koalak",
  level: 60,
  type: { name: "Chapeau", id: 27 },
  image_urls: { icon: "https://exemple/8009.png" },
  parent_set: { id: 46, name: "Panoplie du Koalak" },
  conditions: {
    is_operand: false,
    relation: "and",
    children: [
      {
        is_operand: true,
        condition: { operator: ">", int_value: 249, element: { name: "Force" } },
      },
    ],
  },
  effects: [
    {
      int_minimum: 41,
      int_maximum: 60,
      type: { name: "Vitalité", is_active: false },
      formatted: "41 à 60 Vitalité",
    },
    {
      int_minimum: 1,
      int_maximum: 0,
      ignore_int_max: true,
      type: { name: "PM" },
      formatted: "1 PM",
    },
    {
      int_minimum: -10,
      int_maximum: 0,
      ignore_int_max: true,
      type: { name: "Tacle" },
      formatted: "-10 Tacle",
    },
    {
      int_minimum: 12,
      int_maximum: 16,
      type: { name: "dommages Terre", is_active: true },
      formatted: "12 à 16 dommages Terre",
    },
  ],
};

function fakeFetch() {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (url.includes("/items/equipment/all")) {
      const light = { ...coiffe, conditions: undefined, parent_set: undefined };
      const ocre = {
        ankama_id: 7754,
        name: "Dofus Ocre",
        level: 160,
        type: { name: "Dofus" },
        effects: [
          {
            int_minimum: 1,
            int_maximum: 0,
            ignore_int_max: true,
            type: { name: "PA" },
            formatted: "1 PA",
          },
          {
            int_minimum: 0,
            int_maximum: 0,
            type: { name: "-special spell-", is_meta: true },
            formatted: "{{spell,8394,1::Jaune Ocre}} :\n• Le porteur gagne 1 PA.",
          },
          {
            int_minimum: 0,
            int_maximum: 0,
            type: { name: "Échangeable :" },
            formatted: "Échangeable : 0",
          },
          { int_minimum: 0, int_maximum: 0, type: { name: "Attitude" }, formatted: "Attitude 0" },
          { int_minimum: 0, int_maximum: 0, type: { name: "Fertile" }, formatted: "Fertile" },
        ],
      };
      return json({ items: decodeURIComponent(url).includes("=dofus,") ? [ocre] : [light] });
    }
    if (url.includes("/items/equipment/7754")) return json({ error: "indisponible" }, 500);
    if (url.includes("/items/equipment/8009")) return json(coiffe);
    if (url.includes("/items/equipment?")) return json({ items: [coiffe] });
    if (url.includes("/sets/search")) {
      if (url.includes("query=zzz")) return json({ error: "No results found." }, 404);
      return json([
        { ankama_id: 46, name: "Panoplie du Koalak", level: 61, items: 7 },
        {
          ankama_id: 9,
          name: "Panoplie Cosmétique",
          level: 1,
          items: 2,
          contains_cosmetics_only: true,
        },
      ]);
    }
    if (url.includes("/sets?")) {
      return json({ sets: [{ ankama_id: 46, name: "Panoplie du Koalak", level: 61, items: 7 }] });
    }
    if (url.includes("/sets/46")) {
      return json({
        ankama_id: 46,
        name: "Panoplie du Koalak",
        equipment_ids: [8009, 8003],
        effects: {
          "1": null,
          "2": [
            {
              int_minimum: 20,
              int_maximum: 0,
              ignore_int_max: true,
              type: { name: "Agilité" },
              formatted: "20 Agilité",
            },
          ],
        },
      });
    }
    return json({ error: "introuvable" }, 404);
  }) as typeof fetch;
  return { impl, calls };
}

async function app() {
  const fake = fakeFetch();
  const instance = await buildApp({
    env,
    db: {} as Database,
    pingDatabase: async () => true,
    dofus: new DofusClient({ baseUrl: "https://dofus.test", fetch: fake.impl }),
  });
  return { instance, calls: fake.calls };
}

describe("données Dofus", () => {
  it("normalise un objet : jet max, malus, lignes d'arme et conditions", async () => {
    const { instance } = await app();
    const res = await instance.inject({ method: "GET", url: "/api/dofus/items/8009" });
    expect(res.statusCode).toBe(200);
    const { item } = res.json();
    expect(item).toMatchObject({
      id: 8009,
      level: 60,
      set: { id: 46 },
      icon: "https://exemple/8009.png",
    });
    expect(item.effects).toEqual([
      { stat: "vitality", value: 60, text: "41 à 60 Vitalité" },
      { stat: "mp", value: 1, text: "1 PM" },
      { stat: "lock", value: -10, text: "-10 Tacle" },
      { stat: null, value: 16, text: "12 à 16 dommages Terre" },
    ]);
    expect(item.conditions).toEqual({
      kind: "condition",
      condition: { stat: "strength", label: "Force", operator: ">", value: 249 },
    });
    await instance.close();
  });

  it("recherche par emplacement, avec le filtre de types et de niveau, et met en cache", async () => {
    const { instance, calls } = await app();
    const url = "/api/dofus/items?family=hat&q=KOALAK&maxLevel=131";
    const res = await instance.inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).toMatchObject({ name: "Coiffe du Koalak", set: { id: 46 } });
    expect(decodeURIComponent(calls[0]!)).toContain(
      "/items/equipment/all?filter[type.name_id]=hat",
    );
    const before = calls.length;
    await instance.inject({ method: "GET", url });
    expect(calls.length).toBe(before);
    // Niveau maximum trop bas : rien.
    const low = await instance.inject({
      method: "GET",
      url: "/api/dofus/items?family=hat&maxLevel=59",
    });
    expect(low.json().items).toEqual([]);
    await instance.close();
  });

  it("filtre par caractéristiques minimales", async () => {
    const { instance } = await app();
    const ok = await instance.inject({
      method: "GET",
      url: "/api/dofus/items?family=hat&stats=vitality:50,mp:1",
    });
    expect(ok.json().items).toHaveLength(1);
    const none = await instance.inject({
      method: "GET",
      url: "/api/dofus/items?family=hat&stats=vitality:61",
    });
    expect(none.json().items).toEqual([]);
    for (const bad of ["chaussettes:5", "vitality", "vitality:abc"]) {
      const res = await instance.inject({
        method: "GET",
        url: `/api/dofus/items?family=hat&stats=${bad}`,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("propose les montures dans les familiers, par sous-catégorie", async () => {
    const { instance, calls } = await app();
    await instance.inject({ method: "GET", url: "/api/dofus/items?family=pet&subtype=seemyool" });
    const allCalls = () => calls.filter((c) => c.includes("/all")).map(decodeURIComponent);
    expect(allCalls().at(-1)).toContain("filter[type.name_id]=seemyool");
    await instance.inject({ method: "GET", url: "/api/dofus/items?family=pet" });
    expect(allCalls().at(-1)).toContain(
      "filter[type.name_id]=dragoturkey,pet,petsmount,rhineetle,seemyool",
    );
    const bad = await instance.inject({
      method: "GET",
      url: "/api/dofus/items?family=hat&subtype=seemyool",
    });
    expect(bad.statusCode).toBe(400);
  });

  it("recherche des panoplies et renvoie leurs objets avec leur emplacement", async () => {
    const { instance, calls } = await app();
    const found = await instance.inject({
      method: "GET",
      url: "/api/dofus/sets?q=koalak&maxLevel=100",
    });
    expect(found.json().sets).toEqual([
      { id: 46, name: "Panoplie du Koalak", level: 61, itemCount: 7 },
    ]);
    expect(decodeURIComponent(calls.at(-1)!)).toContain("filter[max_highest_equipment_level]=100");
    const none = await instance.inject({ method: "GET", url: "/api/dofus/sets?q=zzz" });
    expect(none.json().sets).toEqual([]);
    const top = await instance.inject({ method: "GET", url: "/api/dofus/sets" });
    expect(top.json().sets).toHaveLength(1);

    const res = await instance.inject({ method: "GET", url: "/api/dofus/sets/46/items" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.set.id).toBe(46);
    // 8003 est introuvable : seule la coiffe est renvoyée.
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: 8009, family: "hat" });
  });

  it("retire la ligne de balise des objets à sort spécial et garde la description", async () => {
    const { instance } = await app();
    const res = await instance.inject({ method: "GET", url: "/api/dofus/items?family=dofus" });
    expect(res.json().items[0].effects).toEqual([
      { stat: "ap", value: 1, text: "1 PA" },
      { stat: null, value: 0, text: "• Le porteur gagne 1 PA." },
    ]);
  });

  it("renvoie les bonus de panoplie et refuse un emplacement inconnu", async () => {
    const { instance } = await app();
    const set = (await instance.inject({ method: "GET", url: "/api/dofus/sets/46" })).json().set;
    expect(set.bonuses).toEqual({ 2: [{ stat: "agility", value: 20, text: "20 Agilité" }] });
    const bad = await instance.inject({
      method: "GET",
      url: "/api/dofus/items?family=chaussettes",
    });
    expect(bad.statusCode).toBe(400);
    const missing = await instance.inject({ method: "GET", url: "/api/dofus/items/1" });
    expect(missing.statusCode).toBe(404);
    await instance.close();
  });
});
