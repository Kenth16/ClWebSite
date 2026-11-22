"use client";

import * as React from "react";
import { Tags } from "lucide-react";
import {
  BUILD_CLASS_TAGS_MAX,
  BUILD_ELEMENT_LABELS,
  BUILD_ELEMENT_TAGS,
  toggleElementTag,
  type BuildElementTag,
  type BuildTags,
  type DofusBreed,
  type StatKey,
} from "@kenpai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { StatIcon } from "./stat-icon";

// ─── Classes (DofusDB), chargées une seule fois pour toute la page ─────────

type BreedsState = { breeds: DofusBreed[] | null; error: string | null };
const EMPTY: BreedsState = { breeds: null, error: null };
let breedsState: BreedsState = EMPTY;
let breedsLoading = false;
const listeners = new Set<() => void>();

function loadBreeds() {
  if (breedsLoading || breedsState.breeds) return;
  breedsLoading = true;
  apiFetch<{ classes: DofusBreed[] }>("/dofus/classes")
    .then(({ classes }) => {
      breedsState = { breeds: classes, error: null };
    })
    .catch((e: unknown) => {
      breedsState = {
        breeds: null,
        error: e instanceof ApiError ? e.message : "Classes indisponibles.",
      };
      breedsLoading = false;
    })
    .finally(() => listeners.forEach((l) => l()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Liste des classes jouables (chargée quand `enabled` devient vrai). */
export function useBreeds(enabled = true): BreedsState {
  const state = React.useSyncExternalStore(
    subscribe,
    () => breedsState,
    () => EMPTY,
  );
  React.useEffect(() => {
    if (enabled) loadBreeds();
  }, [enabled]);
  return state;
}

/** Icône d'une image distante (DofusDB), ou un carré neutre. */
export function RemoteIcon({ src, className }: { src: string | null; className?: string }) {
  if (!src) return <span className={cn("rounded-md bg-muted", className)} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- images hébergées par DofusDB
  return <img src={src} alt="" loading="lazy" className={cn("object-contain", className)} />;
}

// ─── Éléments ──────────────────────────────────────────────────────────────

const ELEMENT_STAT: Record<Exclude<BuildElementTag, "multi">, StatKey> = {
  earth: "strength",
  fire: "intelligence",
  water: "chance",
  air: "agility",
};

/** Icône d'un tag d'élément ; « multi » réunit les quatre couleurs. */
export function ElementTagIcon({ tag, className }: { tag: BuildElementTag; className?: string }) {
  if (tag !== "multi") return <StatIcon stat={ELEMENT_STAT[tag]} className={className} />;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-4 shrink-0 rounded-full bg-[conic-gradient(var(--el-earth)_0_25%,var(--el-fire)_0_50%,var(--el-water)_0_75%,var(--el-air)_0)] ring-1 ring-border",
        className,
      )}
    />
  );
}

/** Choix d'éléments : boutons à bascule, « Multi » exclut les autres. */
export function ElementTagPicker({
  value,
  onChange,
  className,
  tags = BUILD_ELEMENT_TAGS,
}: {
  value: readonly BuildElementTag[];
  onChange: (value: BuildElementTag[]) => void;
  className?: string;
  /** Tags proposés (par défaut tous, « Multi » compris). */
  tags?: readonly BuildElementTag[];
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => {
        const on = value.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggleElementTag(value, tag))}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors hover:bg-accent",
              on
                ? "border-primary bg-primary/10 font-semibold"
                : "bg-card/60 text-muted-foreground",
            )}
          >
            <ElementTagIcon tag={tag} className="size-4" />
            {BUILD_ELEMENT_LABELS[tag]}
          </button>
        );
      })}
    </div>
  );
}

/** Choix de classes par leur icône (plusieurs possibles). */
export function ClassTagPicker({
  breeds,
  value,
  onChange,
  max = BUILD_CLASS_TAGS_MAX,
  className,
}: {
  breeds: DofusBreed[];
  value: readonly number[];
  onChange: (value: number[]) => void;
  max?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {breeds.map((b) => {
        const on = value.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={on}
            aria-label={b.name}
            title={b.name}
            disabled={!on && value.length >= max}
            onClick={() => onChange(on ? value.filter((id) => id !== b.id) : [...value, b.id])}
            className={cn(
              "rounded-lg border p-1 transition-colors hover:bg-accent disabled:opacity-40",
              on ? "border-primary bg-primary/10" : "bg-card/60 opacity-60 hover:opacity-100",
            )}
          >
            <RemoteIcon src={b.icon} className="size-8" />
          </button>
        );
      })}
    </div>
  );
}

/** Petites icônes des tags d'un stuff. */
export function BuildTagIcons({
  tags,
  breeds,
  className,
}: {
  tags: BuildTags;
  breeds: DofusBreed[] | null;
  className?: string;
}) {
  if (tags.elements.length === 0 && tags.classes.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {tags.elements.map((tag) => (
        <span key={tag} title={BUILD_ELEMENT_LABELS[tag]} className="flex">
          <ElementTagIcon tag={tag} className="size-4" />
          <span className="sr-only">{BUILD_ELEMENT_LABELS[tag]}</span>
        </span>
      ))}
      {tags.classes.map((id) => {
        const breed = breeds?.find((b) => b.id === id);
        return (
          <span key={id} title={breed?.name} className="flex">
            <RemoteIcon src={breed?.icon ?? null} className="size-5" />
            <span className="sr-only">{breed?.name ?? "Classe"}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Bouton « Tags » du simulateur : choisir les éléments et classes du stuff. */
export function BuildTagsEditor({
  tags,
  onChange,
}: {
  tags: BuildTags;
  onChange: (tags: BuildTags) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { breeds, error } = useBreeds();
  const empty = tags.elements.length === 0 && tags.classes.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9" aria-label="Tags du stuff">
          <Tags aria-hidden="true" />
          {empty ? "Tags" : <BuildTagIcons tags={tags} breeds={breeds} />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <div>
          <DialogTitle>Tags du stuff</DialogTitle>
          <DialogDescription className="mt-1">
            Ils servent à retrouver et trier vos stuffs enregistrés.
          </DialogDescription>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Éléments</legend>
          <ElementTagPicker
            value={tags.elements}
            onChange={(elements) => onChange({ ...tags, elements })}
          />
          <p className="text-xs text-muted-foreground">
            Plusieurs éléments possibles ; « Multi » remplace les autres.
          </p>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Classes</legend>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : breeds ? (
            <ClassTagPicker
              breeds={breeds}
              value={tags.classes}
              onChange={(classes) => onChange({ ...tags, classes })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Chargement des classes…</p>
          )}
        </fieldset>
        <Button onClick={() => setOpen(false)}>Terminé</Button>
      </DialogContent>
    </Dialog>
  );
}

/** Filtre de la liste des stuffs par tags (seules les classes utilisées sont proposées). */
export function BuildTagFilter({
  available,
  filter,
  onChange,
  breeds,
}: {
  available: BuildTags[];
  filter: BuildTags;
  onChange: (filter: BuildTags) => void;
  breeds: DofusBreed[] | null;
}) {
  const usedClasses = new Set(available.flatMap((t) => t.classes));
  const classes = breeds?.filter((b) => usedClasses.has(b.id)) ?? [];
  const active = filter.elements.length > 0 || filter.classes.length > 0;

  return (
    <div className="grid gap-2 rounded-lg border bg-background/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Trier par tags</p>
        {active && (
          <button
            type="button"
            onClick={() => onChange({ elements: [], classes: [] })}
            className="text-xs text-primary hover:underline"
          >
            Tout afficher
          </button>
        )}
      </div>
      <ElementTagPicker
        value={filter.elements}
        onChange={(elements) => onChange({ ...filter, elements })}
      />
      {classes.length > 0 && (
        <ClassTagPicker
          breeds={classes}
          value={filter.classes}
          onChange={(c) => onChange({ ...filter, classes: c })}
        />
      )}
    </div>
  );
}
