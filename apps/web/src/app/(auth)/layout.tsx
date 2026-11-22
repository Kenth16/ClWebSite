import Link from "next/link";
import { LogoMark } from "@/components/logo";

/**
 * Mise en page des écrans d'authentification : une carte en deux colonnes,
 * le formulaire à gauche et un panneau décoratif (emblème rayonnant) à droite.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="contenu"
      className="bg-sky flex min-h-svh flex-col items-center justify-center px-4 py-10"
    >
      <div className="frame-gilded grid w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-lg md:max-w-4xl md:grid-cols-2">
        <div className="p-6 sm:p-10">
          <Link
            href="/"
            className="mx-auto mb-6 flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-ring md:hidden"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-[#1b1e29] text-gold ring-1 ring-gold/40">
              <LogoMark className="size-5" />
            </span>
            <span className="font-display text-lg font-semibold tracking-wide">Kenpai</span>
          </Link>
          {children}
        </div>
        <AuthArt />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">
          Retour à l&apos;accueil
        </Link>
      </p>
    </main>
  );
}

/** Panneau de droite : l'emblème de Kenpai au centre de rayons, sur fond nuit. */
function AuthArt() {
  const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <Link
      href="/"
      aria-label="Kenpai, retour à l'accueil"
      className="relative hidden flex-col items-center justify-center gap-6 overflow-hidden bg-[#1b1e29] p-10 text-gold outline-none focus-visible:outline-2 focus-visible:outline-ring md:flex"
    >
      <svg viewBox="-200 -200 400 400" aria-hidden="true" className="absolute inset-0 size-full">
        {rays.map((a, i) => (
          <line
            key={i}
            x1={Math.cos(a) * 70}
            y1={Math.sin(a) * 70}
            x2={Math.cos(a) * 190}
            y2={Math.sin(a) * 190}
            stroke="currentColor"
            strokeOpacity={i % 2 ? 0.12 : 0.22}
            strokeWidth={1}
          />
        ))}
        <circle r="120" fill="none" stroke="currentColor" strokeOpacity="0.14" />
        <circle
          r="70"
          fill="currentColor"
          fillOpacity="0.05"
          stroke="currentColor"
          strokeOpacity="0.25"
        />
      </svg>
      <span className="relative flex size-24 items-center justify-center rounded-full bg-[#1b1e29] ring-1 ring-gold/40">
        <LogoMark className="size-14" />
      </span>
      <span className="relative text-center">
        <span className="block font-display text-2xl font-semibold tracking-wide text-[#f3ead8]">
          Kenpai
        </span>
        <span className="mt-1 block text-sm text-[#f3ead8]/60">
          Apprendre, réviser et se mesurer entre amis.
        </span>
      </span>
    </Link>
  );
}
