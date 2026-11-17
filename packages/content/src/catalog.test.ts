import { describe, expect, it } from "vitest";
import { allEntryPaths, catalog, resolveEntry } from "./catalog";

describe("catalog", () => {
  it("résout une entrée imbriquée avec son fil d'Ariane", () => {
    const r = resolveEntry(["histoire", "france", "moyen-age"]);
    expect(r?.entry.title).toBe("Moyen Âge");
    expect(r?.trail.map((e) => e.slug)).toEqual(["histoire", "france", "moyen-age"]);
    expect(r?.href).toBe("/histoire/france/moyen-age");
  });

  it("renvoie null pour un chemin inconnu", () => {
    expect(resolveEntry(["histoire", "inconnu"])).toBeNull();
    expect(resolveEntry([])).toBeNull();
  });

  it("n'a pas de slugs dupliqués parmi des voisins", () => {
    const check = (entries: typeof catalog) => {
      const slugs = entries.map((e) => e.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      entries.forEach((e) => e.children && check(e.children));
    };
    check(catalog);
  });

  it("contient les dix périodes de l'histoire de France", () => {
    expect(resolveEntry(["histoire", "france"])?.entry.children).toHaveLength(10);
    expect(allEntryPaths().length).toBeGreaterThan(20);
  });
});
