import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import type { DofusBuildSummary } from "@kenpai/shared";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { DofusBuilds } from "@/components/profile/dofus-builds";
import { ProfileCard } from "@/components/profile/profile-card";
import { getCurrentUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?redirect=/profil");
  const builds = await serverApi<{ builds: DofusBuildSummary[] }>("/dofus/builds");

  return (
    <PageContainer className="space-y-8">
      <ProfileCard user={user} />
      <DofusBuilds builds={builds?.builds ?? []} />
      {/* Emplacement réservé aux futures fonctionnalités du profil. */}
      <EmptyState icon={Hourglass} title="D'autres sections arrivent">
        Votre profil s&apos;enrichira au fil des prochaines mises à jour de Kenpai.
      </EmptyState>
    </PageContainer>
  );
}
