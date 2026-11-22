import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { FriendsOverview } from "@kenpai/shared";
import { FriendsPanel } from "@/components/friends/friends-panel";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";
import { getCurrentUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Amis" };

const empty: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?redirect=/amis");
  const initial = (await serverApi<FriendsOverview>("/friends")) ?? empty;

  return (
    <PageContainer className="max-w-[90rem] space-y-8">
      <PageHeader
        eyebrow="Communauté"
        title="Amis"
        description="Retrouvez vos amis, leurs demandes et leur présence en ligne."
        icon="friends"
      />
      <FriendsPanel initial={initial} />
    </PageContainer>
  );
}
