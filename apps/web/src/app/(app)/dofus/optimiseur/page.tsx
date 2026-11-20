import type { Metadata } from "next";
import { resolveEntry } from "@kenpai/content";
import { StuffOptimizer } from "@/components/dofus/stuff-optimizer";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";

const entry = resolveEntry(["dofus", "optimiseur"])!.entry;

export const metadata: Metadata = { title: entry.title, description: entry.description };

export default function StuffOptimizerPage() {
  return (
    <PageContainer className="max-w-[90rem] space-y-6">
      <PageHeader title={entry.title} description={entry.description} icon={entry.icon} />
      <StuffOptimizer />
      <p className="text-xs text-muted-foreground">
        Données du jeu : DofusDude et DofusDB. Dofus est une marque d&apos;Ankama ; cet outil
        n&apos;est pas affilié à Ankama.
      </p>
    </PageContainer>
  );
}
