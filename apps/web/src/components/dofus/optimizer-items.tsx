"use client";

import * as React from "react";
import { Ban, Lock, Plus, X } from "lucide-react";
import {
  OPTIMIZER_BANNED_MAX,
  OPTIMIZER_FORCED_MAX,
  SLOTS,
  type DofusItem,
  type SlotFamily,
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
const slotCount = (family: SlotFamily) => SLOTS.filter((s) => s.family === family).length;

export interface ItemRules {
  prysmaradites: boolean;
  legendaryItems: boolean;
  forced: DofusItem[];
  banned: DofusItem[];
}

export const DEFAULT_ITEM_RULES: ItemRules = {
  prysmaradites: true,
  legendaryItems: true,
  forced: [],
  banned: [],
};

/** Interrupteur Autorisé / Interdit. */
function AllowToggle({
  label,
  value,
  onChange,
  feminine = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  feminine?: boolean;
}) {
  const e = feminine ? "es" : "s";
  return (
    <div className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              "h-9 rounded-md border px-3 text-sm transition-colors hover:bg-accent",
              value === v ? "border-primary bg-primary/10 font-semibold" : "bg-card/60",
            )}
          >
            {v ? `Autorisé${e}` : `Interdit${e}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Liste d'objets imposés ou interdits, avec un bouton pour en ajouter. */
function ItemList({
  kind,
  items,
  max,
  isFull,
  onAdd,
  onRemove,
}: {
  kind: "forced" | "banned";
  items: DofusItem[];
  max: number;
  /** La famille n'accepte plus d'objet (emplacements tous imposés). */
  isFull: (family: SlotFamily) => boolean;
  onAdd: (family: SlotFamily) => void;
  onRemove: (id: number) => void;
}) {
  const forced = kind === "forced";
  const Icon = forced ? Lock : Ban;
  return (
    <div
      className={cn(
        "grid content-start gap-2 rounded-lg border p-3",
        forced ? "border-gold/40 bg-gold-soft/40" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn("size-4", forced ? "text-gold" : "text-destructive")}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">
          {forced ? "Objets imposés" : "Objets interdits"}
        </span>
        <span className="text-xs text-muted-foreground">
          {forced ? "toujours dans le stuff" : "jamais proposés"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              disabled={items.length >= max}
            >
              <Plus aria-hidden="true" />
              Ajouter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Emplacement</DropdownMenuLabel>
            {FAMILIES.map((f) => (
              <DropdownMenuItem
                key={f.family}
                disabled={isFull(f.family)}
                onSelect={() => onAdd(f.family)}
              >
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {forced
            ? "Aucun : le solveur choisit librement chaque emplacement."
            : "Aucun : tous les objets portables sont envisagés."}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex max-w-full min-w-0 items-center gap-1.5 rounded-md border bg-background/60 py-0.5 pr-0.5 pl-1"
            >
              <ItemIcon item={item} className="size-6 shrink-0" />
              <span className="truncate text-xs font-medium">{item.name}</span>
              <span className="text-[0.65rem] text-muted-foreground">niv. {item.level}</span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Retirer ${item.name}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Objets du stuff : Prysmaradites et équipements légendaires autorisés ou
 * non, objets imposés (toujours portés) et interdits (jamais proposés).
 */
export function OptimizerItems({
  level,
  value,
  onChange,
}: {
  level: number;
  value: ItemRules;
  onChange: (value: ItemRules) => void;
}) {
  const [picking, setPicking] = React.useState<{
    kind: "forced" | "banned";
    family: SlotFamily;
  } | null>(null);
  const forcedIn = (family: SlotFamily) => value.forced.filter((i) => i.family === family).length;
  const without = (list: DofusItem[], id: number) => list.filter((i) => i.id !== id);

  function add(kind: "forced" | "banned", item: DofusItem) {
    if (kind === "forced") {
      if (value.forced.some((i) => i.id === item.id)) return;
      // Plus de place dans la famille : l'objet imposé le plus ancien laisse la sienne.
      const sameFamily = value.forced.filter((i) => i.family === item.family);
      const drop =
        item.family && sameFamily.length >= slotCount(item.family) ? sameFamily[0]!.id : null;
      onChange({
        ...value,
        forced: [...value.forced.filter((i) => i.id !== drop), item],
        banned: without(value.banned, item.id),
      });
    } else {
      if (value.banned.some((i) => i.id === item.id)) return;
      onChange({
        ...value,
        banned: [...value.banned, item],
        forced: without(value.forced, item.id),
      });
    }
  }

  const label = FAMILIES.find((f) => f.family === picking?.family)?.label ?? "";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <AllowToggle
          label="Prysmaradites"
          feminine
          value={value.prysmaradites}
          onChange={(prysmaradites) => onChange({ ...value, prysmaradites })}
        />
        <AllowToggle
          label="Équipements légendaires"
          value={value.legendaryItems}
          onChange={(legendaryItems) => onChange({ ...value, legendaryItems })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ItemList
          kind="forced"
          items={value.forced}
          max={OPTIMIZER_FORCED_MAX}
          isFull={() => false}
          onAdd={(family) => setPicking({ kind: "forced", family })}
          onRemove={(id) => onChange({ ...value, forced: without(value.forced, id) })}
        />
        <ItemList
          kind="banned"
          items={value.banned}
          max={OPTIMIZER_BANNED_MAX}
          isFull={(family) => forcedIn(family) >= slotCount(family)}
          onAdd={(family) => setPicking({ kind: "banned", family })}
          onRemove={(id) => onChange({ ...value, banned: without(value.banned, id) })}
        />
      </div>
      {picking && (
        <ItemPicker
          key={`${picking.kind}-${picking.family}`}
          open
          onOpenChange={(open) => !open && setPicking(null)}
          slotLabel={`${picking.kind === "forced" ? "Imposer" : "Interdire"} : ${label}`}
          description={
            picking.kind === "forced"
              ? "Cet objet sera toujours dans le stuff : le solveur optimise le reste autour."
              : "Cet objet ne sera jamais proposé par le solveur."
          }
          family={picking.family}
          level={level}
          current={null}
          onPick={(item) => {
            add(picking.kind, item);
            setPicking(null);
          }}
          onRemove={() => setPicking(null)}
        />
      )}
    </div>
  );
}
