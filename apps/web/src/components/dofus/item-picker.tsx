"use client";

import * as React from "react";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import {
  ITEM_STAT_FILTERS_MAX,
  SLOT_SUBTYPES,
  STATS,
  conditionsText,
  formatStatFilters,
  type DofusItem,
  type SlotFamily,
  type StatKey,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { EffectRow, StatIcon } from "./stat-icon";

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

/** Liste des effets d'un objet, avec l'icône de chaque caractéristique (malus en rouge). */
export function EffectList({ item, className }: { item: DofusItem; className?: string }) {
  return (
    <ul className={cn("grid gap-0.5 text-sm", className)}>
      {item.effects.map((e, i) => (
        <EffectRow key={i} effect={e} />
      ))}
    </ul>
  );
}

/** Caractéristiques proposées en un clic comme filtres. */
const QUICK_STATS: StatKey[] = [
  "vitality",
  "wisdom",
  "strength",
  "intelligence",
  "chance",
  "agility",
  "power",
  "ap",
  "mp",
  "range",
  "critical",
  "damage",
];

const NO_SPIN =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type DraftFilter = { stat: StatKey; min: string };

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
  const [subtype, setSubtype] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<DraftFilter[]>([]);
  const [results, setResults] = React.useState<DofusItem[]>([]);
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = React.useState("");

  const subtypes = SLOT_SUBTYPES[family];
  const activeSubtype = subtypes?.some((s) => s.id === subtype) ? subtype : null;
  const statsParam = formatStatFilters(
    filters.map((f) => ({ stat: f.stat, min: Math.trunc(Number(f.min)) || 1 })),
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus("loading");
      const params = new URLSearchParams({ family, q: query.trim() });
      if (limitToLevel) params.set("maxLevel", String(level));
      if (activeSubtype) params.set("subtype", activeSubtype);
      if (statsParam) params.set("stats", statsParam);
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
  }, [open, family, query, limitToLevel, level, activeSubtype, statsParam]);

  const hasFilter = (stat: StatKey) => filters.some((f) => f.stat === stat);
  const toggleFilter = (stat: StatKey) =>
    setFilters((list) =>
      list.some((f) => f.stat === stat)
        ? list.filter((f) => f.stat !== stat)
        : list.length >= ITEM_STAT_FILTERS_MAX
          ? list
          : [...list, { stat, min: "" }],
    );
  const otherStats = (Object.keys(STATS) as StatKey[]).filter((k) => !QUICK_STATS.includes(k));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl gap-4">
        <div>
          <DialogTitle>{slotLabel}</DialogTitle>
          <DialogDescription className="mt-1">
            Recherchez un objet, filtrez par caractéristique, puis cliquez dessus pour
            l&apos;équiper.
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

        {subtypes && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégorie">
            {[{ id: null, label: "Tous" }, ...subtypes].map((s) => (
              <button
                key={s.id ?? "all"}
                type="button"
                aria-pressed={activeSubtype === s.id}
                onClick={() => setSubtype(s.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent",
                  activeSubtype === s.id
                    ? "border-primary bg-primary/10 font-semibold"
                    : "bg-card/60 text-muted-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Filtres par caractéristique minimale */}
        <div className="grid gap-2 rounded-lg border bg-background/40 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              Filtres
            </span>
            {QUICK_STATS.map((stat) => (
              <button
                key={stat}
                type="button"
                aria-pressed={hasFilter(stat)}
                onClick={() => toggleFilter(stat)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent",
                  hasFilter(stat)
                    ? "border-primary bg-primary/10 font-semibold"
                    : "bg-card/60 text-muted-foreground",
                )}
              >
                <StatIcon stat={stat} className="size-3.5" />
                {STATS[stat]}
              </button>
            ))}
            <select
              value=""
              onChange={(e) => e.target.value && toggleFilter(e.target.value as StatKey)}
              aria-label="Autre caractéristique"
              className="h-7 rounded-full border border-input bg-background px-2 text-xs text-muted-foreground"
            >
              <option value="">Autre…</option>
              {otherStats.map((k) => (
                <option key={k} value={k} disabled={hasFilter(k)}>
                  {STATS[k]}
                </option>
              ))}
            </select>
          </div>
          {filters.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <li
                  key={f.stat}
                  className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 py-1 pr-1 pl-2 text-sm"
                >
                  <StatIcon stat={f.stat} className="size-3.5" />
                  <span>{STATS[f.stat]}</span>
                  <span className="text-muted-foreground">≥</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={f.min}
                    placeholder="1"
                    aria-label={`Minimum de ${STATS[f.stat]}`}
                    onChange={(e) =>
                      setFilters((list) =>
                        list.map((x) => (x.stat === f.stat ? { ...x, min: e.target.value } : x)),
                      )
                    }
                    className={cn(
                      "h-6 w-14 rounded border border-input bg-background px-1.5 text-right tabular-nums",
                      NO_SPIN,
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => toggleFilter(f.stat)}
                    aria-label={`Retirer le filtre ${STATS[f.stat]}`}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setFilters([])}
                  className="h-full px-1 text-xs text-primary hover:underline"
                >
                  Tout retirer
                </button>
              </li>
            </ul>
          )}
        </div>

        <div
          className="-mx-2 max-h-[60svh] min-h-40 overflow-y-auto px-2"
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
            <ul
              className={cn(
                "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                status === "loading" && "opacity-60",
              )}
            >
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item)}
                    className={cn(
                      "flex h-full w-full flex-col gap-2 rounded-lg border bg-card/70 p-3 text-left transition-colors hover:border-gold/50 hover:bg-accent",
                      current?.id === item.id && "border-primary",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <ItemIcon item={item} className="size-11 shrink-0" />
                      <div className="min-w-0 leading-tight">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Niv. {item.level} · {item.type}
                        </p>
                        {item.set && <p className="truncate text-xs text-gold">{item.set.name}</p>}
                      </div>
                    </div>
                    <EffectList item={item} className="text-[0.8rem]" />
                    {item.conditions && (
                      <p className="mt-auto text-xs text-muted-foreground">
                        Conditions : {conditionsText(item.conditions)}
                      </p>
                    )}
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
