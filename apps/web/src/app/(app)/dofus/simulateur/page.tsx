import type { Metadata } from "next";
import { resolveEntry } from "@kenpai/content";
import { StuffSimulatorLoader } from "@/components/dofus/stuff-simulator-loader";
import { PageContainer } from "@/components/page/page-container";
import { getCurrentUser } from "@/lib/session";

const entry = resolveEntry(["dofus", "simulateur"])!.entry;

export const metadata: Metadata = { title: entry.title, description: entry.description };

type Props = { searchParams: Promise<{ stuff?: string | string[] }> };

export default async function StuffSimulatorPage({ searchParams }: Props) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const stuff = Array.isArray(params.stuff) ? params.stuff[0] : params.stuff;
  return (
    <PageContainer className="max-w-[120rem] space-y-6">
      <StuffSimulatorLoader loggedIn={user !== null} initialBuildId={stuff} />
      <p className="text-xs text-muted-foreground">
        Données du jeu fournies par l&apos;API communautaire DofusDude. Dofus est une marque
        d&apos;Ankama ; ce simulateur n&apos;est pas affilié à Ankama.
      </p>
    </PageContainer>
  );
}
