import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="contenu"
      className="bg-sky flex min-h-svh flex-col items-center justify-center px-4 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-gold-soft text-gold">
        <Compass className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-3xl font-semibold">Ce chemin ne mène nulle part</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Revenir à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
