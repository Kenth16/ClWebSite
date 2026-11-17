import Link from "next/link";
import { LogoMark } from "@/components/logo";

/** Mise en page des écrans d'authentification : centrée, sans barre latérale. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="contenu"
      className="bg-sky flex min-h-svh flex-col items-center justify-center px-4 py-10"
    >
      <Link
        href="/"
        className="mb-8 flex items-center gap-3 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-[#1b1e29] text-gold ring-1 ring-gold/40">
          <LogoMark className="size-6" />
        </span>
        <span className="font-display text-xl font-semibold tracking-wide">Kenpai</span>
      </Link>
      <div className="frame-gilded w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
