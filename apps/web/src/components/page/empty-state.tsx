import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Message affiché quand il n'y a (encore) rien à montrer — jamais de fausses données. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-gold/35 bg-card/40 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-4 font-serif text-lg font-semibold">{title}</p>
      {children && (
        <div className="mt-1 max-w-md text-[0.95rem] text-muted-foreground">{children}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
