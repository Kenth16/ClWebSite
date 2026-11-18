import { REVIEW_CRITERIA, gradeLabel, type GameReview } from "@kenpai/shared";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { TotalScore, scoreTone } from "./score";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function ReviewList({ reviews }: { reviews: GameReview[] }) {
  return (
    <ul className="grid gap-4">
      {reviews.map((review) => (
        <li key={review.id}>
          <article className="rounded-xl border bg-card/70 p-5">
            <header className="flex items-center gap-3">
              <UserAvatar avatar={review.user.avatar} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{review.user.username}</p>
                <p className="text-sm text-muted-foreground">
                  {dateFormat.format(new Date(review.updatedAt))}
                  {review.updatedAt !== review.createdAt && " (modifié)"}
                </p>
              </div>
              <TotalScore total={review.total} size="sm" className="shrink-0 text-right" />
            </header>
            {review.comment && (
              <p className="mt-3 whitespace-pre-line break-words">{review.comment}</p>
            )}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Détail des notes
              </summary>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {REVIEW_CRITERIA.map((c) => {
                  const score = review.scores[c.key];
                  return (
                    <div key={c.key} className="flex justify-between gap-3 border-b py-1">
                      <dt className="truncate">{c.label}</dt>
                      <dd className="shrink-0 tabular-nums">
                        <span className={cn("font-semibold", scoreTone(score))}>{score}</span>
                        <span className="text-muted-foreground"> / 10 · {gradeLabel(score)}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </details>
          </article>
        </li>
      ))}
    </ul>
  );
}
