import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { ProfileCard } from "@/components/profile/profile-card";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?redirect=/profil");

  return (
    <PageContainer className="space-y-8">
      <ProfileCard user={user} />
      {/* Emplacement réservé aux futures fonctionnalités du profil. */}
      <EmptyState icon={Hourglass} title="D'autres sections arrivent">
        Votre profil s&apos;enrichira au fil des prochaines mises à jour de Kenpai.
      </EmptyState>
    </PageContainer>
  );
}
