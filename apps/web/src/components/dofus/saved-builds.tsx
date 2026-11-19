"use client";

import * as React from "react";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import type { DofusBuild, DofusBuildSummary } from "@kenpai/shared";
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

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Liste des stuffs enregistrés sur le compte : ouvrir ou supprimer. */
export function SavedBuildsDialog({
  currentId,
  onOpen,
  onDeleted,
}: {
  currentId: string | undefined;
  onOpen: (build: DofusBuild) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [builds, setBuilds] = React.useState<DofusBuildSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    setConfirming(null);
    if (!next) return;
    setError(null);
    apiFetch<{ builds: DofusBuildSummary[] }>("/dofus/builds")
      .then(({ builds }) => setBuilds(builds))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Impossible de charger vos stuffs."),
      );
  }

  async function openBuild(id: string) {
    setBusy(id);
    try {
      const { build } = await apiFetch<{ build: DofusBuild }>(`/dofus/builds/${id}`);
      onOpen(build);
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible d'ouvrir ce stuff.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await apiFetch(`/dofus/builds/${id}`, { method: "DELETE" });
      setBuilds((list) => list?.filter((b) => b.id !== id) ?? null);
      onDeleted(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible de supprimer ce stuff.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderOpen aria-hidden="true" />
          Mes stuffs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <div>
          <DialogTitle>Mes stuffs</DialogTitle>
          <DialogDescription className="mt-1">
            Les stuffs enregistrés sur votre compte. Ils apparaissent aussi sur votre profil.
          </DialogDescription>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {builds === null && !error ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Chargement…
          </p>
        ) : builds?.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun stuff enregistré pour l&apos;instant.
          </p>
        ) : (
          <ul className="grid max-h-[60svh] gap-2 overflow-y-auto">
            {builds?.map((b) => (
              <li
                key={b.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-card/70 p-3",
                  b.id === currentId && "border-primary",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.name}
                    {b.id === currentId && (
                      <span className="ml-2 text-xs font-normal text-primary">ouvert</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Niveau {b.level} · {b.itemCount} objets ·{" "}
                    {dateFormat.format(new Date(b.updatedAt))}
                  </p>
                </div>
                {confirming === b.id ? (
                  <>
                    <Button
                      size="sm"
                      className="bg-destructive text-background hover:bg-destructive/90"
                      disabled={busy !== null}
                      onClick={() => void remove(b.id)}
                    >
                      Supprimer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Annuler
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void openBuild(b.id)}
                    >
                      {busy === b.id ? "…" : "Ouvrir"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Supprimer ${b.name}`}
                      title="Supprimer"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirming(b.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
