import type { Metadata } from "next";
import { resolveEntry } from "@kenpai/content";
import { WorldMapQuiz } from "@/components/geography/world-map-quiz";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";

const entry = resolveEntry(["geographie", "pays"])!.entry;

export const metadata: Metadata = { title: entry.title, description: entry.description };

export default function CountriesPage() {
  return (
    <PageContainer className="max-w-[90rem] space-y-6">
      <PageHeader
        eyebrow="Géographie"
        title={entry.title}
        description={entry.description}
        icon={entry.icon}
      />
      <WorldMapQuiz />
    </PageContainer>
  );
}
