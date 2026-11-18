import Link from "next/link";
import { ArrowRight, ThumbsDown } from "lucide-react";
import { gradeLabel, type LatestReview } from "@kenpai/shared";
import { EmptyState } from "@/components/page/empty-state";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { GameCover, releaseYear, scoreColors, timeAgo } from "./game-card";
import { formatScore } from "./score";

/**
 * Vignette d'un avis : le jeu, la personne qui l'a noté et sa note.
 * Deux avis sur un même jeu donnent deux vignettes.
 */
function ReviewCard({ review }: { review: LatestReview }) {
  const colors = scoreColors(review.total);
  const tags = [review.game.genres[0], releaseYear(review.game.released)].filter(
    Boolean,
  ) as string[];

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-[transform,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-ring hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("absolute inset-x-0 top-0 h-28", colors.bg)} aria-hidden="true" />
      <div className="relative px-4 pt-4">
        <GameCover src={review.game.cover} className="aspect-[16/10] w-full rounded-lg shadow-sm" />
      </div>
      <div className="relative flex flex-1 flex-col px-4 pt-3 pb-4">
        <h3 className="line-clamp-2 font-serif text-xl leading-tight font-semibold">
          <Link
            href={`/avis-desastreux/${review.game.id}`}
            className="outline-none after:absolute after:inset-0"
          >
            {review.game.title}
          </Link>
        </h3>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded border border-input px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
        {review.comment && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground italic">
            « {review.comment} »
          </p>
        )}

        <div className="mt-auto pt-4">
          <div className="border-t pt-3">
            <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              <UserAvatar avatar={review.user.avatar} className="size-5" />
              <span className="truncate">Avis de {review.user.username}</span>
            </p>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{gradeLabel(review.total / 10)}</p>
                <p className="text-sm text-muted-foreground">{timeAgo(review.at)}</p>
              </div>
              <span
                className={cn(
                  "flex size-16 shrink-0 items-center justify-center rounded-lg font-serif text-3xl font-bold text-background tabular-nums",
                  colors.bg,
                )}
                aria-label={`${formatScore(review.total)} sur 100`}
              >
                {Math.round(review.total)}
              </span>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", colors.bg)}
              style={{ width: `${review.total}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

/** Encadré de l'accueil : les derniers avis publiés par la communauté. */
export function LatestReviews({ reviews }: { reviews: LatestReview[] }) {
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
      {reviews.length === 0 ? (
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
          {reviews.map((review) => (
            <li key={review.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
              <ReviewCard review={review} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
