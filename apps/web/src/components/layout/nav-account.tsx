"use client";

import Link from "next/link";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SidebarTooltip, useSidebar } from "./sidebar";

/**
 * Zone de compte, en bas de la barre latérale.
 * Visiteur : accès à la connexion et à l'inscription.
 * (L'affichage de l'utilisateur connecté — avatar, nom, menu — arrive avec
 * l'authentification.)
 */
export function NavAccount() {
  const { collapsed, setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);

  if (collapsed) {
    return (
      <SidebarTooltip label="Se connecter">
        <Link
          href="/connexion"
          onClick={close}
          aria-label="Se connecter"
          className="mx-auto flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <LogIn className="size-4" aria-hidden="true" />
        </Link>
      </SidebarTooltip>
    );
  }

  return (
    <div className={cn("frame-gilded rounded-lg bg-card/70 p-3")}>
      <p className="font-serif text-[0.95rem] font-medium">Rejoignez l&apos;académie</p>
      <p className="mt-0.5 text-sm text-sidebar-muted">Suivez vos progrès et retrouvez vos amis.</p>
      <div className="mt-3 grid gap-1.5">
        <Button asChild size="sm">
          <Link href="/connexion" onClick={close}>
            <LogIn aria-hidden="true" />
            Se connecter
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/inscription" onClick={close}>
            <UserPlus aria-hidden="true" />
            Créer un compte
          </Link>
        </Button>
      </div>
    </div>
  );
}
