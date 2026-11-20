/**
 * Conditions des objets (données du jeu, format DofusDB : « CP<12&CM<6&CW>99 »).
 * On garde ce qui dépend du stuff : caractéristiques, PA, PM, nombre de bonus
 * de panoplie actifs (« pk<2 » des trophées) et classe. Le reste (alignement,
 * quêtes, métiers…) est ignoré : considéré comme rempli.
 */
import type { StatKey } from "./dofus";

export type CriteriaOp = "<" | ">" | "=" | "!";

export type CriteriaTree =
  | { kind: "and" | "or"; children: CriteriaTree[] }
  | { kind: "stat"; stat: StatKey; op: CriteriaOp; value: number }
  /** Nombre de panoplies dont le bonus est actif (au moins 2 objets portés). */
  | { kind: "sets"; op: CriteriaOp; value: number }
  | { kind: "breed"; op: CriteriaOp; value: number }
  | { kind: "true" }
  | { kind: "false" };

/** Codes de caractéristiques du jeu (vérifiés contre les conditions lisibles de DofusDude). */
export const CRITERIA_STATS: Record<string, StatKey> = {
  CS: "strength",
  CI: "intelligence",
  CC: "chance",
  CA: "agility",
  CV: "vitality",
  CW: "wisdom",
  CP: "ap",
  CM: "mp",
};

/** Analyse une condition ; null si vide ou illisible (considérée comme remplie). */
export function parseCriteria(raw: string | null | undefined): CriteriaTree | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.replace(/\s+/g, "");
  let pos = 0;

  const atom = (): CriteriaTree => {
    if (text[pos] === "(") {
      pos++;
      const inner = or();
      if (text[pos] === ")") pos++;
      return inner;
    }
    const match = /^([A-Za-z]+)([<>=!~])([^&|()]*)/.exec(text.slice(pos));
    if (!match) {
      // Illisible : on avance jusqu'au prochain opérateur logique.
      while (pos < text.length && !"&|)".includes(text[pos]!)) pos++;
      return { kind: "true" };
    }
    pos += match[0].length;
    const [, code, rawOp, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || rawOp === "~") return { kind: "true" };
    const op = rawOp as CriteriaOp;
    if (code! in CRITERIA_STATS) return { kind: "stat", stat: CRITERIA_STATS[code!]!, op, value };
    if (code === "pk") return { kind: "sets", op, value };
    if (code === "PG") return { kind: "breed", op, value };
    return { kind: "true" };
  };
  const and = (): CriteriaTree => {
    const children = [atom()];
    while (text[pos] === "&") {
      pos++;
      children.push(atom());
    }
    return children.length === 1 ? children[0]! : { kind: "and", children };
  };
  const or = (): CriteriaTree => {
    const children = [and()];
    while (text[pos] === "|") {
      pos++;
      children.push(and());
    }
    return children.length === 1 ? children[0]! : { kind: "or", children };
  };
  return simplifyCriteria(or(), {});
}

const compare = (actual: number, op: CriteriaOp, value: number) =>
  op === "<"
    ? actual < value
    : op === ">"
      ? actual > value
      : op === "="
        ? actual === value
        : actual !== value;

/**
 * Simplifie une condition : la classe connue est évaluée, les « vrai » et
 * « faux » sont propagés. Renvoie null si la condition est toujours remplie.
 */
export function simplifyCriteria(
  tree: CriteriaTree,
  context: { breedId?: number },
): CriteriaTree | null {
  const go = (t: CriteriaTree): CriteriaTree => {
    switch (t.kind) {
      case "breed":
        if (context.breedId === undefined) return t;
        return { kind: compare(context.breedId, t.op, t.value) ? "true" : "false" };
      case "and": {
        const children = t.children.map(go).filter((c) => c.kind !== "true");
        if (children.some((c) => c.kind === "false")) return { kind: "false" };
        if (children.length === 0) return { kind: "true" };
        return children.length === 1 ? children[0]! : { kind: "and", children };
      }
      case "or": {
        const children = t.children.map(go).filter((c) => c.kind !== "false");
        if (children.length === 0) return { kind: "false" };
        if (children.some((c) => c.kind === "true")) return { kind: "true" };
        return children.length === 1 ? children[0]! : { kind: "or", children };
      }
      default:
        return t;
    }
  };
  const result = go(tree);
  return result.kind === "true" ? null : result;
}

/** La condition est-elle remplie pour ces totaux (caractéristiques, panoplies actives, classe) ? */
export function criteriaMet(
  tree: CriteriaTree | null | undefined,
  context: { total: (stat: StatKey) => number; activeSets: number; breedId?: number },
): boolean {
  if (!tree) return true;
  switch (tree.kind) {
    case "true":
      return true;
    case "false":
      return false;
    case "and":
      return tree.children.every((c) => criteriaMet(c, context));
    case "or":
      return tree.children.some((c) => criteriaMet(c, context));
    case "stat":
      return compare(context.total(tree.stat), tree.op, tree.value);
    case "sets":
      return compare(context.activeSets, tree.op, tree.value);
    case "breed":
      return context.breedId === undefined || compare(context.breedId, tree.op, tree.value);
  }
}
