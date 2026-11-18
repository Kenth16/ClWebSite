import type { Metadata } from "next";
import { resolveEntry } from "@kenpai/content";
import { FallingOrbsGame } from "@/components/mental-math/falling-orbs-game";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";

const entry = resolveEntry(["calcul-mental"])!.entry;

export const metadata: Metadata = { title: entry.title, description: entry.description };

export default function MentalMathPage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow="Disciplines"
        title={entry.title}
        description={entry.description}
        icon={entry.icon}
      />
      <FallingOrbsGame />
    </PageContainer>
  );
}
