"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import {
  OPTIMIZER_BANNED_MAX,
  OPTIMIZER_ITEM_CATEGORIES,
  SLOTS,
  type OptimizerItemCategory,
  type DofusItem,
  type SlotFamily,
  type SlotId,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ItemIcon, ItemPicker } from "./item-picker";

/** Familles d'emplacement (une entrée par famille), dans l'ordre des emplacements. */
const FAMILIES = [
  ...new Map(
    SLOTS.map((s) => [s.family as SlotFamily, { family: s.family, label: s.label }]),
  ).values(),
];

export interface ItemRules {
  /** Catégories écartées (familiers, armes à distance, Prysmaradites…). */
  excluded: OptimizerItemCategory[];
  legendaryItems: boolean;
  /** Objets imposés, posés dans le stuff par le joueur (un par emplacement). */
  forced: Partial<Record<SlotId, DofusItem>>;
  banned: DofusItem[];
}

export const DEFAULT_ITEM_RULES: ItemRules = {
  excluded: [],
  legendaryItems: true,
  forced: {},
  banned: [],
};

/** Impose un objet dans un emplacement (null : le retire) ; il n'est plus interdit. */
export function forceItem(rules: ItemRules, slot: SlotId, item: DofusItem | null): ItemRules {
  const forced = { ...rules.forced };
  // Le même objet ne peut être imposé qu'une fois (anneaux, Dofus).
  for (const [s, i] of Object.entries(forced) as [SlotId, DofusItem][]) {
    if (item && i.id === item.id) delete forced[s];
  }
  if (item) forced[slot] = item;
  else delete forced[slot];
  return {
    ...rules,
    forced,
    banned: item ? rules.banned.filter((i) => i.id !== item.id) : rules.banned,
  };
}

/** Interdit un objet ; s'il était imposé, il quitte le stuff. */
export function banItem(rules: ItemRules, item: DofusItem): ItemRules {
  if (rules.banned.length >= OPTIMIZER_BANNED_MAX) return rules;
  const forced = Object.fromEntries(
    Object.entries(rules.forced).filter(([, i]) => i.id !== item.id),
  ) as ItemRules["forced"];
  const banned = rules.banned.some((i) => i.id === item.id)
    ? rules.banned
    : [...rules.banned, item];
  return { ...rules, forced, banned };
}

/** Interrupteur (comme un réglage de téléphone) : activé = autorisé. */
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-accent/50">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-primary bg-primary" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-background shadow transition-[left]",
            checked ? "left-[1.1rem]" : "left-0.5",
          )}
        />
      </button>
      <span className={cn(!checked && "text-muted-foreground")}>{label}</span>
    </label>
  );
}

/**
 * Objets autorisés : une catégorie désactivée n'est jamais proposée par le
 * solveur (sauf objet imposé). Les objets imposés et interdits se règlent
 * directement sur le stuff.
 */
export function OptimizerItems({
  value,
  onChange,
}: {
  value: ItemRules;
  onChange: (value: ItemRules) => void;
}) {
  const toggle = (id: OptimizerItemCategory, allowed: boolean) =>
    onChange({
      ...value,
      excluded: allowed ? value.excluded.filter((x) => x !== id) : [...value.excluded, id],
    });
  return (
    <div className="grid gap-3">
      <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {OPTIMIZER_ITEM_CATEGORIES.map((c) => (
          <Switch
            key={c.id}
            label={c.label}
            checked={!value.excluded.includes(c.id)}
            onChange={(allowed) => toggle(c.id, allowed)}
          />
        ))}
        <Switch
          label="Équipements légendaires"
          checked={value.legendaryItems}
          onChange={(legendaryItems) => onChange({ ...value, legendaryItems })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Pour imposer un objet précis (Dofus compris), posez-le dans le stuff de la page ; Ctrl +
        clic sur un objet l&apos;interdit.
      </p>
    </div>
  );
}

/** Objets interdits par le joueur : liste, retrait d'un clic, ajout par emplacement. */
export function BannedItems({
  level,
  value,
  onChange,
}: {
  level: number;
  value: ItemRules;
  onChange: (value: ItemRules) => void;
}) {
  const [family, setFamily] = React.useState<SlotFamily | null>(null);
  const label = FAMILIES.find((f) => f.family === family)?.label ?? "";
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {value.banned.length === 0
            ? "Aucun : tous les objets portables sont envisagés."
            : `${value.banned.length} objet${value.banned.length > 1 ? "s" : ""} jamais proposé${value.banned.length > 1 ? "s" : ""}`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              disabled={value.banned.length >= OPTIMIZER_BANNED_MAX}
            >
              <Plus aria-hidden="true" />
              Ajouter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Emplacement</DropdownMenuLabel>
            {FAMILIES.map((f) => (
              <DropdownMenuItem key={f.family} onSelect={() => setFamily(f.family)}>
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {value.banned.length > 0 && (
        <ul className="grid grid-cols-3 gap-1">
          {value.banned.map((item) => (
            <li
              key={item.id}
              title={`${item.name} (niv. ${item.level})`}
              className="relative flex min-w-0 flex-col items-center gap-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-1 pt-1 pb-0.5"
            >
              <ItemIcon item={item} className="size-8 shrink-0" />
              <span className="w-full truncate text-center text-[0.65rem] leading-tight font-medium">
                {item.name}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, banned: value.banned.filter((i) => i.id !== item.id) })
                }
                className="absolute top-0 right-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Ne plus interdire ${item.name}`}
                title="Ne plus interdire"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {family && (
        <ItemPicker
          key={family}
          open
          onOpenChange={(open) => !open && setFamily(null)}
          slotLabel={`Interdire : ${label}`}
          description="Cet objet ne sera jamais proposé par le solveur."
          family={family}
          level={level}
          current={null}
          onPick={(item) => {
            onChange(banItem(value, item));
            setFamily(null);
          }}
          onRemove={() => setFamily(null)}
        />
      )}
    </div>
  );
}
