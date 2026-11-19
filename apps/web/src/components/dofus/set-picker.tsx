"use client";

import * as React from "react";
import { Check, Layers, Loader2, Search } from "lucide-react";
import type { DofusItem, DofusSet, DofusSetSummary } from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ItemIcon } from "./item-picker";

/**
 * « Ajouter une panoplie » : rechercher une panoplie, cocher les objets voulus
 * et les équiper d'un coup.
 */
export function SetPicker({
  level,
  equippedIds,
  onEquip,
}: {
  level: number;
  equippedIds: readonly number[];
  onEquip: (set: DofusSet, items: DofusItem[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [limitToLevel, setLimitToLevel] = React.useState(true);
  const [sets, setSets] = React.useState<DofusSetSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [chosen, setChosen] = React.useState<{ set: DofusSet; items: DofusItem[] } | null>(null);
  const [loadingSet, setLoadingSet] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  // Recherche des panoplies (avec un léger délai pendant la frappe).
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim() });
      if (limitToLevel) params.set("maxLevel", String(level));
      apiFetch<{ sets: DofusSetSummary[] }>(`/dofus/sets?${params}`)
        .then((data) => {
          if (cancelled) return;
          setSets(data.sets);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof ApiError ? e.message : "Recherche impossible.");
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, limitToLevel, level]);

  async function choose(id: number) {
    setLoadingSet(id);
    try {
      const data = await apiFetch<{ set: DofusSet; items: DofusItem[] }>(`/dofus/sets/${id}/items`);
      const items = [...data.items].sort((a, b) => a.level - b.level);
      setChosen({ set: data.set, items });
      // Par défaut : tous les objets qui ont un emplacement.
      setSelected(new Set(items.filter((i) => i.family).map((i) => i.id)));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Panoplie indisponible.");
    } finally {
      setLoadingSet(null);
    }
  }

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function equip() {
    if (!chosen) return;
    onEquip(
      chosen.set,
      chosen.items.filter((i) => selected.has(i.id)),
    );
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setChosen(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Layers aria-hidden="true" />
          Ajouter une panoplie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl gap-4">
        <div>
          <DialogTitle>Ajouter une panoplie</DialogTitle>
          <DialogDescription className="mt-1">
            Choisissez une panoplie, cochez les objets voulus puis équipez-les d&apos;un coup.
          </DialogDescription>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Liste des panoplies */}
          <div className="grid content-start gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom de la panoplie…"
                aria-label="Nom de la panoplie"
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={limitToLevel}
                onChange={(e) => setLimitToLevel(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Jusqu&apos;au niveau {level}
            </label>
            <ul className="-mx-1 grid max-h-[50svh] gap-1 overflow-y-auto px-1">
              {sets === null ? (
                <li className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Recherche…
                </li>
              ) : sets.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  Aucune panoplie trouvée.
                </li>
              ) : (
                sets.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void choose(s.id)}
                      aria-pressed={chosen?.set.id === s.id}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                        chosen?.set.id === s.id
                          ? "border-gold/60 bg-gold-soft"
                          : "border-transparent bg-card/60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Niv. {s.level} · {s.itemCount} obj.
                      </span>
                      {loadingSet === s.id && (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Objets de la panoplie choisie */}
          <div className="grid content-start gap-2 rounded-lg border border-dashed border-gold/30 bg-card/40 p-3">
            {!chosen ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Choisissez une panoplie dans la liste.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display truncate tracking-wide">{chosen.set.name}</p>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-primary hover:underline"
                    onClick={() =>
                      setSelected(
                        selected.size > 0
                          ? new Set()
                          : new Set(chosen.items.filter((i) => i.family).map((i) => i.id)),
                      )
                    }
                  >
                    {selected.size > 0 ? "Tout décocher" : "Tout cocher"}
                  </button>
                </div>
                <ul className="grid max-h-[44svh] gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {chosen.items.map((item) => {
                    const on = selected.has(item.id);
                    const usable = !!item.family;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={!usable}
                          aria-pressed={on}
                          onClick={() => toggle(item.id)}
                          title={usable ? undefined : "Emplacement non pris en charge"}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border p-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-40",
                            on ? "border-primary bg-primary/5" : "bg-background/40",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded border",
                              on && "border-primary bg-primary text-primary-foreground",
                            )}
                            aria-hidden="true"
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <ItemIcon item={item} className="size-9 shrink-0" />
                          <span className="min-w-0 leading-tight">
                            <span className="block truncate font-medium">{item.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              Niv. {item.level} · {item.type}
                              {equippedIds.includes(item.id) && " · équipé"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <Button disabled={selected.size === 0} onClick={equip}>
                  Équiper {selected.size} objet{selected.size > 1 ? "s" : ""}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Les emplacements libres sont remplis en premier ; sinon l&apos;objet en place est
                  remplacé.
                </p>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
