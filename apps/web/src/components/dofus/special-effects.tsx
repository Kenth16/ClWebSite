"use client";

import * as React from "react";
import { Search } from "lucide-react";
import {
  LEGENDARY_POWERS,
  SPECIAL_NONE,
  specialChoice,
  type LegendaryPower,
  type DofusItem,
  type SpecialChoices,
  type SpecialEffect,
  type StatKey,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ItemIcon } from "./item-picker";
import { StatIcon } from "./stat-icon";

/** Ce que les popups ont besoin de savoir d'un effet (Dofus ou pouvoir légendaire). */
type EffectView = Pick<SpecialEffect, "key" | "spell" | "summary" | "question" | "choices">;

/**
 * Popup de choix d'un effet spécial : la situation de combat à simuler
 * (ex. « tour impair », « pas attaqué », nombre de cumuls) ou « Rien ».
 */
export function SpecialEffectDialog({
  item,
  effect,
  value,
  onChoose,
  onClose,
}: {
  item: DofusItem;
  effect: EffectView;
  /** Choix actuel (identifiant), ou undefined. */
  value: string | undefined;
  onChoose: (choiceId: string) => void;
  onClose: () => void;
}) {
  const current = value ?? SPECIAL_NONE;
  const many = effect.choices.length > 4;
  const option = (id: string, label: string, stats?: Partial<Record<StatKey, number>>) => (
    <button
      key={id}
      type="button"
      aria-pressed={current === id}
      onClick={() => onChoose(id)}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
        current === id ? "border-primary bg-primary/10 font-semibold" : "bg-card/60",
      )}
    >
      {stats && (
        <span className="flex shrink-0 gap-0.5">
          {(Object.keys(stats) as StatKey[]).map((k) => (
            <StatIcon key={k} stat={k} className="size-4" />
          ))}
        </span>
      )}
      <span className="min-w-0">{label}</span>
    </button>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("gap-4", many ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center gap-3">
          <ItemIcon item={item} className="size-12 shrink-0" />
          <div className="min-w-0">
            <DialogTitle>{item.name}</DialogTitle>
            <p className="text-sm font-medium text-gold">{effect.spell}</p>
          </div>
        </div>
        <DialogDescription>{effect.summary}</DialogDescription>
        {effect.choices.length === 0 ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {effect.question}
          </p>
        ) : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{effect.question}</legend>
            <div className={cn("grid gap-1.5", many && "sm:grid-cols-2")}>
              {effect.choices.map((c) => option(c.id, c.label, c.stats))}
              {option(SPECIAL_NONE, "Rien : ne pas compter ce bonus")}
            </div>
          </fieldset>
        )}
        <p className="text-xs text-muted-foreground">
          Le bonus choisi s&apos;ajoute aux caractéristiques et au calcul des dégâts. Vous pourrez
          le changer dans l&apos;encadré « Effets spéciaux ».
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Encadré des effets spéciaux des objets équipés : choix actuel, modifiable. */
export function SpecialEffectsPanel({
  entries,
  choices,
  onEdit,
}: {
  entries: { item: DofusItem; effect: EffectView }[];
  choices: SpecialChoices;
  onEdit: (effectKey: string) => void;
}) {
  return (
    // grid-cols-1 = minmax(0, 1fr) : les cartes ne dépassent jamais du cadre.
    <ul className="grid grid-cols-1 gap-2">
      {entries.map(({ item, effect }) => {
        const choice = specialChoice(effect, choices);
        return (
          <li
            key={effect.key}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg border p-2",
              choice ? "border-gold/50 bg-gold-soft" : "bg-background/40",
            )}
          >
            <ItemIcon item={item} className="size-8 shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{effect.spell}</p>
              <p
                className={cn(
                  "text-xs",
                  choice ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {choice
                  ? choice.label
                  : effect.choices.length === 0
                    ? "Sans effet sur les caractéristiques"
                    : "Rien (bonus non compté)"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => onEdit(effect.key)}
            >
              {effect.choices.length === 0 ? "Détails" : "Changer"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Choix du pouvoir légendaire d'un familier ou montilier : les 32 pouvoirs des
 * croquettes infusées, avec une recherche.
 */
export function LegendaryPowerDialog({
  item,
  value,
  onChoose,
  onClose,
}: {
  item: DofusItem;
  /** Pouvoir actuel (clé), ou null. */
  value: string | null;
  onChoose: (power: LegendaryPower | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const fold = (t: string) =>
    t
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const q = fold(query.trim());
  const shown = LEGENDARY_POWERS.filter(
    (p) => !q || fold(`${p.creature} ${p.spell} ${p.summary}`).includes(q),
  ).sort((a, b) => a.creature.localeCompare(b.creature, "fr"));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl gap-4">
        <div className="flex items-center gap-3">
          <ItemIcon item={item} className="size-12 shrink-0" />
          <div className="min-w-0">
            <DialogTitle>Légende animale</DialogTitle>
            <DialogDescription>
              Pouvoir légendaire de {item.name}, donné par une croquette infusée.
            </DialogDescription>
          </div>
        </div>
        <label className="relative">
          <span className="sr-only">Rechercher un pouvoir</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bwork, dommages finaux, PA…"
            className="pl-9"
          />
        </label>
        <ul className="grid max-h-[55svh] gap-1.5 overflow-y-auto sm:grid-cols-2">
          {shown.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                aria-pressed={value === p.key}
                onClick={() => onChoose(p)}
                className={cn(
                  "flex h-full w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  value === p.key ? "border-primary bg-primary/10" : "bg-card/60",
                  p.choices.length === 0 && "opacity-70",
                )}
              >
                <span className="font-medium">
                  {p.creature} <span className="text-gold">· {p.spell}</span>
                </span>
                <span className="text-xs text-muted-foreground">{p.summary}</span>
                {p.choices.length === 0 && (
                  <span className="text-[0.65rem] text-muted-foreground italic">
                    Sans effet sur les caractéristiques
                  </span>
                )}
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground sm:col-span-2">
              Aucun pouvoir ne correspond.
            </li>
          )}
        </ul>
        {value && (
          <Button variant="outline" onClick={() => onChoose(null)}>
            Retirer le pouvoir légendaire
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
