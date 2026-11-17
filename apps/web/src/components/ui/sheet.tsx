"use client";

import { Dialog as Primitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** Panneau glissant depuis la gauche (utilisé pour la navigation mobile). */
export const Sheet = Primitive.Root;
export const SheetTitle = Primitive.Title;
export const SheetDescription = Primitive.Description;

export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <Primitive.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-[var(--sidebar-width)] max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl outline-none",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=open]:duration-300",
          "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-200",
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
