import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LogIn, MessageSquareText } from "lucide-react";
import type { GameDetail } from "@kenpai/shared";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { SectionTitle } from "@/components/page/page-header";
import { GameCover } from "@/components/reviews/game-card";
import { ReviewForm } from "@/components/reviews/review-form";
import { ReviewList } from "@/components/reviews/review-list";
import { CriteriaGrid, GradeScaleReminder, TotalScore } from "@/components/reviews/score";
import { Button } from "@/components/ui/button";
import { getCurrentUser, serverApi } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

const loadGame = (id: string) => serverApi<GameDetail>(`/games/${encodeURIComponent(id)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadGame((await params).id);
  return { title: data ? `${data.game.title} — Avis désastreux` : "Avis désastreux" };
}

export default async function GamePage({ params }: Props) {
  const { id } = await params;
  const [user, data] = await Promise.all([getCurrentUser(), loadGame(id)]);
  if (!data) notFound();

  return (
    <PageContainer className="space-y-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/avis-desastreux">
            <ArrowLeft aria-hidden="true" />
            Tous les jeux
          </Link>
        </Button>
        <header className="frame-gilded flex flex-col gap-5 rounded-2xl border bg-card/70 p-5 sm:p-6 md:flex-row md:items-center">
          <GameCover
            src={data.game.cover}
            className="aspect-[16/10] w-full shrink-0 rounded-xl shadow-sm md:w-72"
          />
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="rune" aria-hidden="true" />
              Avis désastreux
            </p>
            <h1 className="text-3xl font-semibold break-words sm:text-4xl">{data.game.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.game.released
                ? `Sorti le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(data.game.released))}`
                : "Date de sortie à venir"}
              {data.game.platforms.length > 0 && ` · ${data.game.platforms.join(", ")}`}
            </p>
            {data.game.genres.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {data.game.genres.map((g) => (
                  <li
                    key={g}
                    className="rounded border border-input px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {g}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-muted-foreground">
              {data.reviewCount === 0
                ? "Aucun avis pour l'instant"
                : `Moyenne de ${data.reviewCount} avis`}
            </p>
          </div>
          <TotalScore total={data.average} size="lg" className="shrink-0 sm:text-right" />
        </header>
      </div>

      {data.criteriaAverages && (
        <section aria-labelledby="moyennes">
          <SectionTitle id="moyennes">Notes moyennes par critère</SectionTitle>
          <div className="rounded-xl border bg-card/70 p-5">
            <CriteriaGrid averages={data.criteriaAverages} />
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section id="mon-avis" aria-labelledby="mon-avis-titre" className="min-w-0 scroll-mt-20">
          <SectionTitle id="mon-avis-titre">
            {data.myReview ? "Mon évaluation" : "Évaluer ce jeu"}
          </SectionTitle>
          {user ? (
            <ReviewForm gameId={data.game.id} existing={data.myReview} />
          ) : (
            <EmptyState
              icon={LogIn}
              title="Connectez-vous pour noter ce jeu"
              action={
                <Button asChild>
                  <Link href={`/connexion?redirect=/avis-desastreux/${data.game.id}`}>
                    <LogIn aria-hidden="true" />
                    Se connecter
                  </Link>
                </Button>
              }
            />
          )}
        </section>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <GradeScaleReminder />
        </aside>
      </div>

      <section aria-labelledby="avis-membres">
        <SectionTitle id="avis-membres">Avis des membres</SectionTitle>
        {data.reviews.length === 0 ? (
          <EmptyState icon={MessageSquareText} title="Aucun avis pour l'instant">
            Soyez le premier à évaluer {data.game.title}.
          </EmptyState>
        ) : (
          <ReviewList reviews={data.reviews} />
        )}
      </section>
    </PageContainer>
  );
}
