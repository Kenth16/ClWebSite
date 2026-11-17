import type * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold-soft px-2 py-0.5 text-xs font-medium text-foreground/80",
        className,
      )}
      {...props}
    />
  );
}
