import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hourglass } from "lucide-react";
import { allEntryPaths, resolveEntry } from "@kenpai/content";
import { EntryCard } from "@/components/page/entry-card";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";

/**
 * Page générique d'une rubrique du catalogue (ex. /histoire/france).
 * Quand une activité est développée, une route dédiée (ex. app/(app)/calcul-mental)
 * prend automatiquement le pas sur cette page.
 */

type Props = { params: Promise<{ path: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return allEntryPaths().map((path) => ({ path }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = resolveEntry((await params).path);
  return resolved ? { title: resolved.entry.title, description: resolved.entry.description } : {};
}

export default async function CatalogEntryPage({ params }: Props) {
  const { path } = await params;
  const resolved = resolveEntry(path);
  if (!resolved) notFound();

  const { entry, trail, href } = resolved;
  const parent = trail.at(-2);
  const parentHref = parent ? "/" + path.slice(0, -1).join("/") : "/";

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow={parent?.title ?? "Disciplines"}
        title={entry.title}
        description={entry.description}
        icon={entry.icon}
      />

      {entry.children && entry.children.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entry.children.map((child) => (
            <EntryCard key={child.slug} entry={child} href={`${href}/${child.slug}`} showChildren />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Hourglass}
          title="Contenu en préparation"
          action={
            <Button asChild variant="outline">
              <Link href={parentHref}>
                <ArrowLeft aria-hidden="true" />
                Retour {parent ? `à ${parent.title}` : "à l'accueil"}
              </Link>
            </Button>
          }
        >
          Cette rubrique est en cours de rédaction. Ses activités seront disponibles très bientôt.
        </EmptyState>
      )}
    </PageContainer>
  );
}
