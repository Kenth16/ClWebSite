import type { Metadata } from "next";
import Link from "next/link";
import { LogIn } from "lucide-react";
import type { GameSummary } from "@kenpai/shared";
import { PageContainer } from "@/components/page/page-container";
import { PageHeader, SectionTitle } from "@/components/page/page-header";
import { AddGameForm } from "@/components/reviews/add-game-form";
import { GamesList } from "@/components/reviews/games-list";
import { CriteriaGrid } from "@/components/reviews/score";
import { Button } from "@/components/ui/button";
import { getCurrentUser, serverApi } from "@/lib/session";

export const metadata: Metadata = {
  title: "Avis désastreux",
  description: "Notez les jeux vidéo selon une grille de dix critères, sur 100 points.",
};

export default async function DisastrousReviewsPage() {
  const [user, data] = await Promise.all([
    getCurrentUser(),
    serverApi<{ games: GameSummary[] }>("/games"),
  ]);

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow="Communauté"
        title="Avis désastreux"
        description="Notez les jeux vidéo selon dix critères pondérés : la note globale est sur 100."
        icon="reviews"
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="jeux-notes" className="min-w-0">
          <SectionTitle id="jeux-notes">Jeux évalués</SectionTitle>
          <GamesList games={data?.games ?? []} />
        </section>

        <aside className="space-y-8">
          {user ? (
            <AddGameForm />
          ) : (
            <div className="frame-gilded rounded-xl border bg-card/70 p-5">
              <p className="font-serif text-xl font-semibold">Donnez votre avis</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connectez-vous pour ajouter un jeu et le noter.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link href="/connexion?redirect=/avis-desastreux">
                  <LogIn aria-hidden="true" />
                  Se connecter
                </Link>
              </Button>
            </div>
          )}

          <section
            aria-labelledby="grille"
            className="frame-gilded rounded-xl border bg-card/70 p-5"
          >
            <h2 id="grille" className="font-serif text-xl font-semibold">
              Grille de notation
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Total : 100 points.</p>
            <CriteriaGrid />
          </section>
        </aside>
      </div>
    </PageContainer>
  );
}
