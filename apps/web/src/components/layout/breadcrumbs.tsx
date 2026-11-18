"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { resolveEntry } from "@kenpai/content";

interface Crumb {
  href: string;
  label: string;
}

/** Pages hors catalogue qui ont un libellé dans le fil d'Ariane. */
const staticPages: Record<string, string> = {
  "/": "Accueil",
  "/amis": "Amis",
  "/avis-desastreux": "Avis désastreux",
  "/profil": "Profil",
};

function crumbsFor(pathname: string): Crumb[] {
  const label = staticPages[pathname];
  if (label) return [{ href: pathname, label }];
  const segments = pathname.split("/").filter(Boolean);
  const resolved = resolveEntry(segments);
  if (!resolved) return [];
  return resolved.trail.map((entry, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: entry.title,
  }));
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Fil d'Ariane" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={crumb.href}
              className={`flex min-w-0 items-center gap-1.5 ${last ? "" : "hidden sm:flex"}`}
            >
              {last ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {crumb.label}
                </span>
              ) : (
                <>
                  <Link
                    href={crumb.href}
                    className="truncate text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                  <ChevronRight
                    className="size-3.5 shrink-0 text-muted-foreground/70"
                    aria-hidden="true"
                  />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
