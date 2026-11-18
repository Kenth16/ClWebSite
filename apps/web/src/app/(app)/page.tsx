import Link from "next/link";
import { ArrowDown, Flame, History, LogIn, UserPlus } from "lucide-react";
import { catalog } from "@kenpai/content";
import { EntryCard } from "@/components/page/entry-card";
import { EmptyState } from "@/components/page/empty-state";
import { PageContainer } from "@/components/page/page-container";
import { SectionTitle } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { LatestReviews } from "@/components/reviews/latest-reviews";
import { getCurrentUser, serverApi } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { GameSummary, SessionUser } from "@kenpai/shared";

/** Disposition « mosaïque » : deux grandes cartes, puis trois plus petites. */
const layout = [
  "md:col-span-3",
  "md:col-span-3",
  "md:col-span-2",
  "md:col-span-2",
  "md:col-span-2",
];

export default async function HomePage() {
  const [user, latest] = await Promise.all([
    getCurrentUser(),
    serverApi<{ games: GameSummary[] }>("/games?reviewed=1&limit=4"),
  ]);
  return (
    <PageContainer className="space-y-12">
      <Hero user={user} />

      <LatestReviews games={latest?.games ?? []} />

      <section aria-labelledby="disciplines">
        <SectionTitle id="disciplines">Disciplines</SectionTitle>
        <div className="grid gap-4 md:grid-cols-6">
          {catalog.map((entry, i) => (
            <EntryCard
              key={entry.slug}
              entry={entry}
              href={`/${entry.slug}`}
              showChildren
              className={cn(layout[i] ?? "md:col-span-2")}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="populaires">
          <SectionTitle id="populaires">Activités populaires</SectionTitle>
          <EmptyState icon={Flame} title="Pas encore de classement">
            Les activités les plus jouées par la communauté apparaîtront ici dès les premières
            parties.
          </EmptyState>
        </section>
        <section aria-labelledby="recentes">
          <SectionTitle id="recentes">Vos dernières activités</SectionTitle>
          {user ? (
            <EmptyState icon={History} title="Aucune activité pour l'instant">
              Vos quiz, jeux et dictées apparaîtront ici dès vos premières parties.
            </EmptyState>
          ) : (
            <EmptyState
              icon={History}
              title="Retrouvez votre progression"
              action={
                <Button asChild>
                  <Link href="/connexion">
                    <LogIn aria-hidden="true" />
                    Se connecter
                  </Link>
                </Button>
              }
            >
              Connectez-vous pour reprendre vos activités là où vous les aviez laissées.
            </EmptyState>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function Hero({ user }: { user: SessionUser | null }) {
  return (
    <section
      aria-labelledby="bienvenue"
      className="frame-gilded relative overflow-hidden rounded-2xl border bg-card/70 px-6 py-10 sm:px-10 sm:py-12"
    >
      <Constellation className="pointer-events-none absolute -right-6 -top-4 hidden h-[115%] text-gold sm:block" />
      <div className="relative max-w-xl">
        <p className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold">
          <span className="rune" aria-hidden="true" />
          Académie des savoirs
        </p>
        <h1 id="bienvenue" className="mt-3 text-4xl font-semibold sm:text-5xl">
          {user ? `Bon retour, ${user.username}` : "Bienvenue à Kenpai"}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Apprenez, révisez et mesurez-vous entre amis. Géographie, histoire, français, calcul
          mental : chaque discipline cache ses propres épreuves.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="#disciplines">
              <ArrowDown aria-hidden="true" />
              Explorer les disciplines
            </a>
          </Button>
          {!user && (
            <Button asChild size="lg" variant="outline">
              <Link href="/inscription">
                <UserPlus aria-hidden="true" />
                Créer un compte
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Constellation décorative (dessin original). */
function Constellation({ className }: { className?: string }) {
  const stars: [number, number, number][] = [
    [40, 60, 2.2],
    [110, 30, 1.6],
    [170, 85, 2.6],
    [235, 50, 1.8],
    [290, 120, 2.2],
    [215, 170, 1.6],
    [140, 190, 2.4],
    [260, 230, 1.8],
    [320, 200, 1.4],
    [90, 140, 1.4],
  ];
  const path =
    "M40 60 L110 30 L170 85 L235 50 L290 120 L215 170 L140 190 M170 85 L215 170 L260 230 L320 200";
  return (
    <svg viewBox="0 0 360 260" aria-hidden="true" className={className}>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.28"
        strokeDasharray="3 5"
      />
      {stars.map(([x, y, r]) => (
        <g key={`${x}-${y}`} opacity="0.75">
          <circle cx={x} cy={y} r={r * 3} fill="currentColor" opacity="0.08" />
          <circle cx={x} cy={y} r={r} fill="currentColor" />
        </g>
      ))}
      <path
        d="M290 120 m0 -12 l2.2 9.8 l9.8 2.2 l-9.8 2.2 l-2.2 9.8 l-2.2 -9.8 l-9.8 -2.2 l9.8 -2.2 z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}
