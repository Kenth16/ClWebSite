"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import {
  OPTIMIZER_SITUATION,
  type DofusItem,
  type OptimizerFight,
  type OptimizerSituation,
  type OptimizerTurn,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ItemIcon } from "./item-picker";

const TURNS: { value: OptimizerTurn; label: string; help: string }[] = [
  { value: "odd", label: "Impair", help: "Nébuleux +20 %" },
  { value: "even", label: "Pair", help: "Nébuleux −10 %" },
  { value: "average", label: "Moyenne", help: "moitié de chaque" },
];
const FIGHTS: { value: OptimizerFight; label: string; help: string }[] = [
  { value: "short", label: "Court", help: "aucun cumul" },
  { value: "long", label: "Long", help: "cumuls au maximum" },
];

/** Dofus possédés, retenus d'une visite à l'autre (confort, sur cet appareil). */
const OWNED_KEY = "kenpai:optimizer:owned-dofus";

export function loadOwnedDofus(): number[] | null {
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list.filter((x): x is number => typeof x === "number") : null;
  } catch {
    return null;
  }
}

function saveOwnedDofus(owned: number[] | null) {
  try {
    if (owned === null) localStorage.removeItem(OWNED_KEY);
    else localStorage.setItem(OWNED_KEY, JSON.stringify(owned));
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite seulement.
  }
}

/** Boutons à choix unique avec une précision sous chaque libellé. */
function Options<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; help: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col items-start rounded-md border px-3 py-1 text-left text-sm leading-tight transition-colors hover:bg-accent",
              value === o.value ? "border-primary bg-primary/10 font-semibold" : "bg-card/60",
            )}
          >
            {o.label}
            <span className="text-[0.65rem] font-normal text-muted-foreground">{o.help}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Situation de combat simulée (tour, durée du combat, hypothèses fixes) et
 * Dofus possédés : seuls ceux-là sont proposés par le solveur.
 */
export function OptimizerSituationPanel({
  situation,
  onSituation,
  owned,
  onOwned,
}: {
  situation: OptimizerSituation;
  onSituation: (situation: OptimizerSituation) => void;
  /** Dofus possédés (null : tous). */
  owned: number[] | null;
  onOwned: (owned: number[] | null) => void;
}) {
  const [dofus, setDofus] = React.useState<DofusItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    apiFetch<{ items: DofusItem[] }>("/dofus/dofus")
      .then(({ items }) => setDofus(items))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Dofus indisponibles."));
  }, []);

  const has = (id: number) => owned === null || owned.includes(id);
  function update(next: number[] | null) {
    // Tous cochés : on revient à « tous » (les nouveaux Dofus seront aussi permis).
    const all = next !== null && dofus !== null && dofus.every((d) => next.includes(d.id));
    const value = all ? null : next;
    saveOwnedDofus(value);
    onOwned(value);
  }
  function toggle(id: number) {
    const current = owned ?? (dofus ?? []).map((d) => d.id);
    update(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }
  const count = owned === null ? (dofus?.length ?? 0) : owned.length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <Options
          label="Tour simulé"
          value={situation.turn}
          options={TURNS}
          onChange={(turn) => onSituation({ ...situation, turn })}
        />
        <Options
          label="Durée du combat"
          value={situation.fight}
          options={FIGHTS}
          onChange={(fight) => onSituation({ ...situation, fight })}
        />
      </div>
      <dl className="grid gap-x-4 gap-y-1 rounded-lg border bg-background/40 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {OPTIMIZER_SITUATION.map((row) => (
          <div key={row.label} className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-muted-foreground">{row.label} :</dt>
            <dd className="min-w-0 font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Dofus possédés</span>
          <span className="text-xs text-muted-foreground">
            {dofus ? `${count} sur ${dofus.length}` : ""} · les trophées restent tous permis
          </span>
          <div className="ml-auto flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => update(null)}
            >
              Tous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => update([])}
            >
              Aucun
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !dofus ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Chargement des Dofus…
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1.5">
            {dofus.map((d) => {
              const on = has(d.id);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(d.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-1.5 rounded-md border p-1 text-left text-xs transition-colors hover:bg-accent",
                      on ? "border-primary/60 bg-primary/10" : "opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-3.5 shrink-0 items-center justify-center rounded border",
                        on && "border-primary bg-primary text-primary-foreground",
                      )}
                      aria-hidden="true"
                    >
                      {on && <Check className="size-2.5" />}
                    </span>
                    <ItemIcon item={d} className="size-6 shrink-0" />
                    <span className="min-w-0 truncate">{d.name.replace(/^Dofus /, "")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
