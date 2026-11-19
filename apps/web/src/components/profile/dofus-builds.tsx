"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { buildMatchesTags, type BuildTags, type DofusBuildSummary } from "@kenpai/shared";
import { BuildTagFilter, BuildTagIcons, useBreeds } from "@/components/dofus/tags";
import { EmptyState } from "@/components/page/empty-state";
import { SectionTitle } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/** Section du profil : stuffs Dofus enregistrés depuis le simulateur, triables par tags. */
export function DofusBuilds({ builds }: { builds: DofusBuildSummary[] }) {
  const [filter, setFilter] = React.useState<BuildTags>({ elements: [], classes: [] });
  const tagged = builds.some((b) => b.tags.elements.length > 0 || b.tags.classes.length > 0);
  const { breeds } = useBreeds(tagged);
  const shown = builds.filter((b) => buildMatchesTags(b.tags, filter));

  return (
    <section aria-labelledby="mes-stuffs">
      <SectionTitle
        id="mes-stuffs"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dofus/simulateur">
              Simulateur
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        Mes stuffs Dofus
      </SectionTitle>
      {builds.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Aucun stuff enregistré"
          action={
            <Button asChild>
              <Link href="/dofus/simulateur">Composer un stuff</Link>
            </Button>
          }
        >
          Composez un équipement dans le simulateur puis cliquez sur « Enregistrer ».
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {builds.length > 1 && (
            <BuildTagFilter
              available={builds.map((b) => b.tags)}
              filter={filter}
              onChange={setFilter}
              breeds={breeds}
            />
          )}
          {shown.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucun stuff ne correspond à ces tags.
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/dofus/simulateur?stuff=${b.id}`}
                  className="group flex items-center gap-3 rounded-xl border bg-card/70 p-4 transition-colors hover:border-gold/50 hover:bg-accent"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Shield className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      Niveau {b.level} · {b.itemCount} objets
                    </span>
                    <BuildTagIcons tags={b.tags} breeds={breeds} className="mt-1" />
                    <span className="block text-xs text-muted-foreground">
                      Modifié le {dateFormat.format(new Date(b.updatedAt))}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
