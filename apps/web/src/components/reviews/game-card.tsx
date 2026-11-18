import Link from "next/link";
import { Check, Gamepad2 } from "lucide-react";
import { gradeLabel, type GameSummary } from "@kenpai/shared";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { formatScore } from "./score";

/** Couleurs d'une note sur 100 : rouge, or ou vert. */
export function scoreColors(average: number | null) {
  if (average === null) return { bg: "bg-muted", text: "text-muted-foreground" };
  if (average < 50) return { bg: "bg-destructive", text: "text-destructive" };
  if (average < 70) return { bg: "bg-gold", text: "text-gold" };
  return { bg: "bg-primary", text: "text-primary" };
}

/** Image de couverture d'un jeu, ou une illustration neutre. */
export function GameCover({ src, className }: { src: string | null; className?: string }) {
  if (!src) {
    return (
      <span
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-muted to-accent text-muted-foreground",
          className,
        )}
        aria-hidden="true"
      >
        <Gamepad2 className="size-10" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images hébergées par RAWG
    <img
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      className={cn("object-cover", className)}
    />
  );
}

export function releaseYear(released: string | null) {
  return released ? released.slice(0, 4) : "À venir";
}

const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
export function timeAgo(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes > -1) return "à l'instant";
  if (minutes > -60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (days > -30) return rtf.format(days, "day");
  return rtf.format(Math.round(days / 30), "month");
}

/**
 * Carte d'un jeu : couverture sur un bandeau à la couleur de la note,
 * appréciation, nombre d'avis et note de la communauté.
 */
export function GameCard({ game, className }: { game: GameSummary; className?: string }) {
  const colors = scoreColors(game.average);
  const tags = [game.genres[0], releaseYear(game.released)].filter(Boolean) as string[];

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-28", colors.bg)} aria-hidden="true" />
      <div className="relative px-4 pt-4">
        <GameCover src={game.cover} className="aspect-[16/10] w-full rounded-lg shadow-sm" />
      </div>
      <div className="relative flex flex-1 flex-col px-4 pt-3 pb-4">
        <h3 className="line-clamp-2 font-serif text-xl font-semibold leading-tight">
          <Link
            href={`/avis-desastreux/${game.id}`}
            className="outline-none after:absolute after:inset-0"
          >
            {game.title}
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
          {game.reviewedByMe && (
            <li className="flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 text-xs text-primary">
              <Check className="size-3" aria-hidden="true" />
              Noté
            </li>
          )}
        </ul>

        <div className="mt-auto pt-4">
          <div className="border-t pt-3">
            <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Note de la commu
            </p>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {game.average !== null ? gradeLabel(game.average / 10) : "Pas encore noté"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {game.reviewCount === 0 ? "Aucun avis" : `Basé sur ${game.reviewCount} avis`}
                </p>
              </div>
              <span
                className={cn(
                  "flex size-16 shrink-0 items-center justify-center rounded-lg font-serif text-3xl font-bold text-background tabular-nums",
                  colors.bg,
                  game.average === null && "text-muted-foreground",
                )}
                aria-label={
                  game.average !== null ? `${formatScore(game.average)} sur 100` : "Non noté"
                }
              >
                {game.average !== null ? Math.round(game.average) : "—"}
              </span>
            </div>
            {game.lastReview && (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserAvatar avatar={game.lastReview.user.avatar} className="size-5" />
                <span className="truncate">
                  <strong className="font-medium text-foreground">
                    {game.lastReview.user.username}
                  </strong>{" "}
                  · {formatScore(game.lastReview.total)}/100 · {timeAgo(game.lastReview.at)}
                </span>
              </p>
            )}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", colors.bg)}
              style={{ width: `${game.average ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
