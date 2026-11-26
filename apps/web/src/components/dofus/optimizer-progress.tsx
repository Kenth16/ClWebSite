"use client";

import type { SlotFamily } from "@kenpai/shared";

// ─── Données renvoyées par l'API pendant le calcul ─────────────────────────

export interface CellRange {
  pct: [number, number] | null;
  crit: [number, number] | null;
  cdPositive: boolean;
  upper: number | null;
}

export interface ItemFunnel {
  total: number;
  noSlot: number;
  tooHigh: number;
  forbidden: number;
  unwearable: number;
  byFamily: Partial<Record<SlotFamily, { considered: number; kept: number }>>;
}

export interface JobTrace {
  funnel: ItemFunnel | null;
  localDamage: number | null;
  history: [number, number | null, number | null][];
  running: CellRange[];
  cellCount: number;
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Courbe du calcul : meilleur stuff trouvé et maximum encore imaginable, dans le temps. */
export function ProofChart({ history }: { history: JobTrace["history"] }) {
  const points = history.filter(([, d]) => d !== null) as [number, number, number | null][];
  if (points.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">La courbe apparaît après quelques secondes.</p>
    );
  }
  const W = 480;
  const H = 150;
  const t1 = Math.max(1, points[points.length - 1]![0]);
  const best = points.map(([, d]) => d);
  const uppers = points.map(([, , u]) => u).filter((u): u is number => u !== null);
  const lo = Math.min(...best) * 0.98;
  // La première borne peut être très lâche : on la plafonne pour garder la courbe lisible.
  const final = best[best.length - 1]!;
  const hi = Math.max(final * 1.02, Math.min(Math.max(...uppers, final), final * 1.5));
  const x = (t: number) => (t / t1) * W;
  const y = (v: number) => H - ((Math.min(v, hi) - lo) / (hi - lo || 1)) * H;
  const path = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${x(points[i]![0]).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  return (
    <figure className="grid gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full overflow-visible"
        role="img"
        aria-label="Évolution du meilleur stuff et de la borne"
      >
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" />
        <polyline
          points={path(points.map(([, , u]) => u))}
          className="fill-none stroke-gold"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        <polyline points={path(best)} className="fill-none stroke-primary" strokeWidth={2.5} />
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-2 text-[0.7rem] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 bg-primary" /> meilleur stuff trouvé
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-gold" /> maximum encore
            imaginable
          </span>
        </span>
        <span className="tabular-nums">
          {fmt(lo)} – {fmt(hi)} dégâts · {fmt(t1 / 1000, 1)} s
        </span>
      </figcaption>
    </figure>
  );
}
