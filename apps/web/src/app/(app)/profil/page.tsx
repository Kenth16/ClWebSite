import type { Metadata } from "next";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";

export const metadata: Metadata = { title: "Profil" };

export default function Page() {
  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow="Communauté"
        title="Profil"
        description="Votre espace personnel sur Kenpai."
        icon="profile"
      />
      <EmptyState icon={Hourglass} title="Rubrique en construction">
        Cette rubrique sera disponible avec l&apos;ouverture des comptes.
      </EmptyState>
    </PageContainer>
  );
}
