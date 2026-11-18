"use client";

import * as React from "react";
import { Gamepad2, Search } from "lucide-react";
import type { GameSummary } from "@kenpai/shared";
import { EmptyState } from "@/components/page/empty-state";
import { Input } from "@/components/ui/input";
import { GameCard } from "./game-card";

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
        Choisissez un jeu dans le catalogue et donnez-lui sa note.
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
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((game) => (
            <li key={game.id}>
              <GameCard game={game} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
