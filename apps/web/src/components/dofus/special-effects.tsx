"use client";

import * as React from "react";
import {
  SPECIAL_NONE,
  specialChoice,
  type DofusItem,
  type SpecialChoices,
  type SpecialEffect,
  type StatKey,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ItemIcon } from "./item-picker";
import { StatIcon } from "./stat-icon";

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
  effect: SpecialEffect;
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
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{effect.question}</legend>
          <div className={cn("grid gap-1.5", many && "sm:grid-cols-2")}>
            {effect.choices.map((c) => option(c.id, c.label, c.stats))}
            {option(SPECIAL_NONE, "Rien : ne pas compter ce bonus")}
          </div>
        </fieldset>
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
  entries: { item: DofusItem; effect: SpecialEffect }[];
  choices: SpecialChoices;
  onEdit: (effectKey: string) => void;
}) {
  return (
    <ul className="grid gap-2">
      {entries.map(({ item, effect }) => {
        const choice = specialChoice(effect, choices);
        return (
          <li
            key={effect.key}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border p-2",
              choice ? "border-gold/50 bg-gold-soft" : "bg-background/40",
            )}
          >
            <ItemIcon item={item} className="size-9 shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{effect.spell}</p>
              <p
                className={cn(
                  "text-xs",
                  choice ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {choice ? choice.label : "Rien (bonus non compté)"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onEdit(effect.key)}>
              Changer
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
