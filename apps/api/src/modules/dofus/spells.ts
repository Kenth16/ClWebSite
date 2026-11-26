import type {
  DofusMonster,
  MonsterGrade,
  DofusBreed,
  DofusElement,
  DofusSpell,
  ElementPick,
  LineCondition,
  SpellBuffLine,
  SpellCharges,
  SpellDamageLine,
  SpellGrade,
  StatKey,
} from "@kenpai/shared";
import { HttpError } from "../../lib/errors";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
/** L'API DofusDB renvoie au plus 50 éléments par page. */
const PAGE = 50;

/** Effets de dégâts DofusDB (effectId) → élément et type. */
const DAMAGE_EFFECTS: Record<
  number,
  { element: DofusElement; kind: SpellDamageLine["kind"]; pick?: ElementPick }
> = {
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
  // Meilleur / pire élément : l'élément est choisi au calcul (« neutral » en attendant).
  2822: { element: "neutral", kind: "damage", pick: "best" },
  2828: { element: "neutral", kind: "steal", pick: "best" },
  2832: { element: "neutral", kind: "damage", pick: "worst" },
  2890: { element: "neutral", kind: "steal", pick: "worst" },
};

interface RawEffect {
  effectId: number;
  diceNum: number;
  diceSide: number;
  /** Valeur fixe de certains effets (bonus de dégâts de base d'un sort…). */
  value?: number;
  /** Tours (−1 : jusqu'à la fin du combat). */
  duration?: number;
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
/**
 * Pourquoi un effet de dégâts ne frappe pas directement la cible au lancer, ou
 * null s'il la frappe. « exclude » : il ne vise pas d'ennemi (allié, lanceur…).
 */
function lineCondition(e: RawEffect): LineCondition | "exclude" | null {
  if (appliesOnCast(e)) return null;
  const tokens = (e.targetMask ?? "A").split(",").map((t) => t.trim().replace(/^\*/, ""));
  if (!tokens.includes("A")) return "exclude";
  if ((e.delay ?? 0) > 0) return "delayed";
  if (e.triggers && e.triggers !== "I") return "triggered";
  if (tokens.some((t) => /^[A-Z]\d+/.test(t))) return "conditional";
  return "zone";
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
  /** Cumuls possibles des effets du sort (−1 ou 0 : sans limite). */
  maxStack?: number;
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
interface RawMonsterGrade {
  grade: number;
  level: number;
  lifePoints: number;
  reductionNeutral?: number;
  reductionEarth?: number;
  reductionFire?: number;
  reductionWater?: number;
  reductionAir?: number;
  reductionNeutralFlat?: number;
  reductionEarthFlat?: number;
  reductionFireFlat?: number;
  reductionWaterFlat?: number;
  reductionAirFlat?: number;
  criticalDamageReduction?: number;
  pushDamageReduction?: number;
}
interface RawMonster {
  id: number;
  name: { fr?: string };
  /** Image du monstre (calculée par DofusDB, absente si on choisit les champs). */
  img?: string;
  gfxId?: number;
  isBoss?: boolean;
  hideInBestiary?: boolean;
  grades?: RawMonsterGrade[];
}

/** Grade DofusDB → niveau, PV et résistances (en % et fixes) par élément. */
export function normalizeMonsterGrade(g: RawMonsterGrade): MonsterGrade {
  return {
    grade: g.grade,
    level: g.level,
    hp: g.lifePoints,
    resistances: {
      pct: {
        neutral: g.reductionNeutral ?? 0,
        earth: g.reductionEarth ?? 0,
        fire: g.reductionFire ?? 0,
        water: g.reductionWater ?? 0,
        air: g.reductionAir ?? 0,
      },
      flat: {
        neutral: g.reductionNeutralFlat ?? 0,
        earth: g.reductionEarthFlat ?? 0,
        fire: g.reductionFireFlat ?? 0,
        water: g.reductionWaterFlat ?? 0,
        air: g.reductionAirFlat ?? 0,
      },
      critical: g.criticalDamageReduction ?? 0,
    },
    pushback: g.pushDamageReduction ?? 0,
  };
}

/** Résultats d'une recherche de monstres au plus. */
const MONSTERS_MAX = 20;

interface Page<T> {
  total: number;
  data: T[];
}

/**
 * Lignes de dégâts d'un effet de sort. Par défaut, seulement celles qui frappent
 * la cible au lancer ; avec `fallback`, aussi celles sous condition (repérées).
 */
function damageLines(effects: RawEffect[] | undefined, fallback = false): SpellDamageLine[] {
  return (effects ?? []).flatMap((e) => {
    const kind = DAMAGE_EFFECTS[e.effectId];
    if (!kind) return [];
    const condition = lineCondition(e);
    if (condition === "exclude" || (condition && !fallback)) return [];
    const min = e.diceNum;
    const max = e.diceSide > 0 ? e.diceSide : e.diceNum;
    return [
      {
        ...kind,
        min: Math.min(min, max),
        max: Math.max(min, max),
        ...(condition ? { condition } : {}),
      },
    ];
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

/** Effet « +X dégâts de base au sort #diceNum ». */
const BASE_DAMAGE_BOOST = 293;
/** Charges listées quand le jeu ne fixe pas de limite de cumul. */
const UNLIMITED_CHARGES_SHOWN = 5;

const maskTokens = (e: RawEffect) =>
  (e.targetMask ?? "A").split(",").map((t) => t.trim().replace(/^\*/, ""));
/** Un jeton de cible qui exige un état, une classe, une invocation… (« E573 », « b14 »). */
const isFilterToken = (t: string) => /^[A-Za-z]+\d+/.test(t);

/**
 * Le sort se renforce-t-il lui-même ? Lignes « +X dégâts de base » qui visent
 * ce sort, sans état requis : à chaque lancer (charges, dans la limite de
 * cumul) ou après des tours d'attente (effets différés, cumulés).
 */
export function spellCharges(raw: RawLevel): SpellCharges | null {
  const own = raw.effects.filter(
    (e) =>
      e.effectId === BASE_DAMAGE_BOOST &&
      e.diceNum === raw.spellId &&
      (e.value ?? 0) > 0 &&
      (!e.triggers || e.triggers === "I") &&
      !maskTokens(e).some(isFilterToken),
  );
  if (own.length === 0) return null;
  const delayed = own.filter((e) => (e.delay ?? 0) > 0);
  if (delayed.length > 0) {
    // Un palier par délai : somme des effets déjà déclenchés après autant de tours.
    const delays = [...new Set(delayed.map((e) => e.delay!))].sort((a, b) => a - b);
    const steps = delays.map((at) => ({
      at,
      bonus: delayed.filter((e) => e.delay! <= at).reduce((sum, e) => sum + e.value!, 0),
    }));
    return { steps, unit: "turn" };
  }
  const perCharge = own.reduce((sum, e) => sum + e.value!, 0);
  const max = raw.maxStack ?? -1;
  const count = max > 0 ? max : UNLIMITED_CHARGES_SHOWN;
  return {
    steps: Array.from({ length: count }, (_, i) => ({ at: i + 1, bonus: perCharge * (i + 1) })),
    unit: "charge",
    ...(max > 0 ? {} : { unlimited: true }),
  };
}

/** Effets de boost DofusDB (gain de caractéristique) → caractéristique. */
const BUFF_EFFECTS: Record<number, StatKey> = {
  111: "ap",
  112: "damage",
  115: "critical",
  117: "range",
  118: "strength",
  119: "agility",
  123: "chance",
  126: "intelligence",
  128: "mp",
  138: "power",
  178: "heals",
  182: "summons",
  414: "pushbackDamage",
  418: "criticalDamage",
  1171: "finalDamagePct",
  2800: "meleeDamagePct",
  2804: "rangedDamagePct",
};
/** Cibles d'un boost : alliés (a, g) ou lanceur (c, C). */
const BUFF_TARGETS = new Set(["a", "c", "C", "g"]);

/**
 * Boosts d'un sort : gains de caractéristiques qui peuvent viser le lanceur ou
 * un allié. Ceux qui demandent un état, une cible précise, un déclenchement ou
 * un délai sont repérés : le joueur décide s'il les compte.
 */
export function buffLines(effects: RawEffect[] | undefined): SpellBuffLine[] {
  return (effects ?? []).flatMap((e) => {
    const stat = BUFF_EFFECTS[e.effectId];
    if (!stat) return [];
    const tokens = maskTokens(e);
    if (!tokens.some((t) => BUFF_TARGETS.has(t))) return [];
    const min = e.diceNum;
    const max = e.diceSide > 0 ? e.diceSide : e.diceNum;
    if (Math.max(min, max) <= 0) return [];
    const condition: SpellBuffLine["condition"] =
      (e.delay ?? 0) > 0
        ? "delayed"
        : e.triggers && e.triggers !== "I"
          ? "triggered"
          : tokens.some((t) => !BUFF_TARGETS.has(t) && t !== "A")
            ? "conditional"
            : undefined;
    return [
      {
        stat,
        min: Math.min(min, max),
        max: Math.max(min, max),
        duration: e.duration ?? 0,
        ...(condition ? { condition } : {}),
      },
    ];
  });
}

export function normalizeGrade(raw: RawLevel): SpellGrade {
  // Aucun dégât direct : on garde les dégâts sous condition, repérés, pour que le
  // sort apparaisse (Anneau Destructeur, poisons, sorts à état…).
  const fallback = damageLines(raw.effects).length === 0;
  const charges = spellCharges(raw);
  const buffs = buffLines(raw.effects);
  return {
    grade: raw.grade,
    minLevel: raw.minPlayerLevel,
    apCost: raw.apCost,
    minRange: raw.minRange,
    range: raw.range,
    criticalChance: raw.criticalHitProbability,
    maxCastsPerTurn: castsPerTurn(raw),
    lines: damageLines(raw.effects, fallback),
    criticalLines: damageLines(raw.criticalEffect, fallback),
    ...(charges ? { charges } : {}),
    ...(buffs.length > 0 ? { buffs } : {}),
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

  /**
   * Monstres dont le nom contient le texte (sans tenir compte des majuscules),
   * hors monstres cachés du bestiaire, avec leurs grades.
   */
  monsters(query: string): Promise<DofusMonster[]> {
    const text = query.trim().slice(0, 40);
    return this.cached(`monsters:${text.toLowerCase()}`, async () => {
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const page = await this.get<RawMonster>("/monsters", [
        ["$limit", String(MONSTERS_MAX)],
        ["name.fr[$regex]", `(?i)${escaped}`],
        ...["id", "name", "gfxId", "isBoss", "hideInBestiary", "grades"].map(
          (f): [string, string] => ["$select[]", f],
        ),
      ]);
      return page.data
        .filter((m) => !m.hideInBestiary && (m.grades?.length ?? 0) > 0)
        .map((m) => ({
          id: m.id,
          name: m.name.fr ?? `Monstre ${m.id}`,
          icon: m.img ?? (m.gfxId ? `${this.baseUrl}/img/monsters/${m.gfxId}.png` : null),
          boss: !!m.isBoss,
          grades: (m.grades ?? []).map(normalizeMonsterGrade).sort((a, b) => a.grade - b.grade),
        }));
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
