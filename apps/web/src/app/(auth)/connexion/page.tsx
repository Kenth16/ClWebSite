import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Connexion" };

export default function Page() {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold">Se connecter</h1>
      <p className="mt-2 text-muted-foreground">
        Les comptes ouvrent très bientôt. Vous pourrez vous inscrire par e-mail ou avec Discord.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Retour à l&apos;accueil
        </Link>
      </Button>
    </div>
  );
}
