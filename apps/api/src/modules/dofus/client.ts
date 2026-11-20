import {
  SLOT_TYPES,
  itemMatchesStatFilters,
  slotTypes,
  type DofusItem,
  type DofusSet,
  type DofusSetSummary,
  type ItemStatFilter,
  type SlotFamily,
} from "@kenpai/shared";
import { HttpError } from "../../lib/errors";
import { normalizeItem, normalizeSet, type RawItem, type RawSet } from "./normalize";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 3000;
const PAGE_SIZE = 40;
const SET_PAGE_SIZE = 30;

export interface DofusClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Accès aux données Dofus 3 de l'API communautaire DofusDude (en français),
 * avec un cache mémoire : les données du jeu ne changent qu'aux mises à jour.
 */
export class DofusClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(options: DofusClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.dofusdu.de/dofus3/v1/fr").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  private get<T>(path: string): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(path);
    if (hit && hit.expires > now) return hit.value as Promise<T>;

    const value = (async () => {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new HttpError(502, "Les données Dofus sont momentanément indisponibles.");
      }
      if (response.status === 404) throw new HttpError(404, "Élément introuvable.");
      if (!response.ok) {
        throw new HttpError(502, "Les données Dofus sont momentanément indisponibles.");
      }
      return (await response.json()) as T;
    })();

    // Les échecs ne restent pas en cache.
    value.catch(() => this.cache.delete(path));
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(path, { expires: now + CACHE_TTL_MS, value });
    return value;
  }

  async item(id: number): Promise<DofusItem> {
    return normalizeItem(await this.get<RawItem>(`/items/equipment/${id}`));
  }

  async set(id: number): Promise<DofusSet> {
    return normalizeSet(await this.get<RawSet>(`/sets/${id}`));
  }

  /** Panoplies par nom (ou les plus hautes sans recherche), jusqu'à un niveau donné. */
  async searchSets(query: string, maxLevel: number): Promise<DofusSetSummary[]> {
    type RawSummary = {
      ankama_id: number;
      name: string;
      level: number;
      items: number;
      contains_cosmetics_only?: boolean;
    };
    const params = new URLSearchParams({
      "filter[max_highest_equipment_level]": String(maxLevel),
    });
    let raw: RawSummary[];
    if (query.trim()) {
      params.set("query", query.trim());
      params.set("limit", String(SET_PAGE_SIZE));
      try {
        raw = await this.get<RawSummary[]>(`/sets/search?${params}`);
      } catch (e) {
        // L'API répond 404 quand rien ne correspond.
        if (e instanceof HttpError && e.statusCode === 404) return [];
        throw e;
      }
    } else {
      params.set("page[size]", String(SET_PAGE_SIZE));
      params.set("sort[level]", "desc");
      raw = (await this.get<{ sets: RawSummary[] }>(`/sets?${params}`)).sets;
    }
    return raw
      .filter((s) => !s.contains_cosmetics_only)
      .map((s) => ({ id: s.ankama_id, name: s.name, level: s.level, itemCount: s.items }));
  }

  /** Une panoplie et la fiche de chacun de ses objets. */
  async setWithItems(id: number): Promise<{ set: DofusSet; items: DofusItem[] }> {
    const set = await this.set(id);
    // Un objet introuvable n'empêche pas d'équiper le reste de la panoplie.
    const results = await Promise.allSettled(set.itemIds.map((itemId) => this.item(itemId)));
    const items = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    return { set, items };
  }

  /** Toutes les panoplies (bonus et objets), pour l'optimiseur. */
  async allSets(): Promise<DofusSet[]> {
    const page = await this.get<{ sets: RawSet[] }>("/sets/all");
    return page.sets.map(normalizeSet);
  }

  /** Tous les équipements de tous les emplacements, pour l'optimiseur. */
  async allEquipment(): Promise<DofusItem[]> {
    const lists = await Promise.all(
      (Object.keys(SLOT_TYPES) as SlotFamily[]).map((family) =>
        this.allOfTypes(SLOT_TYPES[family]),
      ),
    );
    return lists.flat();
  }

  /** Tous les objets de ces types (liste légère : effets, sans conditions ni panoplie). */
  private async allOfTypes(types: readonly string[]): Promise<DofusItem[]> {
    const params = new URLSearchParams({ "filter[type.name_id]": [...types].sort().join(",") });
    const page = await this.get<{ items: RawItem[] }>(`/items/equipment/all?${params}`);
    return page.items.map(normalizeItem);
  }

  /**
   * Objets d'une famille d'emplacement (ou d'une sous-catégorie), filtrés par
   * nom, niveau maximum et caractéristiques minimales. Sans recherche : les
   * objets du plus haut niveau autorisé.
   */
  async searchItems(
    family: SlotFamily,
    query: string,
    maxLevel: number,
    options: { subtype?: string; stats?: readonly ItemStatFilter[] } = {},
  ): Promise<DofusItem[]> {
    const all = await this.allOfTypes(slotTypes(family, options.subtype));
    const q = fold(query.trim());
    const matches = all
      .filter(
        (item) =>
          item.level <= maxLevel &&
          (!q || fold(item.name).includes(q)) &&
          itemMatchesStatFilters(item, options.stats ?? []),
      )
      .sort((a, b) => {
        if (q) {
          const rank = Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q));
          if (rank !== 0) return rank;
        }
        return b.level - a.level || a.name.localeCompare(b.name, "fr");
      })
      .slice(0, PAGE_SIZE);
    // La liste complète n'a ni conditions ni panoplie : on charge chaque fiche (mise en cache).
    return Promise.all(matches.map((m) => this.item(m.id).catch(() => m)));
  }
}

/** Minuscules sans accents, pour comparer les noms. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
