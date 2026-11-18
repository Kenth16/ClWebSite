import Link from "next/link";
import { ArrowRight, ThumbsDown } from "lucide-react";
import type { GameSummary } from "@kenpai/shared";
import { EmptyState } from "@/components/page/empty-state";
import { Button } from "@/components/ui/button";
import { GameCard } from "./game-card";

/** Encadré de l'accueil : les jeux notés le plus récemment par la communauté. */
export function LatestReviews({ games }: { games: GameSummary[] }) {
  return (
    <section
      aria-labelledby="derniers-avis"
      className="frame-gilded rounded-2xl border bg-card/50 p-5 sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-foreground/15 pb-3">
        <h2 id="derniers-avis" className="flex items-center gap-2.5 text-2xl font-semibold">
          <ThumbsDown className="size-5 text-gold" aria-hidden="true" />
          Derniers avis de la commu
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/avis-desastreux">
            Tous les avis
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {games.length === 0 ? (
        <EmptyState
          icon={ThumbsDown}
          title="Aucun avis pour l'instant"
          action={
            <Button asChild>
              <Link href="/avis-desastreux">Noter un jeu</Link>
            </Button>
          }
        >
          Soyez le premier à donner votre avis sur un jeu vidéo.
        </EmptyState>
      ) : (
        <ul className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
          {games.map((game) => (
            <li key={game.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
              <GameCard game={game} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
