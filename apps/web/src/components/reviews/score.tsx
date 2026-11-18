import { GRADE_SCALE, REVIEW_CRITERIA, gradeLabel, type CriterionKey } from "@kenpai/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export const formatScore = (n: number) => numberFormat.format(n);

/** Couleur d'une note sur 10 : rouge si mauvaise, or si moyenne, vert si bonne. */
export function scoreTone(outOf10: number) {
  if (outOf10 < 5) return "text-destructive";
  if (outOf10 < 7) return "text-gold";
  return "text-primary";
}

function barTone(outOf10: number) {
  if (outOf10 < 5) return "bg-destructive";
  if (outOf10 < 7) return "bg-gold";
  return "bg-primary";
}

/** Note globale sur 100 avec son appréciation. */
export function TotalScore({
  total,
  size = "md",
  className,
}: {
  total: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (total === null) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Pas encore noté</p>;
  }
  return (
    <div className={cn("leading-tight", className)}>
      <p
        className={cn(
          "font-serif font-bold tabular-nums",
          scoreTone(total / 10),
          size === "lg" ? "text-5xl" : size === "md" ? "text-3xl" : "text-xl",
        )}
      >
        {formatScore(total)}
        <span className="text-[0.5em] font-semibold text-muted-foreground"> / 100</span>
      </p>
      <p className={cn("font-medium", size === "sm" ? "text-xs" : "text-sm")}>
        {gradeLabel(total / 10)}
      </p>
    </div>
  );
}

/**
 * Grille des critères (annexe 1). Sans `averages`, montre le poids de chaque
 * critère ; avec, montre la moyenne obtenue par le jeu.
 */
export function CriteriaGrid({ averages }: { averages?: Record<CriterionKey, number> | null }) {
  return (
    <ul className="grid gap-4">
      {REVIEW_CRITERIA.map((c) => {
        const avg = averages?.[c.key];
        const width = avg !== undefined ? avg * 10 : c.weight * 5;
        return (
          <li key={c.key}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-serif text-lg font-semibold">{c.label}</p>
                <p className="text-sm text-muted-foreground">{c.description}</p>
              </div>
              {avg !== undefined ? (
                <p className="shrink-0 text-right leading-tight">
                  <span className={cn("font-serif text-lg font-bold tabular-nums", scoreTone(avg))}>
                    {formatScore(avg)}
                  </span>
                  <span className="text-sm text-muted-foreground"> / 10</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatScore((avg / 10) * c.weight)} / {c.weight} pts
                  </span>
                </p>
              ) : (
                <Badge className="shrink-0">{c.weight} points</Badge>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  avg !== undefined ? barTone(avg) : "bg-primary/70",
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Annexe 2 : rappel des notes et de leur appréciation. */
export function GradeScaleReminder({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="rappel-bareme"
      className={cn("frame-gilded rounded-xl border bg-card/70 p-5", className)}
    >
      <h2 id="rappel-bareme" className="font-serif text-xl font-semibold">
        Rappel du barème
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Chaque critère est noté sur 10.</p>
      <table className="mt-3 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Note</th>
            <th>Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {GRADE_SCALE.map((g) => (
            <tr key={g.label} className="border-b last:border-0">
              <td
                className={cn(
                  "w-14 py-1.5 pr-3 text-right font-serif font-bold tabular-nums",
                  scoreTone(g.min),
                )}
              >
                {g.min === g.max ? g.min : `${g.min}–${g.max}`}
              </td>
              <td className="py-1.5">{g.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 rounded-md bg-gold-soft px-3 py-2 text-sm">
        <strong>Attention :</strong> un 10 doit être extrêmement rare. Il représente une réussite
        quasiment exemplaire dans son domaine.
      </p>
    </section>
  );
}
