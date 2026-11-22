"use client";

import * as React from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import {
  ELEMENTS,
  SLOTS,
  STATS,
  mergeRotation,
  rotationDamage,
  type DofusElement,
  type SlotFamily,
  type StatKey,
  type StatTotals,
  type TurnSpell,
} from "@kenpai/shared";
import { cn } from "@/lib/utils";
import { StatIcon, statTone } from "./stat-icon";
import { RemoteIcon } from "./tags";

// ─── Données renvoyées par l'API pendant le calcul ─────────────────────────

export interface CellRange {
  pct: [number, number] | null;
  crit: [number, number] | null;
  cdPositive: boolean;
  upper: number | null;
}

export interface CellTrace extends CellRange {
  outcome: "relax" | "milp" | "split" | "cut" | "failed";
  found: number | null;
  relax: number | null;
  bound: number | null;
  ms: number;
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

export interface ExplainerState {
  phase: "queued" | "data" | "search" | "proof" | "done";
  trace: JobTrace | null;
  cells: CellTrace[];
  damage: number | null;
  upper: number | null;
  proven: boolean | null;
  elapsedMs: number;
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const range = (r: { min: number; max: number }) =>
  r.min === r.max ? fmt(r.min) : `${fmt(r.min)} – ${fmt(r.max)}`;

const OUTCOMES: Record<
  "relax" | "milp" | "failed" | "running",
  { label: string; help: string; className: string }
> = {
  relax: {
    label: "Écartée vite",
    help: "La relaxation continue (objets « fractionnés ») ne peut déjà pas battre le meilleur stuff.",
    className: "fill-muted-foreground/35",
  },
  milp: {
    label: "Écartée par preuve",
    help: "Le programme en nombres entiers a prouvé qu'aucun vrai stuff de cette zone ne fait mieux.",
    className: "fill-primary/55",
  },
  failed: {
    label: "Erreur du solveur",
    help: "Le solveur n'a pas conclu : la zone reste douteuse (le résultat ne sera pas « prouvé »).",
    className: "fill-destructive/70",
  },
  running: {
    label: "En cours",
    help: "Zone en train d'être calculée (une par fil de calcul).",
    className: "fill-gold/70 animate-pulse",
  },
};

/** Étape numérotée de l'explication, reliée à la suivante par une flèche. */
function Step({
  n,
  title,
  status,
  children,
  last,
}: {
  n: number;
  title: string;
  status: "todo" | "active" | "done";
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="grid gap-2">
      <div
        className={cn(
          "rounded-xl border p-3 transition-opacity",
          status === "todo" && "opacity-50",
          status === "active" && "border-gold/60 bg-gold-soft",
          status === "done" && "bg-card/70",
        )}
      >
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
              status === "done" && "border-primary bg-primary text-primary-foreground",
              status === "active" && "border-gold text-gold",
            )}
          >
            {n}
          </span>
          {title}
          {status === "active" && (
            <Loader2 className="size-3.5 animate-spin text-gold" aria-hidden="true" />
          )}
        </h3>
        {children}
      </div>
      {!last && <ArrowDown className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />}
    </li>
  );
}

// ─── 1. Sorts → barème unique ──────────────────────────────────────────────

function MergedSpells({ spells }: { spells: readonly TurnSpell[] }) {
  const merged = mergeRotation(spells);
  return (
    <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <ul className="grid gap-1">
        {spells.map(({ spell, grade }) => (
          <li
            key={spell.id}
            className="flex items-center gap-2 rounded-md border bg-background/50 px-2 py-1 text-xs"
          >
            <RemoteIcon src={spell.icon} className="size-6 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">{spell.name}</span>
            <span className="text-muted-foreground">{grade.apCost} PA</span>
            <span className="flex gap-1.5">
              {grade.lines.map((l, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex items-center gap-0.5 tabular-nums",
                    statTone(ELEMENTS[l.element].damage),
                  )}
                >
                  <StatIcon stat={ELEMENTS[l.element].damage} className="size-3" />
                  {range(l)}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center text-xs text-muted-foreground">
        <span className="hidden text-2xl md:block" aria-hidden="true">
          →
        </span>
        <ArrowDown className="size-5 md:hidden" aria-hidden="true" />
        additionnés
      </div>
      <div className="rounded-lg border border-gold/50 bg-background/60 p-2.5">
        <p className="text-sm font-semibold">Barème unique</p>
        <p className="text-xs text-muted-foreground">
          {merged.spells} sort{merged.spells > 1 ? "s" : ""} · {merged.lines} ligne
          {merged.lines > 1 ? "s" : ""} de dégâts · {merged.apCost} PA ·{" "}
          {fmt(merged.baseAverage, 1)} dégâts de base en moyenne
        </p>
        <table className="mt-1.5 w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-0.5 text-left font-normal">Élément</th>
              <th className="py-0.5 text-right font-normal">Lignes</th>
              <th className="py-0.5 text-right font-normal">Normal</th>
              <th className="py-0.5 text-right font-normal">Critique</th>
            </tr>
          </thead>
          <tbody>
            {merged.elements.map((e) => (
              <tr key={e.element} className={statTone(ELEMENTS[e.element].damage)}>
                <td className="py-0.5">
                  <span className="flex items-center gap-1">
                    <StatIcon stat={ELEMENTS[e.element].damage} className="size-3" />
                    {ELEMENTS[e.element].label}
                  </span>
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {e.lines}
                  {e.steal > 0 && (
                    <span className="text-muted-foreground"> (dont {e.steal} vol)</span>
                  )}
                </td>
                <td className="py-0.5 text-right tabular-nums">{range(e.normal)}</td>
                <td className="py-0.5 text-right tabular-nums">
                  {e.critical ? range(e.critical) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
          Chaque ligne est multipliée par (100 + caractéristique de son élément + puissance) / 100,
          puis reçoit les dommages fixes ; le % dommages s&apos;applique sur le tout. Le solveur
          maximise la somme.
        </p>
      </div>
    </div>
  );
}

// ─── 2. Entonnoir des objets ───────────────────────────────────────────────

function Funnel({ funnel }: { funnel: ItemFunnel }) {
  const considered = Object.values(funnel.byFamily).reduce((s, f) => s + (f?.considered ?? 0), 0);
  const kept = Object.values(funnel.byFamily).reduce((s, f) => s + (f?.kept ?? 0), 0);
  const bars = [
    { label: "Objets du jeu", value: funnel.total, className: "bg-muted-foreground/40" },
    { label: "Portables à ce niveau", value: considered, className: "bg-primary/45" },
    { label: "Candidats après tri", value: kept, className: "bg-gold/70" },
  ];
  const families = Object.entries(funnel.byFamily) as [
    SlotFamily,
    { considered: number; kept: number },
  ][];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="grid gap-1.5">
        {bars.map((b) => (
          <div
            key={b.label}
            className="grid grid-cols-[9.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
          >
            <span className="text-muted-foreground">{b.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", b.className)}
                style={{ width: `${Math.max(1, (b.value / Math.max(1, funnel.total)) * 100)}%` }}
              />
            </span>
            <span className="text-right font-semibold tabular-nums">{fmt(b.value)}</span>
          </div>
        ))}
        <p className="text-[0.7rem] text-muted-foreground">
          Écartés : {fmt(funnel.tooHigh)} de niveau trop élevé, {fmt(funnel.forbidden)} interdits
          (objets de MJ, Ankarton), {fmt(funnel.unwearable)} jamais portables (autre classe,
          condition impossible), {fmt(funnel.noSlot)} sans emplacement. Le tri retire ensuite les
          objets toujours battus par un autre du même emplacement, sans risque pour les conditions
          et les exigences.
        </p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-0.5 text-left font-normal">Emplacement</th>
            <th className="py-0.5 text-right font-normal">Portables</th>
            <th className="py-0.5 text-right font-normal">Candidats</th>
          </tr>
        </thead>
        <tbody>
          {families.map(([family, f]) => (
            <tr key={family} className="border-b last:border-0">
              <td className="py-0.5">{SLOTS.find((s) => s.family === family)?.label ?? family}</td>
              <td className="py-0.5 text-right tabular-nums text-muted-foreground">
                {fmt(f.considered)}
              </td>
              <td className="py-0.5 text-right font-semibold tabular-nums">{fmt(f.kept)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 4. Preuve : courbes et carte des cellules ─────────────────────────────

function ProofChart({ history }: { history: JobTrace["history"] }) {
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

function CellMap({
  cells,
  running,
}: {
  cells: readonly CellTrace[];
  running: readonly CellRange[];
}) {
  const main = (c: CellRange) => c.cdPositive;
  const leaves = cells.filter(
    (c) => main(c) && (c.outcome === "relax" || c.outcome === "milp" || c.outcome === "failed"),
  );
  const all = [...cells.filter(main), ...running.filter(main)];
  if (all.length === 0 || !all[0]!.pct) {
    return (
      <p className="text-xs text-muted-foreground">Aucune cellule calculée pour l&apos;instant.</p>
    );
  }
  const withCrit = all.some((c) => c.crit);
  const px = all.flatMap((c) => c.pct ?? []);
  const cx = all.flatMap((c) => c.crit ?? []);
  const x0 = Math.min(...px);
  const x1 = Math.max(...px) + 1;
  const y0 = withCrit ? Math.min(...cx) : 0;
  const y1 = withCrit ? Math.max(...cx) + 1 : 1;
  const W = 480;
  const H = withCrit ? 220 : 40;
  const rect = (c: CellRange) => {
    const [a, b] = c.pct!;
    const [ca, cb] = c.crit ?? [0, 0];
    return {
      x: ((a - x0) / (x1 - x0)) * W,
      width: Math.max(0.6, ((b + 1 - a) / (x1 - x0)) * W),
      y: withCrit ? H - ((cb + 1 - y0) / (y1 - y0)) * H : 0,
      height: withCrit ? Math.max(0.6, ((cb + 1 - ca) / (y1 - y0)) * H) : H,
    };
  };
  return (
    <figure className="grid gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={cn("w-full rounded-md border bg-muted/40", withCrit ? "h-56" : "h-10")}
        preserveAspectRatio="none"
        role="img"
        aria-label="Carte des zones explorées par le solveur"
      >
        {leaves.map((c, i) => (
          <rect
            key={i}
            {...rect(c)}
            className={cn(OUTCOMES[c.outcome as "relax"].className, "stroke-background")}
            strokeWidth={0.4}
          >
            <title>
              {`% dommages ${c.pct![0]}–${c.pct![1]}${c.crit ? ` · % critique ${c.crit[0]}–${c.crit[1]}` : ""} · ${OUTCOMES[c.outcome as "relax"].label}${c.relax !== null ? ` · relaxation ≤ ${fmt(c.relax)}` : ""}${c.found !== null ? ` · stuff trouvé ${fmt(c.found)}` : ""} · ${c.ms} ms`}
            </title>
          </rect>
        ))}
        {running.filter(main).map((c, i) => (
          <rect key={`r${i}`} {...rect(c)} className={OUTCOMES.running.className} />
        ))}
      </svg>
      <figcaption className="flex justify-between text-[0.7rem] text-muted-foreground tabular-nums">
        <span>
          % dommages {x0} → {x1 - 1}
          {withCrit && (
            <>
              {" "}
              (horizontal) · % critique {y0} → {y1 - 1} (vertical)
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

// ─── 5. Valeur d'un point de chaque caractéristique ────────────────────────

function Marginals({
  totals,
  spells,
  attack,
  critical,
}: {
  totals: StatTotals;
  spells: readonly TurnSpell[];
  attack: "ranged" | "melee";
  critical: boolean;
}) {
  const elements = [
    ...new Set(spells.flatMap((s) => s.grade.lines.map((l) => l.element))),
  ] as DofusElement[];
  const keys: StatKey[] = [
    ...elements.map((e) => ELEMENTS[e].stat as StatKey),
    "power",
    "damage",
    ...elements.map((e) => ELEMENTS[e].damage as StatKey),
    ...(critical ? (["critical", "criticalDamage"] as StatKey[]) : []),
    attack === "melee" ? "meleeDamagePct" : "rangedDamagePct",
    "spellDamagePct",
  ];
  const unique = [...new Set(keys)].filter((k) => k in STATS);
  const at = (extra: Partial<Record<StatKey, number>>) =>
    rotationDamage((k) => (totals[k] ?? 0) + (extra[k] ?? 0), spells, { attack, critical });
  const here = at({});
  const values = unique
    .map((k) => ({ k, value: (at({ [k]: 10 }) - here) / 10 }))
    .sort((a, b) => b.value - a.value);
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs">
      {values.map(({ k, value }) => (
        <li
          key={k}
          className="flex items-center gap-1 rounded-full border bg-background/50 px-2 py-0.5"
        >
          <StatIcon stat={k} className="size-3" />
          +1 {STATS[k]} = <span className="font-semibold tabular-nums">+{fmt(value, 2)}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Explication complète ──────────────────────────────────────────────────

export function OptimizerExplainer({
  state,
  spells,
  totals,
  attack,
  critical,
  ap,
}: {
  state: ExplainerState;
  spells: readonly TurnSpell[];
  totals: StatTotals | null;
  attack: "ranged" | "melee";
  critical: boolean;
  ap: number;
}) {
  const { phase, trace, cells } = state;
  const order = ["queued", "data", "search", "proof", "done"] as const;
  const at = order.indexOf(phase);
  const status = (step: (typeof order)[number]) =>
    at > order.indexOf(step) ? "done" : at === order.indexOf(step) ? "active" : "todo";
  const counts = { relax: 0, milp: 0, split: 0, cut: 0, failed: 0 };
  for (const c of cells) counts[c.outcome]++;

  return (
    <details open className="group rounded-xl border bg-card/50 p-4">
      <summary className="cursor-pointer font-medium">Ce que fait l&apos;optimiseur</summary>
      <ol className="mt-3 grid gap-2">
        <Step n={1} title="Les sorts choisis deviennent un seul barème" status="done">
          <MergedSpells spells={spells} />
        </Step>

        <Step n={2} title="Tri des objets" status={status("data")}>
          {trace?.funnel ? (
            <Funnel funnel={trace.funnel} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Chargement de tous les objets du jeu et de leurs conditions…
            </p>
          )}
        </Step>

        <Step n={3} title="Premier stuff (recherche rapide)" status={status("search")}>
          <p className="text-xs text-muted-foreground">
            Une recherche locale assemble vite un bon stuff qui respecte les exigences ({ap} PA au
            moins, conditions des objets). Il sert de référence : toute zone qui ne peut pas le
            battre sera écartée sans calcul.
          </p>
          {trace && trace.localDamage !== null && (
            <p className="mt-1 text-sm">
              Stuff de départ :{" "}
              <span className="font-semibold tabular-nums">{fmt(trace.localDamage)}</span> dégâts
            </p>
          )}
          {trace && trace.localDamage === null && phase !== "search" && phase !== "data" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun stuff de départ valable : le solveur part de zéro.
            </p>
          )}
        </Step>

        <Step
          n={4}
          title="Preuve : le solveur explore toutes les zones possibles"
          status={status("proof")}
        >
          <p className="mb-2 text-xs text-muted-foreground">
            Les dégâts dépendent du % dommages et du % critique du stuff, ce qui les rend non
            linéaires. L&apos;espace est découpé en zones (cellules) : dans chacune, le solveur
            HiGHS calcule un maximum garanti. Une zone qui ne peut pas battre le meilleur stuff est
            écartée ; sinon on y prend le stuff trouvé et on la coupe en deux. La preuve est finie
            quand plus aucune zone ne reste.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <ProofChart history={trace?.history ?? []} />
            <CellMap cells={cells} running={trace?.running ?? []} />
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground">
            {(["relax", "milp", "failed", "running"] as const).map((k) => (
              <li key={k} className="flex items-center gap-1" title={OUTCOMES[k].help}>
                <svg className="size-3" aria-hidden="true">
                  <rect width="12" height="12" className={OUTCOMES[k].className} />
                </svg>
                {OUTCOMES[k].label}
                {k !== "running" && <span className="tabular-nums">({fmt(counts[k])})</span>}
              </li>
            ))}
            <li className="tabular-nums">
              {fmt(counts.split)} coupée{counts.split > 1 ? "s" : ""} en deux · {fmt(counts.cut)}{" "}
              recommencée{counts.cut > 1 ? "s" : ""} sans le stuff déjà vu
            </li>
          </ul>
          {state.damage !== null && (
            <p className="mt-2 text-sm">
              Meilleur stuff :{" "}
              <span className="font-semibold tabular-nums">{fmt(state.damage)}</span>
              {state.upper !== null && state.upper > state.damage + 1e-6 && (
                <>
                  {" "}
                  · maximum encore imaginable{" "}
                  <span className="font-semibold tabular-nums">{fmt(state.upper)}</span>
                </>
              )}
            </p>
          )}
        </Step>

        <Step n={5} title="Résultat" status={phase === "done" ? "done" : "todo"} last>
          {phase !== "done" ? (
            <p className="text-xs text-muted-foreground">En attente de la fin de la preuve…</p>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm">
                {state.proven === null
                  ? "Le calcul s'est arrêté sans résultat (voir le message d'erreur)."
                  : state.proven
                    ? "Plus aucune zone ne peut faire mieux : le stuff est l'optimum prouvé."
                    : "Temps écoulé : des zones n'ont pas été vérifiées, le stuff n'est pas prouvé optimal."}
              </p>
              {totals && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Ce que rapporterait un point de plus de chaque caractéristique, sur ce stuff (en
                    dégâts sur le barème) :
                  </p>
                  <Marginals totals={totals} spells={spells} attack={attack} critical={critical} />
                </>
              )}
            </div>
          )}
        </Step>
      </ol>
    </details>
  );
}
