import type { GameInfo } from "@kenpai/shared";
import { HttpError } from "../../lib/errors";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;
const PAGE_SIZE = 24;

interface RawGame {
  id: number;
  name: string;
  released?: string | null;
  background_image?: string | null;
  platforms?: { platform: { name: string } }[] | null;
  genres?: { name: string }[] | null;
}

export interface RawgGame extends GameInfo {
  rawgId: number;
}

/** Version réduite des images RAWG (les originales pèsent plusieurs Mo). */
export function smallCover(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/\/media\/(games|screenshots)\//, "/media/crop/600/400/$1/");
}

function normalize(raw: RawGame): RawgGame {
  return {
    rawgId: raw.id,
    title: raw.name.slice(0, 200),
    cover: smallCover(raw.background_image),
    released: raw.released ?? null,
    platforms: (raw.platforms ?? []).map((p) => p.platform.name),
    genres: (raw.genres ?? []).map((g) => g.name),
  };
}

export interface RawgClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Catalogue de jeux vidéo RAWG (rawg.io). Nécessite une clé gratuite
 * (variable RAWG_API_KEY). Réponses gardées en cache mémoire.
 */
export class RawgClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(options: RawgClientOptions = {}) {
    this.apiKey = options.apiKey || undefined;
    this.baseUrl = (options.baseUrl ?? "https://api.rawg.io/api").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  get configured() {
    return this.apiKey !== undefined;
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) {
      return Promise.reject(
        new HttpError(
          503,
          "Le catalogue de jeux n'est pas configuré : ajoutez RAWG_API_KEY dans le fichier .env.",
        ),
      );
    }
    const query = new URLSearchParams(params);
    const cacheKey = `${path}?${query}`;
    const now = Date.now();
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > now) return hit.value as Promise<T>;

    query.set("key", this.apiKey);
    const value = (async () => {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}?${query}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new HttpError(502, "Le catalogue de jeux est momentanément indisponible.");
      }
      if (response.status === 404)
        throw new HttpError(404, "Ce jeu n'existe pas dans le catalogue.");
      if (response.status === 401) {
        throw new HttpError(503, "La clé RAWG_API_KEY est refusée par RAWG : vérifiez-la.");
      }
      if (!response.ok) {
        throw new HttpError(502, "Le catalogue de jeux est momentanément indisponible.");
      }
      return (await response.json()) as T;
    })();

    value.catch(() => this.cache.delete(cacheKey));
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(cacheKey, { expires: now + CACHE_TTL_MS, value });
    return value;
  }

  /** Recherche par titre ; sans recherche, les jeux les plus populaires. */
  async search(query: string, page = 1): Promise<{ games: RawgGame[]; hasMore: boolean }> {
    const params: Record<string, string> = {
      page: String(page),
      page_size: String(PAGE_SIZE),
      exclude_additions: "true",
    };
    if (query) {
      params.search = query;
      params.search_precise = "true";
    } else {
      params.ordering = "-added";
    }
    const data = await this.get<{ results: RawGame[]; next: string | null }>("/games", params);
    return { games: data.results.map(normalize), hasMore: Boolean(data.next) };
  }

  async game(rawgId: number): Promise<RawgGame> {
    return normalize(await this.get<RawGame>(`/games/${rawgId}`, {}));
  }
}
