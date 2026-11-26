import type { Metadata } from "next";
import { resolveEntry } from "@kenpai/content";
import { StuffOptimizer } from "@/components/dofus/stuff-optimizer";
import { PageContainer } from "@/components/page/page-container";

const entry = resolveEntry(["dofus", "optimiseur"])!.entry;

export const metadata: Metadata = { title: entry.title, description: entry.description };

export default function StuffOptimizerPage() {
  return (
    <PageContainer className="max-w-[90rem] space-y-6">
      {/* Titre visible seulement des lecteurs d'écran : la page va droit au stuff. */}
      <h1 className="sr-only">{entry.title}</h1>
      <StuffOptimizer />
      <p className="text-xs text-muted-foreground">
        Données du jeu : DofusDude et DofusDB. Dofus est une marque d&apos;Ankama ; cet outil
        n&apos;est pas affilié à Ankama.
      </p>
    </PageContainer>
  );
}
