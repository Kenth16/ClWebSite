import type { Metadata } from "next";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";

export const metadata: Metadata = { title: "Amis" };

export default function Page() {
  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow="Communauté"
        title="Amis"
        description="Retrouvez vos amis, leurs demandes et leur présence en ligne."
        icon="friends"
      />
      <EmptyState icon={Hourglass} title="Rubrique en construction">
        Cette rubrique sera disponible très prochainement.
      </EmptyState>
    </PageContainer>
  );
}
