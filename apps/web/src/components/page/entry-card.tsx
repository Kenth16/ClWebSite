import Link from "next/link";
import { ArrowRight, Hourglass } from "lucide-react";
import type { CatalogEntry } from "@kenpai/content";
import { CatalogIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Carte d'accès à une rubrique. Toute la carte est cliquable (lien étiré),
 * les sous-rubriques sont listées pour donner un aperçu du contenu.
 */
export function EntryCard({
  entry,
  href,
  showChildren = false,
  className,
}: {
  entry: CatalogEntry;
  href: string;
  showChildren?: boolean;
  className?: string;
}) {
  const children = showChildren ? entry.children : undefined;
  return (
    <article
      className={cn(
        "group frame-gilded relative flex flex-col rounded-xl border bg-card/80 p-5 transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-md focus-within:border-gold/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
          <CatalogIcon name={entry.icon} className="size-5" />
        </span>
        {entry.status === "in-progress" && (
          <Badge>
            <Hourglass className="size-3" aria-hidden="true" />
            En préparation
          </Badge>
        )}
      </div>
      <h3 className="mt-4 text-xl font-semibold">
        <Link
          href={href}
          className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-ring"
        >
          {entry.title}
        </Link>
      </h3>
      <p className="mt-1.5 text-[0.95rem] text-muted-foreground">{entry.description}</p>
      {children && children.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`Rubriques de ${entry.title}`}>
          {children.map((child) => (
            <li
              key={child.slug}
              className="rounded-md bg-muted px-2 py-0.5 text-sm text-foreground/80"
            >
              {child.title}
            </li>
          ))}
        </ul>
      )}
      <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-primary">
        Explorer
        <ArrowRight
          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </article>
  );
}
