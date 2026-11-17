"use client";

/**
 * Système de barre latérale.
 *
 * - Ordinateur / tablette : barre repliable (libellés + icônes ↔ icônes seules).
 *   L'état est mémorisé dans un cookie pour être rendu sans clignotement.
 * - Téléphone : la barre devient un panneau glissant ouvert par le bouton d'en-tête.
 * - Raccourci clavier : Ctrl+B (⌘+B sur Mac).
 */

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { SIDEBAR_COOKIE } from "@/lib/constants";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MOBILE_QUERY = "(max-width: 767px)";

interface SidebarContextValue {
  /** Barre déployée (ordinateur / tablette). */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Panneau ouvert (téléphone). */
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggle: () => void;
  /** Vrai quand seules les icônes sont visibles. */
  collapsed: boolean;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar doit être utilisé dans <SidebarProvider>.");
  return ctx;
}

function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(MOBILE_QUERY);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export function SidebarProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [open, setOpenState] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  const toggle = React.useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "b" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggle,
      collapsed: !isMobile && !open,
    }),
    [open, setOpen, openMobile, isMobile, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div className="flex min-h-svh w-full">{children}</div>
    </SidebarContext.Provider>
  );
}

/** Conteneur de la barre latérale : fixe sur ordinateur, panneau sur mobile. */
export function Sidebar({ children, label }: { children: React.ReactNode; label: string }) {
  const { isMobile, openMobile, setOpenMobile, collapsed } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent aria-label={label}>
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <SheetDescription className="sr-only">Navigation principale du site</SheetDescription>
          <div className="flex h-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label={label}
      data-state={collapsed ? "collapsed" : "expanded"}
      className={cn(
        "group/sidebar sticky top-0 hidden h-svh shrink-0 flex-col overflow-hidden text-sidebar-foreground md:flex",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[var(--sidebar-width-icon)]" : "w-[var(--sidebar-width)]",
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden",
        collapsed && "overflow-y-hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const id = React.useId();
  return (
    <div role="group" aria-labelledby={id} className="relative flex flex-col p-2">
      <div
        id={id}
        className={cn(
          "flex h-8 items-center gap-2 px-2 text-xs font-medium text-sidebar-muted transition-opacity duration-200",
          collapsed && "pointer-events-none opacity-0",
        )}
      >
        {label}
      </div>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

/** Ajoute une infobulle au survol uniquement quand la barre est repliée. */
export function SidebarTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  const { collapsed } = useSidebar();
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Bouton d'ouverture / fermeture de la barre, placé dans l'en-tête. */
export function SidebarTrigger({ className }: { className?: string }) {
  const { toggle, isMobile, open, openMobile } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Replier la barre latérale" : "Déployer la barre latérale"}
          className={cn("-ml-1 text-muted-foreground hover:text-foreground", className)}
        >
          <PanelLeft />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {expanded ? "Replier" : "Déployer"} <kbd className="ml-1 font-sans opacity-70">Ctrl B</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** Panneau principal, à droite de la barre latérale. */
export function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      id="contenu"
      className={cn(
        "bg-sky relative flex min-h-svh min-w-0 flex-1 flex-col",
        "md:m-2 md:ml-0 md:min-h-[calc(100svh-1rem)] md:rounded-xl md:border md:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
