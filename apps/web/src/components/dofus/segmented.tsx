"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Précision affichée sous le groupe quand l'option est choisie. */
  help?: string;
}

/**
 * Choix unique en un seul bloc (segments côte à côte), le segment choisi
 * ressort sur un fond clair. La précision du choix courant s'affiche dessous.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const help = options.find((o) => o.value === value)?.help;
  return (
    <div className={cn("grid content-start gap-1", className)}>
      <span className="text-sm font-medium">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex w-fit gap-0.5 rounded-lg border bg-muted/50 p-0.5"
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
                on
                  ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
      {help && <span className="text-xs text-muted-foreground">{help}</span>}
    </div>
  );
}
