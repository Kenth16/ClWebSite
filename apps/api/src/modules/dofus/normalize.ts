import {
  ITEM_TYPE_FAMILY,
  statFromEffectName,
  type DofusCondition,
  type DofusConditionTree,
  type DofusEffect,
  type DofusItem,
  type DofusSet,
} from "@kenpai/shared";

/** Formes (partielles) des réponses de l'API DofusDude. */
export interface RawEffect {
  int_minimum: number;
  int_maximum: number;
  ignore_int_max?: boolean;
  type: { name: string; is_active?: boolean; is_meta?: boolean };
  formatted: string;
}

interface RawConditionNode {
  is_operand?: boolean;
  relation?: string;
  children?: RawConditionNode[];
  condition?: { operator: string; int_value: number; element: { name: string } };
}

export interface RawItem {
  ankama_id: number;
  name: string;
  level: number;
  type: { name: string; id?: number };
  image_urls?: { icon?: string; sd?: string };
  effects?: RawEffect[] | null;
  conditions?: RawConditionNode | null;
  parent_set?: { id: number; name: string } | null;
}

export interface RawSet {
  ankama_id: number;
  name: string;
  equipment_ids?: number[];
  effects?: Record<string, RawEffect[] | null> | null;
}

/** Valeur retenue d'un effet : le jet maximum. */
function effectValue(e: RawEffect): number {
  if (e.ignore_int_max || e.int_maximum === 0) return e.int_minimum;
  // Pour un malus, le « maximum » est la valeur la plus défavorable.
  return e.int_minimum < 0 ? Math.min(e.int_minimum, e.int_maximum) : e.int_maximum;
}

/**
 * Texte d'un effet sans les lignes de balises internes (« {{spell,8394,1::Jaune Ocre}} : »)
 * des objets à sort spécial : seule la description est gardée.
 */
export function cleanEffectText(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/\{\{[^}]*\}\}/.test(line))
    .join("\n")
    .trim();
}

/** Effets sans intérêt pour le simulateur : attitudes, fertilité, échangeabilité. */
const HIDDEN_EFFECT = /^(attitude|fertile|échangeable)/i;

export function normalizeEffect(e: RawEffect): DofusEffect {
  // Les effets « actifs » sont les lignes de dégâts des armes : affichées, non additionnées.
  const stat = e.type.is_active || e.type.is_meta ? null : statFromEffectName(e.type.name);
  return { stat, value: effectValue(e), text: cleanEffectText(e.formatted) };
}

const OPERATORS = new Set([">", "<", "=", "!"]);

function normalizeConditions(node: RawConditionNode | null | undefined): DofusConditionTree | null {
  if (!node) return null;
  if (node.condition) {
    const { operator, int_value, element } = node.condition;
    const name = element.name.trim();
    const condition: DofusCondition = {
      stat: /^niveau$/i.test(name) ? "level" : statFromEffectName(name),
      label: name,
      operator: (OPERATORS.has(operator) ? operator : "=") as DofusCondition["operator"],
      value: int_value,
    };
    return { kind: "condition", condition };
  }
  const children = (node.children ?? [])
    .map(normalizeConditions)
    .filter((c): c is DofusConditionTree => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return { kind: node.relation === "or" ? "or" : "and", children };
}

export function normalizeItem(raw: RawItem): DofusItem {
  return {
    id: raw.ankama_id,
    name: raw.name,
    level: raw.level,
    type: raw.type.name,
    icon: raw.image_urls?.icon ?? null,
    effects: (raw.effects ?? [])
      .filter((e) => !HIDDEN_EFFECT.test(e.type.name.trim()))
      .map(normalizeEffect)
      .filter((e) => e.text !== ""),
    conditions: normalizeConditions(raw.conditions),
    set: raw.parent_set ? { id: raw.parent_set.id, name: raw.parent_set.name } : null,
    family: raw.type.id !== undefined ? (ITEM_TYPE_FAMILY[raw.type.id] ?? null) : null,
  };
}

export function normalizeSet(raw: RawSet): DofusSet {
  const bonuses: Record<number, DofusEffect[]> = {};
  for (const [count, effects] of Object.entries(raw.effects ?? {})) {
    if (effects && effects.length > 0) bonuses[Number(count)] = effects.map(normalizeEffect);
  }
  return { id: raw.ankama_id, name: raw.name, itemIds: raw.equipment_ids ?? [], bonuses };
}
