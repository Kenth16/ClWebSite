import type {
  DofusBreed,
  DofusElement,
  DofusSpell,
  SpellDamageLine,
  SpellGrade,
} from "@kenpai/shared";
import { HttpError } from "../../lib/errors";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
/** L'API DofusDB renvoie au plus 50 éléments par page. */
const PAGE = 50;

/** Effets de dégâts DofusDB (effectId) → élément et type. */
const DAMAGE_EFFECTS: Record<number, { element: DofusElement; kind: SpellDamageLine["kind"] }> = {
  96: { element: "water", kind: "damage" },
  97: { element: "earth", kind: "damage" },
  98: { element: "air", kind: "damage" },
  99: { element: "fire", kind: "damage" },
  100: { element: "neutral", kind: "damage" },
  91: { element: "water", kind: "steal" },
  92: { element: "earth", kind: "steal" },
  93: { element: "air", kind: "steal" },
  94: { element: "fire", kind: "steal" },
  95: { element: "neutral", kind: "steal" },
};

interface RawEffect {
  effectId: number;
  diceNum: number;
  diceSide: number;
  /** Cibles et conditions, ex. « A » (ennemis), « A,E573 » (ennemi dans l'état 573). */
  targetMask?: string;
  /** Tours avant que l'effet ne se déclenche (0 : immédiat). */
  delay?: number;
  /** Déclencheurs : « I » au lancer ; les autres (fin de tour, etc.) viennent plus tard. */
  triggers?: string;
  /** Zone : forme (code ASCII, 67 = cercle) et rayons (param2 : rayon minimal). */
  zoneDescr?: { shape?: number; param2?: number } | null;
}

/**
 * L'effet frappe-t-il la cible ennemie dès le lancer, sans condition particulière ?
 * Les effets différés ou déclenchés plus tard, ceux qui ne touchent pas la cible
 * (zone autour d'elle), ceux qui ne visent pas d'ennemi et ceux qui exigent un
 * état ou une condition (lettre majuscule suivie d'un numéro, ex. « E573 »)
 * sont écartés : ce sont des variantes selon la situation, pas des dégâts en plus.
 */
export function appliesOnCast(e: RawEffect): boolean {
  if ((e.delay ?? 0) > 0) return false;
  if (e.triggers && e.triggers !== "I") return false;
  // Cercle évidé (« C » avec rayon minimal) ou anneau « O » : la cible n'est pas touchée.
  const zone = e.zoneDescr;
  if (zone && ((zone.shape === 67 && (zone.param2 ?? 0) > 0) || zone.shape === 79)) return false;
  const tokens = (e.targetMask ?? "A").split(",").map((t) => t.trim().replace(/^\*/, ""));
  if (!tokens.includes("A")) return false;
  return !tokens.some((t) => /^[A-Z]\d+/.test(t));
}
interface RawLevel {
  id: number;
  spellId: number;
  grade: number;
  minPlayerLevel: number;
  apCost: number;
  minRange: number;
  range: number;
  criticalHitProbability: number;
  maxCastPerTurn?: number;
  maxCastPerTarget?: number;
  minCastInterval?: number;
  effects: RawEffect[];
  criticalEffect?: RawEffect[];
}
interface RawSpell {
  id: number;
  name: { fr?: string };
  img?: string;
  spellLevels: number[];
}
interface RawVariant {
  id: number;
  spells: RawSpell[];
}
interface RawBreed {
  id: number;
  shortName: { fr?: string };
  img?: string;
}
interface Page<T> {
  total: number;
  data: T[];
}

function damageLines(effects: RawEffect[] | undefined): SpellDamageLine[] {
  return (effects ?? []).flatMap((e) => {
    const kind = DAMAGE_EFFECTS[e.effectId];
    if (!kind || !appliesOnCast(e)) return [];
    const min = e.diceNum;
    const max = e.diceSide > 0 ? e.diceSide : e.diceNum;
    return [{ ...kind, min: Math.min(min, max), max: Math.max(min, max) }];
  });
}

/**
 * Lancers possibles par tour sur une même cible : 1 si le sort a un temps de
 * relance, sinon la plus petite limite (par tour, par cible), ou null sans limite.
 */
function castsPerTurn(raw: RawLevel): number | null {
  if ((raw.minCastInterval ?? 0) > 0) return 1;
  const limits = [raw.maxCastPerTurn ?? 0, raw.maxCastPerTarget ?? 0].filter((n) => n > 0);
  return limits.length > 0 ? Math.min(...limits) : null;
}

export function normalizeGrade(raw: RawLevel): SpellGrade {
  return {
    grade: raw.grade,
    minLevel: raw.minPlayerLevel,
    apCost: raw.apCost,
    minRange: raw.minRange,
    range: raw.range,
    criticalChance: raw.criticalHitProbability,
    maxCastsPerTurn: castsPerTurn(raw),
    lines: damageLines(raw.effects),
    criticalLines: damageLines(raw.criticalEffect),
  };
}

export interface DofusDbClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Classes et sorts de Dofus, relayés depuis l'API communautaire DofusDB
 * (api.dofusdb.fr), avec un cache mémoire.
 */
export class DofusDbClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(options: DofusDbClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.dofusdb.fr").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;
    const value = load();
    value.catch(() => this.cache.delete(key));
    this.cache.set(key, { expires: now + CACHE_TTL_MS, value });
    return value;
  }

  private async get<T>(path: string, params: [string, string][]): Promise<Page<T>> {
    const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}?${query.join("&")}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new HttpError(502, "Les sorts Dofus sont momentanément indisponibles.");
    }
    if (!response.ok) {
      throw new HttpError(502, "Les sorts Dofus sont momentanément indisponibles.");
    }
    return (await response.json()) as Page<T>;
  }

  breeds(): Promise<DofusBreed[]> {
    return this.cached("breeds", async () => {
      const page = await this.get<RawBreed>("/breeds", [["$limit", String(PAGE)]]);
      return page.data
        .map((b) => ({ id: b.id, name: b.shortName.fr ?? `Classe ${b.id}`, icon: b.img ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    });
  }

  /**
   * Conditions brutes des objets (« CP<12&CM<6 »…), par identifiant : mêmes
   * identifiants que DofusDude. Chargées par paquets de 50, puis gardées en cache.
   */
  itemCriteria(ids: readonly number[]): Promise<Map<number, string>> {
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    return this.cached(`criteria:${sorted.length}:${sorted[0]}:${sorted.at(-1)}`, async () => {
      const result = new Map<number, string>();
      for (let i = 0; i < sorted.length; i += PAGE) {
        const chunk = sorted.slice(i, i + PAGE);
        const page = await this.get<{ id: number; criterions?: string }>("/items", [
          ["$limit", String(PAGE)],
          ["$select[]", "id"],
          ["$select[]", "criterions"],
          ...chunk.map((id): [string, string] => ["id[$in][]", String(id)]),
        ]);
        for (const item of page.data) {
          if (item.criterions) result.set(item.id, item.criterions);
        }
      }
      return result;
    });
  }

  /** Sorts d'une classe, avec tous leurs grades. */
  spells(breedId: number): Promise<DofusSpell[]> {
    return this.cached(`spells:${breedId}`, async () => {
      const variants = await this.get<RawVariant>("/spell-variants", [
        ["$limit", String(PAGE)],
        ["breedId", String(breedId)],
      ]);
      if (variants.data.length === 0) throw new HttpError(404, "Classe inconnue.");

      const levelIds = variants.data.flatMap((v) => v.spells.flatMap((s) => s.spellLevels));
      const levels: RawLevel[] = [];
      for (let i = 0; i < levelIds.length; i += PAGE) {
        const chunk = levelIds.slice(i, i + PAGE);
        const page = await this.get<RawLevel>("/spell-levels", [
          ["$limit", String(PAGE)],
          ...chunk.map((id): [string, string] => ["id[$in][]", String(id)]),
        ]);
        levels.push(...page.data);
      }
      const bySpell = new Map<number, RawLevel[]>();
      for (const l of levels) bySpell.set(l.spellId, [...(bySpell.get(l.spellId) ?? []), l]);

      return variants.data.flatMap((v) =>
        v.spells.map((s) => ({
          id: s.id,
          name: s.name.fr ?? `Sort ${s.id}`,
          icon: s.img ?? null,
          variant: v.id,
          grades: (bySpell.get(s.id) ?? []).map(normalizeGrade).sort((a, b) => a.grade - b.grade),
        })),
      );
    });
  }
}
