"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import type { CatalogGame } from "@kenpai/shared";
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
import { GameCover, releaseYear, scoreColors } from "./game-card";

/**
 * Choix d'un jeu dans le catalogue RAWG. Un jeu déjà présent ouvre sa fiche ;
 * sinon il est ajouté puis sa fiche s'ouvre pour le noter.
 */
export function CatalogPicker() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [games, setGames] = React.useState<CatalogGame[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = React.useState("");
  const [choosing, setChoosing] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        setStatus("loading");
        const params = new URLSearchParams({ q: query.trim(), page: String(page) });
        apiFetch<{ games: CatalogGame[]; hasMore: boolean }>(`/games/catalog?${params}`)
          .then((data) => {
            if (cancelled) return;
            setGames((list) => (page === 1 ? data.games : [...list, ...data.games]));
            setHasMore(data.hasMore);
            setStatus("idle");
          })
          .catch((e: unknown) => {
            if (cancelled) return;
            setError(e instanceof ApiError ? e.message : "Le catalogue est indisponible.");
            setStatus("error");
          });
      },
      page === 1 ? 350 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, page]);

  async function choose(game: CatalogGame) {
    if (game.gameId) {
      router.push(`/avis-desastreux/${game.gameId}#mon-avis`);
      return;
    }
    setChoosing(game.rawgId);
    try {
      const { game: added } = await apiFetch<{ game: { id: string } }>("/games", {
        method: "POST",
        body: { rawgId: game.rawgId },
      });
      router.push(`/avis-desastreux/${added.id}#mon-avis`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible d'ajouter ce jeu.");
      setStatus("error");
      setChoosing(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus aria-hidden="true" />
          Noter un jeu
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl gap-4">
        <div>
          <DialogTitle>Choisir un jeu</DialogTitle>
          <DialogDescription className="mt-1">
            Recherchez parmi des centaines de milliers de jeux, toutes plateformes confondues.
          </DialogDescription>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Titre du jeu (ex. Grand Theft Auto VI)…"
            aria-label="Titre du jeu"
            className="pl-9"
          />
        </div>
        {!query.trim() && (
          <p className="-mt-2 text-sm text-muted-foreground">Les jeux les plus populaires :</p>
        )}

        <div
          className="-mx-2 max-h-[60svh] min-h-48 overflow-y-auto px-2"
          aria-busy={status === "loading"}
        >
          {status === "error" ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : games.length === 0 && status === "loading" ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Recherche…
            </p>
          ) : games.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Aucun jeu trouvé.</p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {games.map((game) => {
                  const colors = scoreColors(game.average);
                  return (
                    <li key={game.rawgId}>
                      <button
                        type="button"
                        disabled={choosing !== null}
                        onClick={() => void choose(game)}
                        className="group flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-[border-color,box-shadow] hover:border-gold/50 hover:shadow-md disabled:opacity-60"
                      >
                        <span className="relative block">
                          <GameCover src={game.cover} className="aspect-[16/10] w-full" />
                          {game.average !== null && (
                            <span
                              className={cn(
                                "absolute top-2 right-2 rounded-md px-1.5 py-0.5 font-serif text-sm font-bold text-background shadow",
                                colors.bg,
                              )}
                            >
                              {Math.round(game.average)}
                            </span>
                          )}
                          {choosing === game.rawgId && (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
                            </span>
                          )}
                        </span>
                        <span className="flex flex-1 flex-col p-2.5">
                          <span className="line-clamp-2 font-medium leading-tight">
                            {game.title}
                          </span>
                          <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {releaseYear(game.released)}
                            {game.platforms.length > 0 &&
                              ` · ${game.platforms.slice(0, 3).join(", ")}`}
                          </span>
                          {game.reviewCount > 0 && (
                            <span className="mt-1 text-xs text-primary">
                              Déjà noté · {game.reviewCount} avis
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    disabled={status === "loading"}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {status === "loading" ? "Chargement…" : "Voir plus de jeux"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
