import { FriendsSkeleton } from "@/components/friends/friends-panel";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader } from "@/components/page/page-header";

/** Pendant le chargement de la page Amis : cartes vides animées. */
export default function FriendsLoading() {
  return (
    <PageContainer className="max-w-[90rem] space-y-8">
      <PageHeader
        eyebrow="Communauté"
        title="Amis"
        description="Retrouvez vos amis, leurs demandes et leur présence en ligne."
        icon="friends"
      />
      <FriendsSkeleton />
    </PageContainer>
  );
}
