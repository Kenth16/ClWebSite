import type { Metadata } from "next";
import { resolveEntry } from "@kenpai/content";
import { StuffSimulatorLoader } from "@/components/dofus/stuff-simulator-loader";
import { PageContainer } from "@/components/page/page-container";

const entry = resolveEntry(["dofus", "simulateur"])!.entry;

export const metadata: Metadata = { title: entry.title, description: entry.description };

export default function StuffSimulatorPage() {
  return (
    <PageContainer className="max-w-[90rem] space-y-6">
      <StuffSimulatorLoader />
      <p className="text-xs text-muted-foreground">
        Données du jeu fournies par l&apos;API communautaire DofusDude. Dofus est une marque
        d&apos;Ankama ; ce simulateur n&apos;est pas affilié à Ankama.
      </p>
    </PageContainer>
  );
}
