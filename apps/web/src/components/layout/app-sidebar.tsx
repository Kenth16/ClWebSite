"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Collapsible } from "radix-ui";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { catalog } from "@kenpai/content";
import type { SessionUser } from "@kenpai/shared";
import { icons } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarTooltip,
  useSidebar,
} from "./sidebar";
import { NavAccount } from "./nav-account";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: { href: string; label: string }[];
}

const disciplines: NavLink[] = catalog.map((entry) => ({
  href: `/${entry.slug}`,
  label: entry.title,
  icon: icons[entry.icon],
  children: entry.children?.map((child) => ({
    href: `/${entry.slug}/${child.slug}`,
    label: child.title,
  })),
}));

const general: NavLink[] = [{ href: "/", label: "Accueil", icon: icons.home }];

const community: NavLink[] = [
  { href: "/amis", label: "Amis", icon: icons.friends },
  { href: "/avis-desastreux", label: "Avis désastreux", icon: icons.reviews },
  { href: "/profil", label: "Profil", icon: icons.profile },
];

function isWithin(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const itemClass =
  "flex h-9 min-w-0 items-center gap-2.5 rounded-md px-[11px] text-[0.95rem] outline-none transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function NavItem({ item }: { item: NavLink }) {
  const pathname = usePathname();
  const { collapsed, setOpenMobile } = useSidebar();
  const within = isWithin(pathname, item.href);
  const exact = pathname === item.href;
  const [open, setOpen] = React.useState(within);
  const [wasWithin, setWasWithin] = React.useState(within);

  // Ouvre automatiquement la section quand on y navigue.
  if (within !== wasWithin) {
    setWasWithin(within);
    if (within) setOpen(true);
  }

  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={() => setOpenMobile(false)}
      aria-current={exact ? "page" : undefined}
      className={cn(
        itemClass,
        "flex-1",
        exact && "bg-sidebar-accent font-medium shadow-[inset_2px_0_0_var(--gold)]",
        within && !exact && "font-medium",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span
        className={cn(
          "truncate transition-opacity duration-200",
          collapsed && "pointer-events-none opacity-0",
        )}
      >
        {item.label}
      </span>
    </Link>
  );

  if (!item.children || collapsed) {
    return (
      <li>
        <SidebarTooltip label={item.label}>{link}</SidebarTooltip>
      </li>
    );
  }

  return (
    <Collapsible.Root asChild open={open} onOpenChange={setOpen}>
      <li>
        <div className="flex items-center gap-0.5">
          {link}
          <Collapsible.Trigger
            className={cn(
              itemClass,
              "size-9 justify-center px-0 text-sidebar-muted hover:text-sidebar-foreground",
            )}
            aria-label={`${open ? "Masquer" : "Afficher"} les rubriques : ${item.label}`}
          >
            <ChevronRight
              className={cn("size-4 transition-transform duration-200", open && "rotate-90")}
              aria-hidden="true"
            />
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <ul className="ml-[19px] mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2.5">
            {item.children.map((child) => {
              const active = isWithin(pathname, child.href);
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    onClick={() => setOpenMobile(false)}
                    aria-current={pathname === child.href ? "page" : undefined}
                    className={cn(
                      itemClass,
                      "h-8 px-2 text-[0.9rem] text-sidebar-foreground/85",
                      active && "bg-sidebar-accent font-medium text-sidebar-foreground",
                    )}
                  >
                    <span className="truncate">{child.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Collapsible.Content>
      </li>
    </Collapsible.Root>
  );
}

function Brand() {
  const { collapsed, setOpenMobile } = useSidebar();
  return (
    <SidebarTooltip label="Kenpai — Accueil">
      <Link
        href="/"
        onClick={() => setOpenMobile(false)}
        className="flex h-12 items-center gap-3 rounded-lg px-[2px] outline-none focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Kenpai — retour à l'accueil"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1b1e29] text-gold shadow-sm ring-1 ring-gold/40">
          <LogoMark className="size-6" />
        </span>
        <span
          className={cn(
            "grid min-w-0 leading-tight transition-opacity duration-200",
            collapsed && "pointer-events-none opacity-0",
          )}
        >
          <span className="font-display text-[1.05rem] font-semibold tracking-wide">Kenpai</span>
          <span className="truncate text-xs text-sidebar-muted">Académie des savoirs</span>
        </span>
      </Link>
    </SidebarTooltip>
  );
}

export function AppSidebar({ user }: { user: SessionUser | null }) {
  return (
    <Sidebar label="Navigation principale">
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Rubriques" className="contents">
          <SidebarGroup label="Général">
            {general.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </SidebarGroup>
          <SidebarGroup label="Disciplines">
            {disciplines.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </SidebarGroup>
          <SidebarGroup label="Communauté">
            {community.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <NavAccount user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
