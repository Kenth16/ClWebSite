"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogIn, LogOut, UserPlus, UserRound } from "lucide-react";
import { PRESENCE_HEARTBEAT_MS, type SessionUser } from "@kenpai/shared";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { SidebarTooltip, useSidebar } from "./sidebar";

/** Zone de compte, en bas de la barre latérale. */
export function NavAccount({ user }: { user: SessionUser | null }) {
  return user ? <NavUser user={user} /> : <NavGuest />;
}

function NavUser({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { collapsed, isMobile, setOpenMobile } = useSidebar();
  const [loggingOut, setLoggingOut] = React.useState(false);

  // Appels réguliers à l'API tant que la page est visible : le serveur note
  // la présence en ligne et prolonge la session (cookie renouvelé).
  React.useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/auth/me", { credentials: "same-origin" }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, PRESENCE_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setOpenMobile(false);
      router.push("/");
      router.refresh();
      setLoggingOut(false);
    }
  }

  return (
    <DropdownMenu>
      <SidebarTooltip label={user.username}>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-colors",
            "hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-sidebar-accent",
            collapsed && "justify-center",
          )}
          aria-label={`Compte de ${user.username}`}
        >
          <UserAvatar avatar={user.avatar} className="size-8" />
          <span
            className={cn(
              "grid min-w-0 flex-1 leading-tight transition-opacity duration-200",
              collapsed && "pointer-events-none hidden opacity-0",
            )}
          >
            <span className="truncate font-medium">{user.username}</span>
            <span className="truncate text-xs text-sidebar-muted">{user.email}</span>
          </span>
          {!collapsed && (
            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-muted" aria-hidden="true" />
          )}
        </DropdownMenuTrigger>
      </SidebarTooltip>
      <DropdownMenuContent
        side={isMobile ? "top" : "right"}
        align="end"
        sideOffset={8}
        className="w-60"
      >
        <DropdownMenuLabel className="flex items-center gap-2.5 p-1.5 font-normal text-foreground">
          <UserAvatar avatar={user.avatar} className="size-9" />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate font-medium">{user.username}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profil" onClick={() => setOpenMobile(false)}>
            <UserRound aria-hidden="true" />
            Mon profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={loggingOut}
          onSelect={(event) => {
            event.preventDefault();
            void logout();
          }}
        >
          <LogOut aria-hidden="true" />
          {loggingOut ? "Déconnexion…" : "Se déconnecter"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavGuest() {
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
    <div className="frame-gilded rounded-lg bg-card/70 p-3">
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
