"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { conditionsText, type DofusItem, type SlotFamily } from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Icône d'un objet (image de l'API DofusDude), ou un emplacement vide. */
export function ItemIcon({ item, className }: { item: DofusItem | null; className?: string }) {
  if (!item?.icon) {
    return (
      <span className={cn("block size-12 rounded-md bg-muted", className)} aria-hidden="true" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images hébergées par l'API DofusDude
    <img
      src={item.icon}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      draggable={false}
      className={cn("size-12 object-contain", className)}
    />
  );
}

/** Liste des effets d'un objet ; les malus sont en rouge. */
export function EffectList({ item, className }: { item: DofusItem; className?: string }) {
  return (
    <ul className={cn("grid gap-0.5 text-sm", className)}>
      {item.effects.map((e, i) => (
        <li
          key={i}
          className={cn(
            e.stat === null && "text-muted-foreground italic",
            e.stat !== null && e.value < 0 && "text-destructive",
          )}
        >
          {e.text}
        </li>
      ))}
    </ul>
  );
}

export function ItemPicker({
  open,
  onOpenChange,
  slotLabel,
  family,
  level,
  current,
  onPick,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotLabel: string;
  family: SlotFamily;
  level: number;
  current: DofusItem | null;
  onPick: (item: DofusItem) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [limitToLevel, setLimitToLevel] = React.useState(true);
  const [results, setResults] = React.useState<DofusItem[]>([]);
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus("loading");
      const params = new URLSearchParams({ family, q: query.trim() });
      if (limitToLevel) params.set("maxLevel", String(level));
      apiFetch<{ items: DofusItem[] }>(`/dofus/items?${params}`)
        .then(({ items }) => {
          if (cancelled) return;
          setResults(items);
          setStatus("idle");
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setError(e instanceof ApiError ? e.message : "Recherche impossible.");
          setStatus("error");
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, family, query, limitToLevel, level]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-4">
        <div>
          <DialogTitle>{slotLabel}</DialogTitle>
          <DialogDescription className="mt-1">
            Recherchez un objet par son nom, puis cliquez dessus pour l&apos;équiper.
          </DialogDescription>
        </div>

        {current && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
            <ItemIcon item={current} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{current.name}</p>
              <p className="text-sm text-muted-foreground">Équipé · niveau {current.level}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRemove}>
              <X aria-hidden="true" />
              Retirer
            </Button>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
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
              placeholder="Nom de l'objet…"
              aria-label="Nom de l'objet"
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
        </div>

        <div
          className="-mx-2 max-h-[55svh] min-h-40 overflow-y-auto px-2"
          aria-busy={status === "loading"}
        >
          {status === "error" ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : status === "loading" && results.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Recherche…
            </p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun objet trouvé.</p>
          ) : (
            <ul className={cn("grid gap-2", status === "loading" && "opacity-60")}>
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item)}
                    className={cn(
                      "flex w-full gap-3 rounded-lg border bg-card/70 p-3 text-left transition-colors hover:border-gold/50 hover:bg-accent",
                      current?.id === item.id && "border-primary",
                    )}
                  >
                    <ItemIcon item={item} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Niv. {item.level} · {item.type}
                        {item.set && ` · ${item.set.name}`}
                      </p>
                      <EffectList item={item} className="mt-1.5 sm:grid-cols-2 sm:gap-x-4" />
                      {item.conditions && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Conditions : {conditionsText(item.conditions)}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
