import { SLOT_TYPES, type DofusItem, type DofusSet, type SlotFamily } from "@kenpai/shared";
import { HttpError } from "../../lib/errors";
import { normalizeItem, normalizeSet, type RawItem, type RawSet } from "./normalize";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 3000;
const PAGE_SIZE = 30;

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

  /**
   * Objets d'une famille d'emplacement, filtrés par nom et par niveau maximum.
   * Sans recherche : les objets du plus haut niveau autorisé.
   */
  async searchItems(family: SlotFamily, query: string, maxLevel: number): Promise<DofusItem[]> {
    const params = new URLSearchParams({
      "filter[type.name_id]": SLOT_TYPES[family].join(","),
      "filter[max_level]": String(maxLevel),
    });
    if (query) {
      params.set("query", query);
      params.set("limit", String(PAGE_SIZE));
      const hits = await this.get<{ ankama_id: number }[]>(`/items/equipment/search?${params}`);
      // La recherche ne renvoie pas les effets : on charge chaque fiche (mise en cache).
      return Promise.all(hits.map((h) => this.item(h.ankama_id)));
    }
    params.set("page[size]", String(PAGE_SIZE));
    params.set("sort[level]", "desc");
    params.set("fields[item]", "effects,conditions,parent_set");
    const page = await this.get<{ items: RawItem[] }>(`/items/equipment?${params}`);
    return page.items.map(normalizeItem);
  }
}
