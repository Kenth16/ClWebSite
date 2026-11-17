import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "./breadcrumbs";
import { SidebarTrigger } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md md:rounded-t-xl">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 !h-4" />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
