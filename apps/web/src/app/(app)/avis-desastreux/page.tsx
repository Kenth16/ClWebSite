import type { Metadata } from "next";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";

export const metadata: Metadata = { title: "Avis désastreux" };

export default function DisastrousReviewsPage() {
  return (
    <PageContainer className="space-y-8">
      <PageHeader eyebrow="Communauté" title="Avis désastreux" icon="reviews" />
      <EmptyState icon={Hourglass} title="Rubrique en construction">
        Cette rubrique sera disponible très prochainement.
      </EmptyState>
    </PageContainer>
  );
}
