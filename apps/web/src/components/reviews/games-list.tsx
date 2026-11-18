"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Gamepad2, Search } from "lucide-react";
import type { GameSummary } from "@kenpai/shared";
import { EmptyState } from "@/components/page/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TotalScore } from "./score";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function GamesList({ games }: { games: GameSummary[] }) {
  const [query, setQuery] = React.useState("");
  const filtered = games.filter((g) => normalize(g.title).includes(normalize(query.trim())));

  if (games.length === 0) {
    return (
      <EmptyState icon={Gamepad2} title="Aucun jeu évalué pour l'instant">
        Ajoutez le premier jeu et donnez-lui sa note.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un jeu…"
          aria-label="Rechercher un jeu"
          className="pl-9"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun jeu ne correspond à « {query} ».</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((game) => (
            <li key={game.id}>
              <article className="group relative flex h-full items-center gap-4 rounded-xl border bg-card/80 p-4 transition-[border-color,box-shadow] hover:border-gold/40 hover:shadow-md focus-within:border-gold/50">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-semibold">
                    <Link
                      href={`/avis-desastreux/${game.id}`}
                      className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-ring"
                    >
                      {game.title}
                    </Link>
                  </h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {game.reviewCount === 0 ? "Aucun avis" : `${game.reviewCount} avis`}
                    {game.reviewedByMe && (
                      <Badge>
                        <Check className="size-3" aria-hidden="true" />
                        Noté
                      </Badge>
                    )}
                  </p>
                </div>
                <TotalScore total={game.average} size="sm" className="shrink-0 text-right" />
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
