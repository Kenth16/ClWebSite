"use client";

import dynamic from "next/dynamic";

/**
 * Le stuff en cours est lu depuis le navigateur : le simulateur n'est donc
 * rendu que côté client.
 */
export const StuffSimulatorLoader = dynamic(
  () => import("./stuff-simulator").then((m) => m.StuffSimulator),
  {
    ssr: false,
    loading: () => (
      <p className="rounded-xl border bg-card/70 p-6 text-center text-muted-foreground">
        Chargement du simulateur…
      </p>
    ),
  },
);
